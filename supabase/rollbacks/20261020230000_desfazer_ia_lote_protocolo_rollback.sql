-- ROLLBACK de 20261020230000_desfazer_ia_lote_protocolo.sql
-- NÃO fica em supabase/migrations/ de propósito.
-- 1) DROP FUNCTION public.desfazer_ia_lote_protocolo(uuid, uuid, uuid[]);
-- 2) Reaplicar o corpo de marcar_tarefa_protocolo_iatf de 20261020110000_lotes_protocolo_iatf.sql (versão atual no banco antes desta migration).
-- 3) Reaplicar o corpo de registrar_ia_lote_protocolo de 20261020220000_registrar_ia_por_grupos_de_femeas.sql.
SELECT 1;
