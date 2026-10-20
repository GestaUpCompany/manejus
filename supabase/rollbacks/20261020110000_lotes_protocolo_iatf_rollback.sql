-- ROLLBACK de 20261020110000_lotes_protocolo_iatf.sql
-- NÃO fica em supabase/migrations/ de propósito.
-- ATENÇÃO: apaga todos os lotes de protocolo, fêmeas e tarefas (tabelas novas, só existem por esta migration).
-- Se a migration 3/3 (protocolo_lote_id em eventos_reprodutivos) já foi aplicada, desfaça-a ANTES.
DROP FUNCTION IF EXISTS public.marcar_tarefa_protocolo_iatf(uuid, uuid, date, text, text, text);
DROP FUNCTION IF EXISTS public.criar_lote_protocolo_iatf(uuid, uuid, text, date, uuid[], uuid, text, text, text);
DROP TABLE IF EXISTS public.lotes_protocolo_iatf_tarefas;
DROP TABLE IF EXISTS public.lotes_protocolo_iatf_femeas;
DROP TABLE IF EXISTS public.lotes_protocolo_iatf;
DROP FUNCTION IF EXISTS public.trg_lotes_protocolo_iatf_filho_validar();
DROP FUNCTION IF EXISTS public.trg_lotes_protocolo_iatf_validar();
