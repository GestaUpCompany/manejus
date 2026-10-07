-- ROLLBACK da Fase 5.3c (migration 20261007265000_fase5_3c_funcoes_de_gatilho_revoke.sql)
-- NÃO fica em supabase/migrations/ de propósito. Reabre EXECUTE (ACL original: PUBLIC) nas funções de gatilho.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;
