-- ROLLBACK de 20261020270000_iatf_cron_notificacoes_horario_cuiaba.sql
-- NÃO fica em supabase/migrations/ de propósito.
-- SELECT cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname = 'notificar_protocolos_iatf'), schedule := '30 7 * * *');
SELECT 1;
