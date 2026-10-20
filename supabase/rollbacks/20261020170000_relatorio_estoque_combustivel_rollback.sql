-- Rollback de 20261020170000_relatorio_estoque_combustivel.sql
DROP FUNCTION IF EXISTS public.get_dados_relatorio_estoque_combustivel_fazenda(uuid, date, date);
DROP FUNCTION IF EXISTS public.get_dados_relatorio_estoque_combustivel(uuid, date, date);
