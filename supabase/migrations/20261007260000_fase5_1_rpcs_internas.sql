-- ============================================================================
-- Fase 5.1 (segurança): RPCs SECURITY DEFINER internas/cron/sem chamador
-- ============================================================================
-- Achado (auditoria 07/10/2026): 118 funções SECURITY DEFINER eram executáveis por `anon` e
-- `authenticated` (EXECUTE herdado de PUBLIC). Esta migration trata 34 que NÃO são chamadas por
-- nenhum cliente (PWA, Painel, Edge Functions): confirmado por varredura dos dois repos e das
-- Edge Functions, por cron.job, por chamadores DB->DB (todos SECURITY DEFINER do dono `postgres`)
-- e por pg_depend.
--
--  * 9 de cron (jobs rodam como `postgres`): verificar_ocupacoes_acima_meta,
--    notificar_individuos_incompletos_antigos, notificar_proximidade_desmama, update_dados_lotes,
--    update_pesos_individuos, sample_system_health, cleanup_audit_log,
--    fn_atualizar_status_atividades_automatico, fp_rollover.
--  * 14 internas (só chamadas por triggers/funções DEFINER): calcular_cabecas_lote,
--    calcular_peso_medio_lote, calcular_taxa_lotacao_modulo, calcular_taxa_lotacao_pasto,
--    fp_seed_imprevisto_categorias, fp_seed_indicadores, gerar_notificacao_ocupacao,
--    notificar_individuo_incompleto, recalc_consumo_series, recalcular_consumo_por_formulacao,
--    recalcular_estoque_cantina, recalcular_formulacao, recalcular_peso_vivo_lote,
--    recalcular_pesos_suplementacao_historico.
--  * 11 sem chamador (confirmado pelo usuário: nada fora dos dois repos as usa), incluindo
--    soft_delete_record(p_schema,p_table,p_id) que fazia UPDATE dinâmico em qualquer tabela
--    para `anon`: atualizar_peso_entrada_por_nascimento, atualizar_pesos_em_lote,
--    calcular_peso_vivo_atual_individual, listar_individuos_para_atualizacao_peso,
--    update_quant_atual, get_descendentes_individuo, fp_set_dia, fp_set_obs_semana,
--    fp_set_status_semana, atualizar_cotacao_dolar, soft_delete_record.
--
-- Ação: REVOKE EXECUTE de PUBLIC, anon e authenticated; GRANT explícito ao service_role (uso
-- server-side/Edge Functions). O dono (postgres), triggers e cron seguem executando.
--
-- calcular_peso_medio_lote é usada pelas views v_lote_*_ocupacao_atual (security_invoker desde a
-- Fase 1), então `authenticated` precisava de EXECUTE, e a função vazava o peso médio de qualquer
-- lote. Uma checagem de acesso DENTRO dela não é segura: triggers legítimos a chamam para lotes que o
-- ator pode não enxergar (ex.: lote da fazenda destino numa transferência) e um NULL silencioso
-- gravaria peso errado. Solução: a original fica interna (fechada aos clientes, sem checagem) e as
-- duas views passam a usar calcular_peso_medio_lote_visivel (DEFINER + checagem de acesso ao lote).
--
-- Nota (item "ALTER DEFAULT PRIVILEGES"): já está em vigor para funções criadas por `postgres`
-- no schema public (pg_default_acl = {postgres=X}); nada a alterar.
-- Rollback: supabase/rollbacks/20261007260000_fase5_1_rpcs_internas_rollback.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Versão "visível" para as views (checagem de acesso ao lote)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calcular_peso_medio_lote_visivel(p_lote_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET "TimeZone" TO 'America/Cuiaba'
SET search_path TO 'public'
AS $function$
DECLARE
  v_peso numeric;
BEGIN
  IF NOT (
    public.is_admin_user()
    OR public.caller_has_fazenda_access((SELECT l.fazenda_id FROM public.lotes l WHERE l.id = p_lote_id))
  ) THEN
    RETURN NULL;
  END IF;

  SELECT
    SUM(c.quant_atual * c.peso_vivo_atual_kg_cab) / NULLIF(SUM(c.quant_atual), 0)
  INTO v_peso
  FROM public.lote_categorias c
  WHERE c.lote_id = p_lote_id
    AND c.ativo = true
    AND c.quant_atual > 0
    AND c.peso_vivo_atual_kg_cab IS NOT NULL;

  RETURN v_peso;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.calcular_peso_medio_lote_visivel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_peso_medio_lote_visivel(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Views passam a chamar a versão visível (mesma definição, só troca o nome)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v text;
  def text;
BEGIN
  FOREACH v IN ARRAY ARRAY['v_lote_pasto_ocupacao_atual', 'v_lote_modulo_ocupacao_atual'] LOOP
    def := pg_get_viewdef(('public.' || v)::regclass, false);
    IF position('calcular_peso_medio_lote(' IN def) = 0 THEN
      RAISE EXCEPTION 'View % não usa calcular_peso_medio_lote(...): definição mudou?', v;
    END IF;
    def := replace(def, 'calcular_peso_medio_lote(', 'calcular_peso_medio_lote_visivel(');
    EXECUTE format('CREATE OR REPLACE VIEW public.%I AS %s', v, rtrim(def, E'; \n'));
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. REVOKE das 34 funções internas/cron/sem chamador
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_total int := 0;
  v_esperado constant int := 34;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prosecdef
      AND p.proname = ANY (ARRAY[
        -- cron
        'verificar_ocupacoes_acima_meta','notificar_individuos_incompletos_antigos',
        'notificar_proximidade_desmama','update_dados_lotes','update_pesos_individuos',
        'sample_system_health','cleanup_audit_log','fn_atualizar_status_atividades_automatico','fp_rollover',
        -- internas
        'calcular_cabecas_lote','calcular_peso_medio_lote','calcular_taxa_lotacao_modulo',
        'calcular_taxa_lotacao_pasto','fp_seed_imprevisto_categorias','fp_seed_indicadores',
        'gerar_notificacao_ocupacao','notificar_individuo_incompleto','recalc_consumo_series',
        'recalcular_consumo_por_formulacao','recalcular_estoque_cantina','recalcular_formulacao',
        'recalcular_peso_vivo_lote','recalcular_pesos_suplementacao_historico',
        -- sem chamador
        'atualizar_peso_entrada_por_nascimento','atualizar_pesos_em_lote',
        'calcular_peso_vivo_atual_individual','listar_individuos_para_atualizacao_peso',
        'update_quant_atual','get_descendentes_individuo','fp_set_dia','fp_set_obs_semana',
        'fp_set_status_semana','atualizar_cotacao_dolar','soft_delete_record'
      ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    v_total := v_total + 1;
  END LOOP;

  -- Falha a migration (e reverte) se a lista não bater: evita revogar a menos/mais por engano
  IF v_total <> v_esperado THEN
    RAISE EXCEPTION 'Fase 5.1: esperava % funções, encontrei % (nome/assinatura mudou?)', v_esperado, v_total;
  END IF;
END $$;
