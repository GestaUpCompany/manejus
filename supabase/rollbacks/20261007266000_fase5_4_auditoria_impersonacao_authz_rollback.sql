-- ROLLBACK da Fase 5.4 (migration 20261007266000_fase5_4_auditoria_impersonacao_authz.sql)
-- NÃO fica em supabase/migrations/ de propósito. ATENÇÃO: volta a aceitar identidade forjada no
-- audit_log e reabre as 3 funções para anon.

CREATE OR REPLACE FUNCTION public.set_audit_context(p_user_id uuid DEFAULT NULL::uuid, p_user_email text DEFAULT NULL::text, p_user_nome text DEFAULT NULL::text, p_is_impersonation boolean DEFAULT false, p_impersonated_by uuid DEFAULT NULL::uuid, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_source_app text DEFAULT NULL::text, p_origin_page text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  PERFORM set_config('app.current_user_id', COALESCE(p_user_id::text, ''), false);
  PERFORM set_config('app.current_user_email', COALESCE(p_user_email, ''), false);
  PERFORM set_config('app.current_user_nome', COALESCE(p_user_nome, ''), false);
  PERFORM set_config('app.is_impersonation', COALESCE(p_is_impersonation::text, 'false'), false);
  PERFORM set_config('app.impersonated_by', COALESCE(p_impersonated_by::text, ''), false);
  PERFORM set_config('app.ip_address', COALESCE(p_ip_address, ''), false);
  PERFORM set_config('app.user_agent', COALESCE(p_user_agent, ''), false);
  PERFORM set_config('app.source_app', COALESCE(p_source_app, ''), false);
  PERFORM set_config('app.origin_page', COALESCE(p_origin_page, ''), false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_audit_context(p_user_id uuid DEFAULT NULL::uuid, p_user_email text DEFAULT NULL::text, p_user_nome text DEFAULT NULL::text, p_is_impersonation boolean DEFAULT false, p_impersonated_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  PERFORM set_config('app.current_user_id', COALESCE(p_user_id::text, ''), false);
  PERFORM set_config('app.current_user_email', COALESCE(p_user_email, ''), false);
  PERFORM set_config('app.current_user_nome', COALESCE(p_user_nome, ''), false);
  PERFORM set_config('app.is_impersonation', COALESCE(p_is_impersonation::text, 'false'), false);
  PERFORM set_config('app.impersonated_by', COALESCE(p_impersonated_by::text, ''), false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.end_impersonation_session(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.impersonation_sessions
  SET is_active = false, ended_at = now()
  WHERE id = p_session_id AND is_active = true;
END;
$function$;

GRANT EXECUTE ON FUNCTION
  public.set_audit_context(uuid, text, text, boolean, uuid, text, text, text, text),
  public.set_audit_context(uuid, text, text, boolean, uuid),
  public.end_impersonation_session(uuid)
TO PUBLIC, anon, authenticated;
