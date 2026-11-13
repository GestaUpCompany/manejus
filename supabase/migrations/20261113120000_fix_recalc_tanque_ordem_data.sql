-- Corrige o recálculo do saldo e do custo médio dos tanques de combustível.
--
-- Problema: recalcular_custo_medio_tanque ordenava por created_at e depois data.
-- Um ajuste retroativo (data antiga, criado depois) define saldo absoluto na
-- ordem de criação e apagava as movimentações anteriores a ele na ordem de criação.
-- Exemplo: Marcon, tanque de Diesel (ajuste de 08/11 criado em 12/11) ficou com -330 L
-- em vez de 3.414 L.
--
-- Correção:
-- 1) recalcular_custo_medio_tanque passa a ordenar por data e depois created_at,
--    a mesma ordem usada pelos relatórios e pela cadeia de saldo_anterior/posterior.
-- 2) update_tanque_saldo_custo, num INSERT de ajuste ou de movimentação retroativa
--    (há movimentação do mesmo tanque com data posterior), recalcula o tanque do zero
--    em vez de gravar saldo absoluto ou incremental.

CREATE OR REPLACE FUNCTION public.recalcular_custo_medio_tanque(p_tanque_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_saldo numeric(12,3) := 0;
  v_custo_medio numeric(12,4) := 0;
  v_mov record;
BEGIN
  FOR v_mov IN
    SELECT tipo_movimentacao, quantidade_l, preco_por_litro
    FROM public.movimentacoes_combustivel
    WHERE tanque_id = p_tanque_id
    ORDER BY data ASC, created_at ASC
  LOOP
    IF v_mov.tipo_movimentacao = 'entrada' THEN
      -- Quando saldo e <= 0 (negativo ou zero), a proxima entrada redefine o custo medio.
      -- Saldo negativo significa que o estoque foi consumido antes de registrar entrada;
      -- o custo anterior nao representa mais o estoque fisico atual.
      IF v_saldo <= 0 THEN
        v_custo_medio := COALESCE(v_mov.preco_por_litro, 0);
      ELSE
        v_custo_medio := ROUND(
          (v_saldo * v_custo_medio + v_mov.quantidade_l * COALESCE(v_mov.preco_por_litro, 0))
          / (v_saldo + v_mov.quantidade_l),
          4
        );
      END IF;
      v_saldo := v_saldo + v_mov.quantidade_l;
    ELSIF v_mov.tipo_movimentacao = 'baixa' THEN
      -- Permite saldo negativo: nao clampar com GREATEST(0, ...)
      v_saldo := v_saldo - v_mov.quantidade_l;
      -- custo_medio nao muda em baixas
    ELSIF v_mov.tipo_movimentacao = 'ajuste' THEN
      v_saldo := v_mov.quantidade_l;
      -- ajuste define saldo absoluto, nao altera custo medio
    END IF;
  END LOOP;

  UPDATE public.tanques_combustivel
  SET saldo_atual_l = v_saldo, custo_medio_l = v_custo_medio
  WHERE id = p_tanque_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_tanque_saldo_custo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_delta numeric(12,3);
  v_saldo_atual numeric(12,3);
  v_custo_medio_atual numeric(12,4);
  v_novo_saldo numeric(12,3);
  v_novo_custo_medio numeric(12,4);
  v_retroativa boolean;
BEGIN
  -- Buscar estado atual do tanque
  SELECT saldo_atual_l, custo_medio_l
  INTO v_saldo_atual, v_custo_medio_atual
  FROM public.tanques_combustivel
  WHERE id = COALESCE(NEW.tanque_id, OLD.tanque_id)
  FOR UPDATE;

  IF (TG_OP = 'DELETE') THEN
    -- Recalcular do zero apos remocao (WAC nao e invertivel sem historico)
    PERFORM public.recalcular_custo_medio_tanque(OLD.tanque_id);
    RETURN OLD;
  END IF;

  IF (TG_OP = 'INSERT') THEN
    -- Ajuste ou movimentacao com data anterior a outra ja existente no tanque:
    -- o incremental nao serve, recalcula na ordem de data.
    SELECT EXISTS (
      SELECT 1 FROM public.movimentacoes_combustivel m
      WHERE m.tanque_id = NEW.tanque_id AND m.id <> NEW.id AND m.data > NEW.data
    ) INTO v_retroativa;

    IF NEW.tipo_movimentacao = 'ajuste' OR v_retroativa THEN
      PERFORM public.recalcular_custo_medio_tanque(NEW.tanque_id);
      RETURN NEW;
    END IF;

    IF (NEW.tipo_movimentacao = 'entrada') THEN
      v_delta := NEW.quantidade_l;
      -- WAC: quando saldo <= 0, entrada redefine custo medio (saldo negativo = estoque reconciliado)
      IF v_saldo_atual <= 0 THEN
        v_novo_custo_medio := COALESCE(NEW.preco_por_litro, 0);
      ELSE
        v_novo_custo_medio := ROUND(
          (v_saldo_atual * v_custo_medio_atual + NEW.quantidade_l * COALESCE(NEW.preco_por_litro, 0))
          / (v_saldo_atual + NEW.quantidade_l),
          4
        );
      END IF;
      v_novo_saldo := v_saldo_atual + v_delta;
      UPDATE public.tanques_combustivel
      SET saldo_atual_l = v_novo_saldo, custo_medio_l = v_novo_custo_medio
      WHERE id = NEW.tanque_id;
    ELSIF (NEW.tipo_movimentacao = 'baixa') THEN
      v_delta := -NEW.quantidade_l;
      -- Permite saldo negativo: nao clampar
      v_novo_saldo := v_saldo_atual + v_delta;
      -- custo_medio nao muda em baixas
      UPDATE public.tanques_combustivel
      SET saldo_atual_l = v_novo_saldo
      WHERE id = NEW.tanque_id;
    END IF;
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    -- Recalcular do zero (simples e seguro para WAC)
    PERFORM public.recalcular_custo_medio_tanque(NEW.tanque_id);
    -- Se mudou de tanque, recalcular o antigo tambem
    IF OLD.tanque_id IS DISTINCT FROM NEW.tanque_id THEN
      PERFORM public.recalcular_custo_medio_tanque(OLD.tanque_id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$function$;
