-- ============================================================================
-- Fase 5.3c (segurança): funções de gatilho sem EXECUTE para anon/authenticated
-- ============================================================================
-- Achado: as 125 funções do schema public com retorno `trigger` (96 SECURITY DEFINER) eram executáveis
-- por PUBLIC (ACL nula) -> `anon` e `authenticated`. Chamada direta falha ("trigger functions can only be
-- called as triggers"), então o risco prático é baixo, mas é superfície desnecessária e aparece nos
-- advisors (anon_security_definer_function_executable).
--
-- Seguro: o PostgreSQL checa EXECUTE de uma função de gatilho só na criação do trigger (pelo criador,
-- `postgres`); ao disparar, não checa o privilégio do usuário que gravou a linha. Confirmado: nenhuma
-- dessas funções é chamada diretamente por outra função (varredura de prosrc) nem por cron/Edge/clientes
-- (retorno `trigger` não é invocável via RPC). 2 delas hoje não estão ligadas a nenhum trigger
-- (trg_registros_pastagens_mover_lote, propagar_peso_meta_para_individuos): também fechadas.
--
-- Ação: REVOKE EXECUTE FROM PUBLIC, anon, authenticated em todas as funções public com retorno trigger.
-- O dono (postgres) mantém. Rollback: supabase/rollbacks/20261007265000_fase5_3c_funcoes_de_gatilho_revoke_rollback.sql
-- ============================================================================

DO $$
DECLARE
  r record;
  v_total int := 0;
  v_esperado constant int := 125;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind = 'f'
      AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    v_total := v_total + 1;
  END LOOP;

  IF v_total <> v_esperado THEN
    RAISE EXCEPTION 'Fase 5.3c: esperava % funções de gatilho, encontrei % (houve criação/remoção?)', v_esperado, v_total;
  END IF;
END $$;
