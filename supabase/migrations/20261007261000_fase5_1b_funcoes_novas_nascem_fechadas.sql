-- ============================================================================
-- Fase 5.1b (segurança): funções novas nascem FECHADAS
-- ============================================================================
-- Problema: funções criadas por `postgres` (inclusive pelo `supabase db push`) nascem com ACL nula,
-- isto é, EXECUTE implícito para PUBLIC -> `anon` e `authenticated` executam qualquer função nova
-- (medido: ACL nula em trg_usuarios_protege_colunas, update_estoque_suplemento etc.). Foi assim que
-- chegamos a 118 RPCs SECURITY DEFINER abertas. O default por schema `{postgres=X}` já existente só
-- ADICIONA privilégios; não remove o EXECUTE implícito de PUBLIC. Só um default global remove.
--
-- Efeito: funções criadas daqui em diante por `postgres` ficam executáveis apenas pelo dono e pelo
-- service_role (Edge Functions). Funções JÁ existentes não mudam. Triggers continuam disparando
-- (o EXECUTE é checado só na criação do trigger). Fail-closed: se uma RPC nova esquecer o GRANT,
-- o cliente recebe 42501 (visível), em vez de ficar aberta sem checagem.
--
-- CONVENÇÃO a partir de agora, em toda migration que crie RPC chamada pelo cliente:
--     GRANT EXECUTE ON FUNCTION public.nome(args) TO authenticated;   -- e checagem de tenant no corpo
--
-- Escopo: ALTER DEFAULT PRIVILEGES FOR ROLE postgres (sem IN SCHEMA) vale para funções criadas por
-- postgres em qualquer schema. Funções de extensões/Supabase criadas por supabase_admin e
-- supabase_auth_admin não são afetadas.
-- Rollback: supabase/rollbacks/20261007261000_fase5_1b_funcoes_novas_nascem_fechadas_rollback.sql
-- ============================================================================

ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO service_role;
