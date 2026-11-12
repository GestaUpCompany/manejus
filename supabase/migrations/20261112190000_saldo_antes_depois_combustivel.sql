-- Saldo antes/depois por movimentação de combustível (espelha movimentacoes_estoque_suplementos).
--
-- saldo_anterior / saldo_posterior são derivados: o replay do tanque roda na ordem
-- (data, created_at), a mesma do relatório de estoque de combustível. Ajuste fixa o
-- saldo absoluto. Estas colunas NÃO alteram tanques_combustivel.saldo_atual_l nem
-- custo_medio_l (esses continuam sendo mantidos pelos triggers existentes).
--
-- Backfill: não é feito aqui. Roda por tanque com recalcular_saldos_combustivel(tanque_id).

ALTER TABLE public.movimentacoes_combustivel
  ADD COLUMN IF NOT EXISTS saldo_anterior numeric(12,3),
  ADD COLUMN IF NOT EXISTS saldo_posterior numeric(12,3);

CREATE OR REPLACE FUNCTION public.recalcular_saldos_combustivel(p_tanque_id uuid)
RETURNS void AS $$
DECLARE
  v_mov record;
  v_saldo numeric := 0;
  v_antes numeric;
  v_delta numeric;
BEGIN
  IF p_tanque_id IS NULL THEN RETURN; END IF;

  FOR v_mov IN
    SELECT id, tipo_movimentacao, quantidade_l, saldo_anterior, saldo_posterior
    FROM public.movimentacoes_combustivel
    WHERE tanque_id = p_tanque_id
    ORDER BY data, created_at
  LOOP
    v_antes := v_saldo;
    IF v_mov.tipo_movimentacao = 'entrada' THEN
      v_delta := v_mov.quantidade_l;
    ELSIF v_mov.tipo_movimentacao = 'baixa' THEN
      v_delta := -v_mov.quantidade_l;
    ELSE
      -- ajuste: saldo absoluto
      v_delta := v_mov.quantidade_l - v_saldo;
    END IF;
    v_saldo := v_saldo + v_delta;

    -- Só grava quando muda (replay idempotente vira no-op)
    IF v_mov.saldo_anterior IS DISTINCT FROM v_antes OR v_mov.saldo_posterior IS DISTINCT FROM v_saldo THEN
      UPDATE public.movimentacoes_combustivel
      SET saldo_anterior = v_antes, saldo_posterior = v_saldo
      WHERE id = v_mov.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.trg_mov_combustivel_saldos()
RETURNS trigger AS $$
BEGIN
  PERFORM public.recalcular_saldos_combustivel(COALESCE(NEW.tanque_id, OLD.tanque_id));
  IF TG_OP = 'UPDATE' AND OLD.tanque_id IS DISTINCT FROM NEW.tanque_id THEN
    PERFORM public.recalcular_saldos_combustivel(OLD.tanque_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger só nas colunas que afetam o saldo: o próprio replay grava apenas as colunas novas,
-- então não reentra.
DROP TRIGGER IF EXISTS trg_mov_combustivel_saldos ON public.movimentacoes_combustivel;
CREATE TRIGGER trg_mov_combustivel_saldos
  AFTER INSERT OR DELETE OR UPDATE OF tanque_id, tipo_movimentacao, quantidade_l, data
  ON public.movimentacoes_combustivel
  FOR EACH ROW EXECUTE FUNCTION public.trg_mov_combustivel_saldos();
