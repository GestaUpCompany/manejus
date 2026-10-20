-- ============================================================================
-- IATF (auditoria item 6): alerta diário de passos do protocolo às 07:30 de Cuiabá (era 03:30)
-- ============================================================================
-- O job notificar_protocolos_iatf foi criado com '30 7 * * *', mas o pg_cron do Supabase usa GMT (cron.timezone = GMT) e
-- Cuiabá está em UTC-4 (sem horário de verão): rodava às 03:30 locais. O alerta "para hoje" chegava de madrugada e já estava
-- velho quando o peão começava o dia. Passa a '30 11 * * *' (11:30 UTC = 07:30 em Cuiabá).
-- A função notificar_protocolos_iatf já calcula "hoje" em America/Cuiaba; só o horário de disparo muda.
-- Só altera o agendamento do job (nenhum dado, tabela ou função). Se o job não existir, não faz nada.
-- Precedente de ajuste de fuso de cron: 20260824120000_corrigir_fuso_cron_peso_vivo.sql.
-- Rollback: supabase/rollbacks/20261020270000_iatf_cron_notificacoes_horario_cuiaba_rollback.sql
-- ============================================================================

DO $$
DECLARE
  v_job bigint;
BEGIN
  SELECT jobid INTO v_job FROM cron.job WHERE jobname = 'notificar_protocolos_iatf';
  IF v_job IS NOT NULL THEN
    PERFORM cron.alter_job(job_id := v_job, schedule := '30 11 * * *');
  END IF;
END;
$$;
