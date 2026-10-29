-- Rollback de 20261029120000_editar_registro_pastagens.sql
DROP FUNCTION IF EXISTS public.editar_registro_pastagens(uuid, uuid, uuid, text, jsonb);
