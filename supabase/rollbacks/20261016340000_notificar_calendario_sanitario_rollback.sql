SELECT cron.unschedule('notificar_calendario_sanitario');
DROP FUNCTION IF EXISTS public.notificar_calendario_sanitario(uuid);
