-- Permite corrigir lote e validade de frascos já em estoque, sem mexer em saldo nem custo.
-- A reclassificação é um lançamento próprio no ledger: lote_produto/validade guardam o destino e
-- lote_origem/validade_origem, a origem. recalcular_estoque_farmacia só trata entrada, baixa, estorno
-- e ajuste, então este tipo não altera saldo nem custo médio. O saldo por lote é calculado no Painel.
-- Rollback: supabase/rollbacks/20261105120000_farmacia_reclassificacao_lote_rollback.sql

ALTER TABLE public.movimentacoes_farmacia
  ADD COLUMN lote_origem text,
  ADD COLUMN validade_origem date;

ALTER TABLE public.movimentacoes_farmacia DROP CONSTRAINT movimentacoes_farmacia_tipo_movimentacao_check;
ALTER TABLE public.movimentacoes_farmacia
  ADD CONSTRAINT movimentacoes_farmacia_tipo_movimentacao_check
  CHECK (tipo_movimentacao IN ('entrada', 'baixa', 'ajuste', 'estorno', 'reclassificacao'));

ALTER TABLE public.movimentacoes_farmacia
  ADD CONSTRAINT movimentacoes_farmacia_reclassificacao_qtd_check
  CHECK (tipo_movimentacao <> 'reclassificacao' OR quantidade > 0);
