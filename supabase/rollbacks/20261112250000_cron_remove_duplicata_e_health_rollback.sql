-- Rollback de 20261112250000_cron_remove_duplicata_e_health.sql
-- Reagenda os dois jobs removidos. Rode manualmente no SQL Editor.
-- ATENCAO: o job de 03:00 UTC era a duplicata; reagendar so se realmente quiser o estado anterior.

SELECT cron.schedule('update-dados-lotes', '0 3 * * *', 'SELECT public.update_dados_lotes();');
SELECT cron.schedule('sample-system-health', '*/5 * * * *', 'SELECT public.sample_system_health();');
