-- ============================================================================
-- Fase 5.4 (segurança): contexto de auditoria e encerramento de impersonação
-- ============================================================================
-- Achado: `set_audit_context` (2 overloads) e `end_impersonation_session` eram SECURITY DEFINER,
-- executáveis por `anon`, e confiavam 100% nos parâmetros:
--  * qualquer pessoa podia gravar app.current_user_id/email/nome e app.impersonated_by na sessão do
--    banco -> os gatilhos de audit_log registravam uma identidade FORJADA (ou incriminavam um super_admin).
--  * qualquer pessoa que soubesse o id de uma sessão de impersonação podia encerrá-la.
--
-- Ação:
--  1. set_audit_context: para chamada de CLIENTE (guard_w_is_client()), a identidade vem do banco, não do
--     parâmetro: usuarios.id/email/nome do auth.uid(). `p_user_id NULL` continua significando "limpar"
--     (clearAuditContext). Impersonação só é aceita se existir sessão ativa e não expirada em
--     impersonation_sessions com super_admin_id = p_impersonated_by e target = chamador; senão grava
--     is_impersonation=false. ip/user_agent/source_app/origin_page seguem como texto informado (não são
--     identidade). Chamadas internas (service_role/cron/gatilho) mantêm o comportamento anterior.
--     Chamador anon: não faz nada.
--  2. end_impersonation_session: cliente só encerra se for o usuário-alvo, o super_admin da sessão ou
--     qualquer super_admin. (No fluxo do Painel, quem chama é o próprio usuário-alvo logado.)
--  3. REVOKE EXECUTE FROM PUBLIC, anon nas 3 funções (authenticated e service_role mantidos).
--
-- Verificado sem alteração (apenas documentado): get_fazenda_por_acesso e autenticar_peao_app seguem
-- abertas a anon (boot do PWA; decisão do usuário de manter). Relatórios públicos por token
-- (get_dados_relatorio_*, get_bebedouros_permitidos_relatorio, get_relatorio_consumo, vision_relatorio_payload)
-- validam tipo, ativo e expira_em e usam a fazenda do TOKEN. As 7 variantes `*_fazenda` já exigem
-- user_has_fazenda_access e não são executáveis por anon.
-- Rollback: supabase/rollbacks/20261007266000_fase5_4_auditoria_impersonacao_authz_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_audit_context(
  p_user_id uuid DEFAULT NULL::uuid,
  p_user_email text DEFAULT NULL::text,
  p_user_nome text DEFAULT NULL::text,
  p_is_impersonation boolean DEFAULT false,
  p_impersonated_by uuid DEFAULT NULL::uuid,
  p_ip_address text DEFAULT NULL::text,
  p_user_agent text DEFAULT NULL::text,
  p_source_app text DEFAULT NULL::text,
  p_origin_page text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_u record;
  v_id text := COALESCE(p_user_id::text, '');
  v_email text := COALESCE(p_user_email, '');
  v_nome text := COALESCE(p_user_nome, '');
  v_imp boolean := COALESCE(p_is_impersonation, false);
  v_by text := COALESCE(p_impersonated_by::text, '');
BEGIN
  IF public.guard_w_is_client() THEN
    IF v_uid IS NULL THEN
      RETURN;
    END IF;
    IF p_user_id IS NULL THEN
      -- limpeza do contexto
      v_id := ''; v_email := ''; v_nome := ''; v_imp := false; v_by := '';
    ELSE
      SELECT u.id, u.email, u.nome INTO v_u
      FROM public.usuarios u
      WHERE u.id = v_uid OR u.auth_id = v_uid
      ORDER BY (u.auth_id = v_uid) DESC
      LIMIT 1;
      v_id := COALESCE(v_u.id::text, v_uid::text);
      v_email := COALESCE(v_u.email, auth.jwt() ->> 'email', '');
      v_nome := COALESCE(v_u.nome, '');
      IF v_imp AND p_impersonated_by IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.impersonation_sessions s
        WHERE s.is_active
          AND (s.expires_at IS NULL OR s.expires_at > now())
          AND s.super_admin_id = p_impersonated_by
          AND s.target_user_id IN (COALESCE(v_u.id, v_uid), v_uid)
      ) THEN
        v_by := p_impersonated_by::text;
      ELSE
        v_imp := false;
        v_by := '';
      END IF;
    END IF;
  END IF;

  PERFORM set_config('app.current_user_id', v_id, false);
  PERFORM set_config('app.current_user_email', v_email, false);
  PERFORM set_config('app.current_user_nome', v_nome, false);
  PERFORM set_config('app.is_impersonation', v_imp::text, false);
  PERFORM set_config('app.impersonated_by', v_by, false);
  PERFORM set_config('app.ip_address', COALESCE(p_ip_address, ''), false);
  PERFORM set_config('app.user_agent', COALESCE(p_user_agent, ''), false);
  PERFORM set_config('app.source_app', COALESCE(p_source_app, ''), false);
  PERFORM set_config('app.origin_page', COALESCE(p_origin_page, ''), false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_audit_context(
  p_user_id uuid DEFAULT NULL::uuid,
  p_user_email text DEFAULT NULL::text,
  p_user_nome text DEFAULT NULL::text,
  p_is_impersonation boolean DEFAULT false,
  p_impersonated_by uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- versão curta: delega à completa (mesmas regras de identidade) sem sobrescrever ip/ua/origem
  PERFORM public.set_audit_context(p_user_id, p_user_email, p_user_nome, p_is_impersonation, p_impersonated_by,
                                   NULL, NULL, NULL, NULL);
END;
$function$;

CREATE OR REPLACE FUNCTION public.end_impersonation_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF public.guard_w_is_client() THEN
    IF v_uid IS NULL OR NOT (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1
        FROM public.impersonation_sessions s
        LEFT JOIN public.usuarios t ON t.id = s.target_user_id
        WHERE s.id = p_session_id
          AND (s.target_user_id = v_uid OR t.auth_id = v_uid OR s.super_admin_id = v_uid)
      )
    ) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.impersonation_sessions
  SET is_active = false, ended_at = now()
  WHERE id = p_session_id AND is_active = true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION
  public.set_audit_context(uuid, text, text, boolean, uuid, text, text, text, text),
  public.set_audit_context(uuid, text, text, boolean, uuid),
  public.end_impersonation_session(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.set_audit_context(uuid, text, text, boolean, uuid, text, text, text, text),
  public.set_audit_context(uuid, text, text, boolean, uuid),
  public.end_impersonation_session(uuid)
TO authenticated, service_role;
