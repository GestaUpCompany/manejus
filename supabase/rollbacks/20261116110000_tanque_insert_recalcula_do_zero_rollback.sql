-- Rollback de 20261116110000_tanque_insert_recalcula_do_zero.sql
-- Restaura update_tanque_saldo_custo com o caminho incremental no INSERT
-- (versão de 20261113120000_fix_recalc_tanque_ordem_data.sql).
-- ATENÇÃO: reabilita o bug de entrada contada em dobro.

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
