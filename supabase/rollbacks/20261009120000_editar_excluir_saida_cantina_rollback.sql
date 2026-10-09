-- Rollback de 20261009120000_editar_excluir_saida_cantina.sql
DROP FUNCTION IF EXISTS public.editar_registro_saida_cantina(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.excluir_registro_saida_cantina(uuid, uuid);
