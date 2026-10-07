-- ROLLBACK da Fase 4 (migration 20261007250000_fase4_audit_impersonation_health.sql)
-- NÃO fica em supabase/migrations/ de propósito. ATENÇÃO: reverter REABRE a leitura cruzada
-- da auditoria e a adulteração da trilha. Usar só em emergência.

-- audit_log
CREATE POLICY "rls_audit_log_select" ON public.audit_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage farm audit_log records" ON public.audit_log
  FOR ALL TO authenticated
  USING (fazenda_id IN (
    SELECT uf.fazenda_id
    FROM usuario_fazenda uf JOIN usuarios u ON u.id = uf.usuario_id
    WHERE u.auth_id = auth.uid() AND uf.ativo = true));
CREATE POLICY "rls_audit_log_insert" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (false);
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.audit_log TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.audit_log TO authenticated;

-- impersonation_sessions
DROP POLICY IF EXISTS "impersonation_sessions_select_super_admin" ON public.impersonation_sessions;
CREATE POLICY "rls_impersonation_select" ON public.impersonation_sessions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "rls_impersonation_insert" ON public.impersonation_sessions
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "rls_impersonation_update" ON public.impersonation_sessions
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.impersonation_sessions TO anon, authenticated;

-- system_health_samples
DROP POLICY IF EXISTS "system_health_samples_select_admin" ON public.system_health_samples;
CREATE POLICY "rls_system_health_samples_select" ON public.system_health_samples
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "rls_system_health_samples_insert" ON public.system_health_samples
  FOR INSERT TO authenticated WITH CHECK (true);
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.system_health_samples TO anon, authenticated;
