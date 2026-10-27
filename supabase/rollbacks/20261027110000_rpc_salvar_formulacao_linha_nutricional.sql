-- Rollback de 20261027110000_rpc_salvar_formulacao_linha_nutricional.sql
DROP FUNCTION IF EXISTS public.linha_nutricional_lote(uuid, uuid);
DROP FUNCTION IF EXISTS public.salvar_formulacao(uuid, uuid, jsonb, jsonb, jsonb, text);
