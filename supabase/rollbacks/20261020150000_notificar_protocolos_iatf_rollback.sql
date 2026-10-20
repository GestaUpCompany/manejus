-- Rollback de 20261020150000_notificar_protocolos_iatf: remove o agendamento e a função.
-- As notificações já geradas ficam (são dados dos usuários); apague manualmente, se quiser, as de título "IATF: passos de protocolo ...".
SELECT cron.unschedule('notificar_protocolos_iatf');
DROP FUNCTION IF EXISTS public.notificar_protocolos_iatf(uuid);
