-- ROLLBACK da Fase 5.1b (migration 20261007261000_fase5_1b_funcoes_novas_nascem_fechadas.sql)
-- NÃO fica em supabase/migrations/ de propósito. Estado anterior: nenhum default global para o role
-- postgres (funções novas nasciam com EXECUTE para PUBLIC). Não altera funções já criadas.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM service_role;
-- Para voltar exatamente a "sem entrada global" (opcional): após o GRANT acima, o default fica
-- equivalente ao interno do PostgreSQL (PUBLIC=X); a entrada em pg_default_acl pode ser limpa com
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL ON FUNCTIONS FROM PUBLIC, service_role
-- seguido de GRANT EXECUTE ON FUNCTIONS TO PUBLIC (o PostgreSQL remove a entrada quando volta ao padrão).
