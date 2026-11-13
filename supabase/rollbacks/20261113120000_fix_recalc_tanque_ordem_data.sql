-- Rollback de 20261113120000_fix_recalc_tanque_ordem_data.sql
-- Restaura as definições anteriores (ordem created_at e incremental no INSERT).

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
    ORDER BY created_at ASC, data ASC
  LOOP
    IF v_mov.tipo_movimentacao = 'entrada' THEN
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
      v_saldo := v_saldo - v_mov.quantidade_l;
    ELSIF v_mov.tipo_movimentacao = 'ajuste' THEN
      v_saldo := v_mov.quantidade_l;
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
BEGIN
  SELECT saldo_atual_l, custo_medio_l
  INTO v_saldo_atual, v_custo_medio_atual
  FROM public.tanques_combustivel
  WHERE id = COALESCE(NEW.tanque_id, OLD.tanque_id)
  FOR UPDATE;

  IF (TG_OP = 'DELETE') THEN
    PERFORM public.recalcular_custo_medio_tanque(OLD.tanque_id);
    RETURN OLD;
  END IF;

  IF (TG_OP = 'INSERT') THEN
    IF (NEW.tipo_movimentacao = 'entrada') THEN
      v_delta := NEW.quantidade_l;
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
      v_novo_saldo := v_saldo_atual + v_delta;
      UPDATE public.tanques_combustivel
      SET saldo_atual_l = v_novo_saldo
      WHERE id = NEW.tanque_id;
    ELSIF (NEW.tipo_movimentacao = 'ajuste') THEN
      UPDATE public.tanques_combustivel
      SET saldo_atual_l = NEW.quantidade_l
      WHERE id = NEW.tanque_id;
    END IF;
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    PERFORM public.recalcular_custo_medio_tanque(NEW.tanque_id);
    IF OLD.tanque_id IS DISTINCT FROM NEW.tanque_id THEN
      PERFORM public.recalcular_custo_medio_tanque(OLD.tanque_id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$function$;
