-- ROLLBACK de 20261020300000_iatf_salvar_protocolo_atomico.sql
-- NÃO fica em supabase/migrations/ de propósito.
-- DROP FUNCTION IF EXISTS public.salvar_protocolo_iatf(uuid, uuid, text, text, jsonb);
-- (o painel anterior à mudança editava com insert/update/delete direto; reverter o hook useSalvarProtocoloIatf junto)
SELECT 1;
