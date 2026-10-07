-- ============================================================================
-- Fase 1 (segurança): views, tabelas backup_* e escrita pública em storage 'logos'
-- ============================================================================
-- Achados (auditoria 07/10/2026):
--  * Views com security_invoker = false executavam como postgres e ignoravam o RLS
--    das tabelas-base. 5 delas (v_lote_pasto_ocupacao_atual, v_lote_modulo_ocupacao_atual,
--    v_historico_ocupacao_pasto, v_historico_ocupacao_modulo, v_notificacoes_pendentes_ocupacao)
--    tinham SELECT para `anon` (dados de TODAS as fazendas com a chave pública), e
--    `authenticated` tinha INSERT/UPDATE/DELETE nelas: v_notificacoes_pendentes_ocupacao é
--    uma view simples sobre `notificacoes`, ou seja, escrita que contornava o RLS.
--    itens_cantina_pwa não filtrava por tenant (qualquer autenticado via todas as fazendas).
--  * 16 tabelas backup_* sem RLS no schema public (sem privilégio para anon/authenticated
--    hoje, mas um GRANT futuro as exporia).
--  * Bucket 'logos': INSERT/UPDATE/DELETE para o role `public` (anon sobrescrevia/apagava logos).
--
-- Correções:
--  * Todas as views: security_invoker = true (RLS das tabelas-base passa a valer para o
--    chamador), sem nenhum privilégio para anon e somente SELECT para authenticated.
--  * backup_*: ENABLE ROW LEVEL SECURITY (sem policy = negar) + REVOKE ALL de anon/authenticated.
--  * logos: escrita só para `authenticated`; leitura pública (URL pública de logo) preservada.
--
-- Não resolvido aqui (registrado no BACKLOG): qualquer `authenticated` ainda pode
-- sobrescrever/apagar logo de outra fazenda. Exige que o Painel passe a gravar em
-- `{fazenda_id}/...` (hoje usa nomes por timestamp, sem prefixo) antes de impor escopo.
-- Rollback: supabase/rollbacks/20261007230000_fase1_views_backups_logos_rollback.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A2. backup_*
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname LIKE 'backup\_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- A6. views: RLS do chamador + privilégios mínimos (somente leitura, sem anon)
-- ----------------------------------------------------------------------------
ALTER VIEW public.itens_almoxarifado_pwa            SET (security_invoker = true);
ALTER VIEW public.itens_cantina_pwa                 SET (security_invoker = true);
ALTER VIEW public.v_funcionarios_com_setores        SET (security_invoker = true);
ALTER VIEW public.v_historico_ocupacao_modulo       SET (security_invoker = true);
ALTER VIEW public.v_historico_ocupacao_pasto        SET (security_invoker = true);
ALTER VIEW public.v_lote_modulo_ocupacao_atual      SET (security_invoker = true);
ALTER VIEW public.v_lote_pasto_ocupacao_atual       SET (security_invoker = true);
ALTER VIEW public.v_notificacoes_pendentes_ocupacao SET (security_invoker = true);
ALTER VIEW public.v_registros_unificado             SET (security_invoker = true);

REVOKE ALL ON public.itens_almoxarifado_pwa, public.itens_cantina_pwa, public.v_funcionarios_com_setores,
              public.v_historico_ocupacao_modulo, public.v_historico_ocupacao_pasto,
              public.v_lote_modulo_ocupacao_atual, public.v_lote_pasto_ocupacao_atual,
              public.v_notificacoes_pendentes_ocupacao
  FROM anon, authenticated;

GRANT SELECT ON public.itens_almoxarifado_pwa, public.itens_cantina_pwa, public.v_funcionarios_com_setores,
                public.v_historico_ocupacao_modulo, public.v_historico_ocupacao_pasto,
                public.v_lote_modulo_ocupacao_atual, public.v_lote_pasto_ocupacao_atual,
                public.v_notificacoes_pendentes_ocupacao
  TO authenticated;

-- v_registros_unificado nunca teve acesso de anon/authenticated: segue assim (revogar por garantia).
REVOKE ALL ON public.v_registros_unificado FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- A7. storage 'logos': escrita só autenticada; leitura pública preservada
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Upload Logos" ON storage.objects;
DROP POLICY IF EXISTS "Update Logos" ON storage.objects;
DROP POLICY IF EXISTS "Delete Logos" ON storage.objects;

CREATE POLICY "Upload Logos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'logos');
CREATE POLICY "Update Logos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'logos') WITH CHECK (bucket_id = 'logos');
CREATE POLICY "Delete Logos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'logos');
