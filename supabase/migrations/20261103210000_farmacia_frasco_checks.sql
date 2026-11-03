-- Fecha o estoque de farmácia em frascos inteiros, depois da conversão dos dados (backup_*_farmacia_20261103).
-- 1) Lançamento ativo só com quantidade inteira (lançamento apagado, com deleted_at, fica de fora: guarda histórico fracionado).
-- 2) Medicamento com controle de estoque só na unidade 'frasco'.

ALTER TABLE public.movimentacoes_farmacia
  ADD CONSTRAINT movimentacoes_farmacia_quantidade_inteira_check
  CHECK (deleted_at IS NOT NULL OR quantidade = trunc(quantidade));

ALTER TABLE public.medicamentos
  ADD CONSTRAINT medicamentos_estoque_unidade_frasco_check
  CHECK (NOT controla_estoque OR unidade = 'frasco');
