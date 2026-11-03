-- Rollback de 20261103210000_farmacia_frasco_checks.sql: remove as duas constraints.
ALTER TABLE public.movimentacoes_farmacia DROP CONSTRAINT IF EXISTS movimentacoes_farmacia_quantidade_inteira_check;
ALTER TABLE public.medicamentos DROP CONSTRAINT IF EXISTS medicamentos_estoque_unidade_frasco_check;
