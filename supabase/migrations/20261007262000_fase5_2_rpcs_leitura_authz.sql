-- ============================================================================
-- Fase 5.2 (segurança): RPCs de leitura/estatística com checagem de tenant
-- ============================================================================
-- Achado: 20 RPCs SECURITY DEFINER de leitura recebiam p_fazenda_id do chamador sem checar acesso e
-- eram executáveis por `anon` (chave anon embutida no bundle): qualquer pessoa lia estatísticas,
-- cadernetas, atividades, auditoria e métricas de qualquer fazenda.
--
-- Ação:
--  1. Helpers de guarda (levantam 42501 se o chamador não tem acesso, senão devolvem true, para poder
--     ser usados também dentro de WHERE nas funções LANGUAGE sql):
--       guard_fazenda(uuid)  -> is_admin_user() OR caller_has_fazenda_access(fazenda)
--       guard_admin()        -> is_admin_user()
--       guard_super_admin()  -> is_super_admin()
--  2. Cada função recebe a guarda no topo (plpgsql: PERFORM após o primeiro BEGIN; sql: no WHERE, que
--     o planner avalia como filtro único antes de ler dados). Corpo original preservado.
--  3. REVOKE EXECUTE FROM PUBLIC, anon (authenticated e service_role mantidos).
--
-- Escolhas por função:
--  * super_admin: get_system_health, get_ia_monitoramento, get_farm_usage_metrics (só telas SuperAdminRoute)
--  * admin: get_admin_evolution; get_audit_log sem fazenda (com fazenda: acesso à fazenda)
--  * fazenda: demais (p_fazenda_id). get_relatorio_lote_ciclo_vida exige acesso à fazenda informada E à
--    fazenda do lote. get_controller_email_fazenda_grupo exige acesso à fazenda de ORIGEM.
--  * get_registros_atividades(periodo): admin vê tudo; demais só as fazendas a que têm acesso.
-- Limite conhecido: get_audit_log.tabelasAuditadas continua agregando contagem por tabela de todo o
-- audit_log (metadado agregado, sem dados de linha).
-- Rollback: supabase/rollbacks/20261007262000_fase5_2_rpcs_leitura_authz_rollback.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helpers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_fazenda(p_fazenda_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_fazenda_id IS NULL OR NOT (public.is_admin_user() OR public.caller_has_fazenda_access(p_fazenda_id)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_super_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_fazenda(uuid), public.guard_admin(), public.guard_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_fazenda(uuid), public.guard_admin(), public.guard_super_admin() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Injeta a guarda no topo de cada função (corpo original preservado)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  def text;
  novo text;
  guarda text;
  v_total int := 0;
  v_esperado constant int := 20;
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS sig, p.proname, l.lanname
    FROM pg_proc p
    JOIN pg_language l ON l.oid = p.prolang
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prosecdef
      AND p.proname = ANY (ARRAY[
        'get_audit_log','get_admin_evolution','get_farm_usage_metrics','get_system_health',
        'get_ia_monitoramento','get_dashboard_stats','get_gado_stats','get_recent_activities',
        'get_rastreio_usuarios','get_rastreio_cadernetas','get_rastreio_cadernetas_detalhe',
        'get_imprevistos_recentes_by_fazenda','get_sessoes_abertas_by_fazenda','get_atividades_funcionario',
        'obter_execucoes_rotina','resumo_execucoes_rotina','get_lotes_para_relatorio',
        'get_relatorio_lote_ciclo_vida','get_registros_atividades','get_controller_email_fazenda_grupo'
      ])
  LOOP
    def := pg_get_functiondef(r.oid);
    IF position('guard_' IN def) > 0 THEN
      RAISE EXCEPTION 'Fase 5.2: % já tem guarda (migration reaplicada?)', r.sig;
    END IF;

    IF r.lanname = 'plpgsql' THEN
      -- guarda a inserir logo após o primeiro BEGIN
      guarda := CASE r.proname
        WHEN 'get_system_health'       THEN E'  PERFORM public.guard_super_admin();\n'
        WHEN 'get_ia_monitoramento'    THEN E'  PERFORM public.guard_super_admin();\n'
        WHEN 'get_farm_usage_metrics'  THEN E'  PERFORM public.guard_super_admin();\n'
        WHEN 'get_audit_log'           THEN E'  IF p_fazenda_id IS NULL THEN PERFORM public.guard_admin(); ELSE PERFORM public.guard_fazenda(p_fazenda_id); END IF;\n'
        WHEN 'get_relatorio_lote_ciclo_vida' THEN
          E'  PERFORM public.guard_fazenda(p_fazenda_id);\n  PERFORM public.guard_fazenda((SELECT lt.fazenda_id FROM public.lotes lt WHERE lt.id = p_lote_id));\n'
        WHEN 'get_controller_email_fazenda_grupo' THEN E'  PERFORM public.guard_fazenda(p_fazenda_origem_id);\n'
        WHEN 'get_registros_atividades' THEN NULL  -- tratado abaixo (filtro por linha)
        ELSE E'  PERFORM public.guard_fazenda(p_fazenda_id);\n'
      END;

      IF r.proname = 'get_registros_atividades' THEN
        novo := regexp_replace(def, E'\nBEGIN\n',
          E'\nBEGIN\n  v_admin := public.is_admin_user();\n');
        novo := replace(novo, E'  v_trunc TEXT;\n', E'  v_trunc TEXT;\n  v_admin BOOLEAN;\n');
        novo := replace(novo, 'WHERE ar.created_at >= v_start_date',
          'WHERE ar.created_at >= v_start_date' || E'\n    AND (v_admin OR ar.fazenda_id IN (SELECT fz.id FROM public.fazendas fz WHERE public.caller_has_fazenda_access(fz.id)))');
        IF novo = def OR position('v_admin OR' IN novo) = 0 OR position('v_admin BOOLEAN' IN novo) = 0 THEN
          RAISE EXCEPTION 'Fase 5.2: get_registros_atividades: padrão não encontrado';
        END IF;
      ELSE
        IF position(E'\nBEGIN\n' IN def) = 0 THEN
          RAISE EXCEPTION 'Fase 5.2: % sem BEGIN', r.sig;
        END IF;
        novo := regexp_replace(def, E'\nBEGIN\n', E'\nBEGIN\n' || guarda); -- sem flag g: só o primeiro BEGIN
      END IF;

    ELSE
      -- LANGUAGE sql: guarda no WHERE (filtro único, avaliado antes de ler dados)
      IF r.proname = 'get_admin_evolution' THEN
        novo := replace(def, E'FROM months m\n  ORDER BY m.month_start', E'FROM months m\n  WHERE public.guard_admin()\n  ORDER BY m.month_start');
      ELSIF r.proname = 'get_atividades_funcionario' THEN
        novo := replace(def, 'WHERE a.fazenda_id = p_fazenda_id', 'WHERE public.guard_fazenda(p_fazenda_id) AND a.fazenda_id = p_fazenda_id');
      ELSE -- get_rastreio_*
        novo := replace(def, 'WHERE r.fazenda_id = p_fazenda_id', 'WHERE public.guard_fazenda(p_fazenda_id) AND r.fazenda_id = p_fazenda_id');
      END IF;
    END IF;

    IF novo = def OR position('guard_' IN novo) = 0 AND r.proname <> 'get_registros_atividades' THEN
      RAISE EXCEPTION 'Fase 5.2: % não foi alterada (padrão não encontrado)', r.sig;
    END IF;

    EXECUTE novo;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    v_total := v_total + 1;
  END LOOP;

  IF v_total <> v_esperado THEN
    RAISE EXCEPTION 'Fase 5.2: esperava % funções, encontrei %', v_esperado, v_total;
  END IF;
END $$;
