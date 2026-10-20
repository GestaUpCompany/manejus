-- ROLLBACK de 20261020100000_protocolos_iatf.sql
-- NÃO fica em supabase/migrations/ de propósito.
-- ATENÇÃO: apaga todos os protocolos de IATF e seus passos (tabelas novas, só existem por esta migration).
-- Se as migrations seguintes (lotes de protocolo) já foram aplicadas, desfaça-as ANTES (dependem destas tabelas).
DROP FUNCTION IF EXISTS public.copiar_modelo_protocolo_iatf(uuid);
DROP TABLE IF EXISTS public.protocolos_iatf_passos;
DROP TABLE IF EXISTS public.protocolos_iatf;
DROP FUNCTION IF EXISTS public.trg_protocolos_iatf_passos_validar();
