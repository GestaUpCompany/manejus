-- Rollback de 20261016260000_notificar_pendencias_reprodutivas: remove o agendamento e a função.
-- As notificações já geradas ficam (são dados dos usuários); apague manualmente, se quiser, as de título "Reprodução: ...".
SELECT cron.unschedule('notificar_pendencias_reprodutivas');
DROP FUNCTION IF EXISTS public.notificar_pendencias_reprodutivas(uuid);
