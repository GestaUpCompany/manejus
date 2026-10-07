-- ============================================================================
-- Fase 4 (segurança): audit_log, impersonation_sessions, system_health_samples
-- ============================================================================
-- Achados (auditoria 07/10/2026):
--  * audit_log: `rls_audit_log_select` (qual true) deixava QUALQUER usuário logado ler as ~49 mil
--    linhas de auditoria de TODAS as fazendas (valor_anterior/valor_novo de qualquer tabela,
--    incluindo usuarios), e a policy `Users can manage farm audit_log records` (ALL) deixava o
--    usuário INSERIR/ALTERAR/APAGAR linhas de auditoria da própria fazenda (adulterar trilha).
--    A trilha só deve ser escrita pelo trigger fn_audit_trigger (SECURITY DEFINER).
--  * impersonation_sessions e system_health_samples: policies com `true` para qualquer authenticated,
--    MAS `authenticated` não tem privilégio de SELECT/INSERT/UPDATE nelas (só REFERENCES/TRIGGER/
--    TRUNCATE), então hoje já eram inacessíveis pela API: policies mortas, não vazamento. Mesmo assim
--    ficam alinhadas (defesa em profundidade, caso alguém conceda o privilégio no futuro). Quem escreve
--    é a Edge Function impersonate-user (service role), a RPC end_impersonation_session (DEFINER) e
--    sample_system_health() (DEFINER/cron).
--  O Painel só lê essas tabelas pelas RPCs get_audit_log / get_system_health (DEFINER, tratadas na
--  Fase 5); nenhum código do Painel ou do PWA as acessa diretamente.
--
-- Correção:
--  * audit_log: SELECT só da própria fazenda (policy existente `Users can view farm audit_log
--    records`) e sem nenhuma escrita por clientes da API; anon sem acesso.
--  * impersonation_sessions: policy de SELECT só super_admin; sem escrita por clientes.
--  * system_health_samples: policy de SELECT só admin; sem escrita por clientes.
--    (nenhum GRANT de SELECT é concedido: o Painel lê tudo pelas RPCs; a policy só vale se um GRANT vier.)
--  * Privilégios: anon sem nada; authenticated sem escrita e sem TRUNCATE/REFERENCES/TRIGGER.
-- Rollback: supabase/rollbacks/20261007250000_fase4_audit_impersonation_health_rollback.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- audit_log
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "rls_audit_log_select" ON public.audit_log;
DROP POLICY IF EXISTS "Users can manage farm audit_log records" ON public.audit_log;
DROP POLICY IF EXISTS "rls_audit_log_insert" ON public.audit_log;

REVOKE ALL ON public.audit_log FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.audit_log FROM authenticated;
-- (resta a policy "Users can view farm audit_log records": SELECT por fazenda vinculada)

-- ----------------------------------------------------------------------------
-- impersonation_sessions
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "rls_impersonation_select" ON public.impersonation_sessions;
DROP POLICY IF EXISTS "rls_impersonation_insert" ON public.impersonation_sessions;
DROP POLICY IF EXISTS "rls_impersonation_update" ON public.impersonation_sessions;

CREATE POLICY "impersonation_sessions_select_super_admin" ON public.impersonation_sessions
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

REVOKE ALL ON public.impersonation_sessions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.impersonation_sessions FROM authenticated;

-- ----------------------------------------------------------------------------
-- system_health_samples
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "rls_system_health_samples_select" ON public.system_health_samples;
DROP POLICY IF EXISTS "rls_system_health_samples_insert" ON public.system_health_samples;

CREATE POLICY "system_health_samples_select_admin" ON public.system_health_samples
  FOR SELECT TO authenticated
  USING (public.is_admin_user());

REVOKE ALL ON public.system_health_samples FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.system_health_samples FROM authenticated;
