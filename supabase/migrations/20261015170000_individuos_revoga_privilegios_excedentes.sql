-- ============================================================================
-- Indivíduos / Fase 0.10: remove privilégios excedentes na tabela individuos
-- ============================================================================
-- Auditoria somente leitura em 15/10/2026: as policies antigas (usuario_id = auth.uid()) já não existem; as 5
-- atuais usam auth_id + vínculo ativo com a fazenda e a RLS está forçada. Sobrou o GRANT: `anon` tem todos os
-- privilégios em individuos (incluindo o INSERT dado em 20260608145924) e `authenticated` tem TRUNCATE,
-- REFERENCES e TRIGGER. Hoje nada disso abre acesso (anon não tem policy), mas TRUNCATE ignora RLS e qualquer
-- policy permissiva futura para anon passaria a valer. Defesa em profundidade, sem mudar comportamento.
--
-- 1) REVOKE ALL em individuos para anon. Único objeto que lê individuos como invoker é a view
--    v_status_reprodutivo (security_invoker), de uso autenticado no painel.
-- 2) REVOKE TRUNCATE, REFERENCES, TRIGGER de authenticated. O PostgREST só usa SELECT/INSERT/UPDATE/DELETE;
--    FKs e triggers existentes não dependem desses privilégios (são do dono).
-- Escopo: só individuos. Os outros ~todas as tabelas seguem o mesmo padrão padrão do Supabase (ver BACKLOG,
-- isolamento Fase B); não alterado aqui.
-- Rollback: supabase/rollbacks/20261015170000_individuos_revoga_privilegios_excedentes_rollback.sql
-- ============================================================================

REVOKE ALL ON TABLE public.individuos FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.individuos FROM authenticated;
