-- Rollback de 20261105120000_farmacia_reclassificacao_lote.sql.
-- Apaga as reclassificações: os frascos voltam ao lote e à validade de antes. Saldo e custo não mudam.
DELETE FROM public.movimentacoes_farmacia WHERE tipo_movimentacao = 'reclassificacao';
ALTER TABLE public.movimentacoes_farmacia DROP CONSTRAINT IF EXISTS movimentacoes_farmacia_reclassificacao_qtd_check;
ALTER TABLE public.movimentacoes_farmacia DROP CONSTRAINT movimentacoes_farmacia_tipo_movimentacao_check;
ALTER TABLE public.movimentacoes_farmacia
  ADD CONSTRAINT movimentacoes_farmacia_tipo_movimentacao_check
  CHECK (tipo_movimentacao IN ('entrada', 'baixa', 'ajuste', 'estorno'));
ALTER TABLE public.movimentacoes_farmacia DROP COLUMN validade_origem, DROP COLUMN lote_origem;
