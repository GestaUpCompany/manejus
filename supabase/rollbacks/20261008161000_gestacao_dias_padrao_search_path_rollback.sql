-- ROLLBACK de 20261008161000_gestacao_dias_padrao_search_path.sql
-- NÃO fica em supabase/migrations/ de propósito. Volta à definição sem search_path (o alerta do advisor reaparece).
CREATE OR REPLACE FUNCTION public.gestacao_dias_padrao()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$ SELECT 283 $function$;
