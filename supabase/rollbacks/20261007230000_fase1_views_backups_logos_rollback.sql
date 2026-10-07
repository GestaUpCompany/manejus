-- ROLLBACK da Fase 1 (migration 20261007230000_fase1_views_backups_logos.sql)
-- NÃO fica em supabase/migrations/ de propósito: `supabase db push` não deve aplicá-lo.
-- Para reverter: executar este arquivo manualmente (SQL editor / psql) e marcar o incidente no HISTORICO.
-- Estado anterior capturado em 07/10/2026 antes do push.

-- ---------------------------------------------------------------------------
-- A2: tabelas backup_* (estavam SEM RLS e sem privilégio para anon/authenticated)
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname LIKE 'backup\_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- A6: views (security_invoker = false e ACLs originais)
-- ---------------------------------------------------------------------------
ALTER VIEW public.itens_almoxarifado_pwa          SET (security_invoker = false);
ALTER VIEW public.itens_cantina_pwa               SET (security_invoker = false);
ALTER VIEW public.v_funcionarios_com_setores      SET (security_invoker = false);
ALTER VIEW public.v_historico_ocupacao_modulo     SET (security_invoker = false);
ALTER VIEW public.v_historico_ocupacao_pasto      SET (security_invoker = false);
ALTER VIEW public.v_lote_modulo_ocupacao_atual    SET (security_invoker = false);
ALTER VIEW public.v_lote_pasto_ocupacao_atual     SET (security_invoker = false);
ALTER VIEW public.v_notificacoes_pendentes_ocupacao SET (security_invoker = false);
ALTER VIEW public.v_registros_unificado           SET (security_invoker = false);

-- ACLs originais (anon/authenticated)
GRANT ALL ON public.v_historico_ocupacao_modulo, public.v_historico_ocupacao_pasto,
             public.v_lote_modulo_ocupacao_atual, public.v_lote_pasto_ocupacao_atual,
             public.v_notificacoes_pendentes_ocupacao TO authenticated;
GRANT SELECT ON public.v_historico_ocupacao_modulo, public.v_historico_ocupacao_pasto,
                public.v_lote_modulo_ocupacao_atual, public.v_lote_pasto_ocupacao_atual,
                public.v_notificacoes_pendentes_ocupacao TO anon;
GRANT SELECT ON public.itens_almoxarifado_pwa, public.itens_cantina_pwa,
                public.v_funcionarios_com_setores TO authenticated;

-- ---------------------------------------------------------------------------
-- A7: storage logos (INSERT/UPDATE/DELETE eram para o role public)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Upload Logos" ON storage.objects;
DROP POLICY IF EXISTS "Update Logos" ON storage.objects;
DROP POLICY IF EXISTS "Delete Logos" ON storage.objects;
CREATE POLICY "Upload Logos" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'logos');
CREATE POLICY "Update Logos" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'logos');
CREATE POLICY "Delete Logos" ON storage.objects FOR DELETE TO public USING (bucket_id = 'logos');
