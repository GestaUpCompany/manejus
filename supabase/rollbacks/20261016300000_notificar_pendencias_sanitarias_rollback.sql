-- Remove o agendamento e a função. As notificações já geradas ficam; apague, se quiser, as de título "Sanidade: ...".
SELECT cron.unschedule('notificar_pendencias_sanitarias');
DROP FUNCTION IF EXISTS public.notificar_pendencias_sanitarias(uuid);
