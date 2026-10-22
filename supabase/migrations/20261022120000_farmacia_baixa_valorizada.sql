-- Baixas de farmácia (PWA, Enfermaria e saídas manuais) passam a carregar custo e valor.
--
-- Antes: o recálculo só atualizava saldo e custo médio do medicamento; as linhas de baixa/estorno
-- ficavam com custo_unitario e valor_total nulos, então "Baixas no mês" mostrava R$ 0,00.
--
-- Agora: recalcular_estoque_farmacia, ao replayar o ledger em ordem (data, created_at, id), grava em
-- cada baixa/estorno o custo médio vigente no momento dela e o valor (quantidade × custo). Como o replay
-- é refeito do zero a cada lançamento, uma entrada retroativa a outro custo revaloriza as baixas
-- posteriores, e a conta fecha: entradas valorizadas − baixas valorizadas = valor em estoque.
-- Replay idempotente: só atualiza linhas cujo custo ou valor mudou.
--
-- A gravação nas baixas dispara trg_update_estoque_farmacia de novo; por isso update_estoque_farmacia
-- sai cedo enquanto gestaup.recalc_farmacia estiver 'on' (escopo da transação, desligado logo após).
-- Rollback: supabase/rollbacks/20261022120000_farmacia_baixa_valorizada_rollback.sql

CREATE OR REPLACE FUNCTION public.recalcular_estoque_farmacia(p_medicamento_id uuid, p_fazenda_id uuid)
RETURNS void AS $$
DECLARE
  v_saldo numeric(12,3) := 0;
  v_custo numeric(12,4) := 0;
  v_mov record;
  v_ids uuid[] := '{}';
  v_custos numeric[] := '{}';
BEGIN
  FOR v_mov IN
    SELECT id, tipo_movimentacao, quantidade, custo_unitario
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
      -- Custo médio vigente antes desta saída (saída não altera o custo médio)
      v_ids := v_ids || v_mov.id;
      v_custos := v_custos || v_custo;
      v_saldo := v_saldo - v_mov.quantidade;
    ELSIF v_mov.tipo_movimentacao = 'ajuste' THEN
      v_saldo := v_mov.quantidade;
    END IF;
  END LOOP;

  IF array_length(v_ids, 1) IS NOT NULL THEN
    PERFORM set_config('gestaup.recalc_farmacia', 'on', true);
    UPDATE public.movimentacoes_farmacia m
    SET custo_unitario = ROUND(x.custo, 4),
        valor_total = ROUND(m.quantidade * x.custo, 2)
    FROM unnest(v_ids, v_custos) AS x(id, custo)
    WHERE m.id = x.id
      AND (m.custo_unitario IS DISTINCT FROM ROUND(x.custo, 4)
           OR m.valor_total IS DISTINCT FROM ROUND(m.quantidade * x.custo, 2));
    PERFORM set_config('gestaup.recalc_farmacia', 'off', true);
  END IF;

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
  -- Gravação de custo/valor nas próprias baixas (feita por recalcular_estoque_farmacia): não recalcula de novo
  IF current_setting('gestaup.recalc_farmacia', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  PERFORM public.recalcular_estoque_farmacia(COALESCE(NEW.medicamento_id, OLD.medicamento_id), COALESCE(NEW.fazenda_id, OLD.fazenda_id));
  IF TG_OP = 'UPDATE' AND (OLD.medicamento_id IS DISTINCT FROM NEW.medicamento_id OR OLD.fazenda_id IS DISTINCT FROM NEW.fazenda_id) THEN
    PERFORM public.recalcular_estoque_farmacia(OLD.medicamento_id, OLD.fazenda_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
