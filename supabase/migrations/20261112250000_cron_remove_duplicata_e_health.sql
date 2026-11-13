-- Reduz Disk IO: remove o cron duplicado de update_dados_lotes e desativa a amostragem de saude.
--
-- 1) update_dados_lotes rodava 2x/dia: 03:00 UTC (23:00 Cuiaba, CURRENT_DATE ainda e o dia anterior)
--    e 04:00 UTC (00:00 Cuiaba, horario correto, ajustado em 20260824120000_corrigir_fuso_cron_peso_vivo).
--    Mantem so o de 04:00 UTC. NAO altera a funcao: peso/GMD seguem calculados exatamente como hoje.
-- 2) sample_system_health (a cada 5 min) era a maior fonte de blocos sujos do banco.
--    Desativado por decisao do usuario; a funcao e a tabela system_health_samples permanecem.
--
-- Idempotente e independente de jobid (os ids diferem entre bancos).

DO $do$
DECLARE
  v_job record;
BEGIN
  -- Duplicata das 03:00 UTC
  FOR v_job IN
    SELECT jobid FROM cron.job
    WHERE schedule = '0 3 * * *'
      AND command ILIKE '%update_dados_lotes%'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  -- Garante que o job de 04:00 UTC existe (nao remove se ja existir)
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
    WHERE schedule = '0 4 * * *' AND command ILIKE '%update_dados_lotes%'
  ) THEN
    RAISE EXCEPTION 'Job update_dados_lotes das 04:00 UTC nao encontrado; abortando para nao ficar sem evolucao de peso';
  END IF;

  -- Amostragem de saude
  FOR v_job IN
    SELECT jobid FROM cron.job WHERE command ILIKE '%sample_system_health%'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;
END
$do$;
