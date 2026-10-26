-- Rollback de 20261026120000_relatorio_combustivel_unificado.sql
-- Remove as funcoes novas. As RPCs antigas (abastecimento e estoque_combustivel) nao foram alteradas.

DROP FUNCTION IF EXISTS public.get_dados_relatorio_combustivel_fazenda(uuid, date, date);
DROP FUNCTION IF EXISTS public.get_dados_relatorio_combustivel(uuid, date, date);
