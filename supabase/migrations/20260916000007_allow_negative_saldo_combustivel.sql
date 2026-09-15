-- Permitir saldo negativo no estoque de combustivel.
-- Motivo: quando o cache do PWA esta stale e o operador abastece alem do saldo,
-- a trigger rejeitava com RAISE EXCEPTION e o INSERT inteiro de registros_abastecimento
-- sofria rollback, perdendo o registro de consumo. Saldo negativo preserva o
-- abastecimento e sinaliza que uma entrada de reconciliacao é necessaria.

-- ==================== Remover CHECK de saldo nao-negativo ====================
ALTER TABLE public.tanques_combustivel
  DROP CONSTRAINT IF EXISTS tanques_combustivel_saldo_atual_l_check;

-- ==================== Atualizar trigger de baixa automatica: remover RAISE EXCEPTION ====================
CREATE OR REPLACE FUNCTION public.baixa_automatica_abastecimento()
RETURNS TRIGGER AS $$
DECLARE
  v_saldo numeric(12,3);
  v_custo_medio numeric(12,4);
  v_mov_id uuid;
BEGIN
  -- So executa se tem tanque vinculado e ainda nao tem baixa
  IF NEW.tanque_id IS NULL OR NEW.baixa_estoque_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Lock do tanque na mesma transacao
  SELECT saldo_atual_l, custo_medio_l
  INTO v_saldo, v_custo_medio
  FROM public.tanques_combustivel
  WHERE id = NEW.tanque_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tanque % nao encontrado', NEW.tanque_id;
  END IF;

  -- Saldo negativo permitido: nao rejeitar, apenas registrar a baixa.
  -- O saldo ficara negativo e sinalizara necessidade de entrada de reconciliacao.

  -- Criar baixa automatica
  INSERT INTO public.movimentacoes_combustivel (
    fazenda_id, tanque_id, tipo_movimentacao, quantidade_l,
    preco_por_litro, data, origem, registro_abastecimento_id
  ) VALUES (
    NEW.fazenda_id, NEW.tanque_id, 'baixa', NEW.total_abastecido,
    v_custo_medio, NEW.data, 'auto_baixa', NEW.id
  )
  RETURNING id INTO v_mov_id;

  -- Vincular baixa ao abastecimento
  UPDATE public.registros_abastecimento
  SET baixa_estoque_id = v_mov_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public';

-- ==================== Atualizar funcao WAC: permitir saldo negativo ====================
CREATE OR REPLACE FUNCTION public.recalcular_custo_medio_tanque(p_tanque_id uuid)
RETURNS void AS $$
DECLARE
  v_saldo numeric(12,3) := 0;
  v_custo_medio numeric(12,4) := 0;
  v_mov record;
BEGIN
  FOR v_mov IN
    SELECT tipo_movimentacao, quantidade_l, preco_por_litro
    FROM public.movimentacoes_combustivel
    WHERE tanque_id = p_tanque_id
    ORDER BY created_at ASC, data ASC
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
$$ LANGUAGE plpgsql;

-- ==================== Atualizar trigger de saldo + custo: permitir negativo ====================
CREATE OR REPLACE FUNCTION public.update_tanque_saldo_custo()
RETURNS TRIGGER AS $$
DECLARE
  v_delta numeric(12,3);
  v_saldo_atual numeric(12,3);
  v_custo_medio_atual numeric(12,4);
  v_novo_saldo numeric(12,3);
  v_novo_custo_medio numeric(12,4);
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
    ELSIF (NEW.tipo_movimentacao = 'ajuste') THEN
      -- Ajuste define saldo absoluto, nao altera custo medio
      UPDATE public.tanques_combustivel
      SET saldo_atual_l = NEW.quantidade_l
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
$$ LANGUAGE plpgsql;
