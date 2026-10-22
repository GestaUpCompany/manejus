-- Rollback de 20261022120000_farmacia_baixa_valorizada.sql: volta recalcular_estoque_farmacia e update_estoque_farmacia
-- às definições de 20261021100000_farmacia_estoque.sql. As baixas já valorizadas mantêm custo/valor gravados
-- até o próximo recálculo; para zerá-los: UPDATE movimentacoes_farmacia SET custo_unitario = NULL, valor_total = NULL
-- WHERE tipo_movimentacao IN ('baixa','estorno') AND deleted_at IS NULL (só se a decisão for voltar ao comportamento anterior).

CREATE OR REPLACE FUNCTION public.recalcular_estoque_farmacia(p_medicamento_id uuid, p_fazenda_id uuid)
RETURNS void AS $$
DECLARE
  v_saldo numeric(12,3) := 0;
  v_custo numeric(12,4) := 0;
  v_mov record;
BEGIN
  FOR v_mov IN
    SELECT tipo_movimentacao, quantidade, custo_unitario
    FROM public.movimentacoes_farmacia
    WHERE medicamento_id = p_medicamento_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
    ORDER BY data, created_at, id
  LOOP
    IF v_mov.tipo_movimentacao = 'entrada' THEN
      IF v_saldo <= 0 THEN
        v_custo := COALESCE(v_mov.custo_unitario, v_custo, 0);
      ELSIF COALESCE(v_mov.custo_unitario, 0) > 0 THEN
        v_custo := ROUND(((v_saldo * v_custo) + (v_mov.quantidade * v_mov.custo_unitario)) / (v_saldo + v_mov.quantidade), 4);
      END IF;
      v_saldo := v_saldo + v_mov.quantidade;
    ELSIF v_mov.tipo_movimentacao IN ('baixa', 'estorno') THEN
      v_saldo := v_saldo - v_mov.quantidade;
    ELSIF v_mov.tipo_movimentacao = 'ajuste' THEN
      v_saldo := v_mov.quantidade;
    END IF;
  END LOOP;

  UPDATE public.medicamentos
  SET estoque_atual = v_saldo,
      custo_unitario = v_custo,
      custo_total_estoque = ROUND(v_saldo * v_custo, 2),
      updated_at = now()
  WHERE id = p_medicamento_id AND fazenda_id = p_fazenda_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_estoque_farmacia()
RETURNS trigger AS $$
BEGIN
  PERFORM public.recalcular_estoque_farmacia(COALESCE(NEW.medicamento_id, OLD.medicamento_id), COALESCE(NEW.fazenda_id, OLD.fazenda_id));
  IF TG_OP = 'UPDATE' AND (OLD.medicamento_id IS DISTINCT FROM NEW.medicamento_id OR OLD.fazenda_id IS DISTINCT FROM NEW.fazenda_id) THEN
    PERFORM public.recalcular_estoque_farmacia(OLD.medicamento_id, OLD.fazenda_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
