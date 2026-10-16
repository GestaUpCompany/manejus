-- Rollback de 20261016270000_sanidade_aplicacoes: remove a tabela, o gatilho e as colunas do catálogo.
DROP TABLE IF EXISTS public.aplicacoes_sanitarias;
DROP FUNCTION IF EXISTS public.trg_aplicacoes_sanitarias_validar();
ALTER TABLE public.medicamentos DROP COLUMN IF EXISTS carencia_abate_dias, DROP COLUMN IF EXISTS intervalo_reaplicacao_dias;
