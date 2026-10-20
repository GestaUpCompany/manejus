-- Rollback de 20261020190000_relatorio_cantina.sql
DROP FUNCTION IF EXISTS public.get_dados_relatorio_cantina_fazenda(uuid, date, date);
DROP FUNCTION IF EXISTS public.get_dados_relatorio_cantina(uuid, date, date);
