-- ROLLBACK da Fase 5.1 (migration 20261007260000_fase5_1_rpcs_internas.sql)
-- NÃO fica em supabase/migrations/ de propósito. ATENÇÃO: reverter REABRE as 34 RPCs para
-- anon/authenticated (inclui soft_delete_record, que altera qualquer tabela). Usar só em emergência.

-- 1. Views voltam a chamar a função original
DO $$
DECLARE
  v text;
  def text;
BEGIN
  FOREACH v IN ARRAY ARRAY['v_lote_pasto_ocupacao_atual', 'v_lote_modulo_ocupacao_atual'] LOOP
    def := pg_get_viewdef(('public.' || v)::regclass, false);
    def := replace(def, 'calcular_peso_medio_lote_visivel(', 'calcular_peso_medio_lote(');
    EXECUTE format('CREATE OR REPLACE VIEW public.%I AS %s', v, rtrim(def, E'; \n'));
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
  END LOOP;
END $$;

-- 2. Reabre as funções (ACL original)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prosecdef
      AND p.proname = ANY (ARRAY[
        'verificar_ocupacoes_acima_meta','notificar_individuos_incompletos_antigos',
        'notificar_proximidade_desmama','update_dados_lotes','update_pesos_individuos',
        'sample_system_health','cleanup_audit_log','fn_atualizar_status_atividades_automatico','fp_rollover',
        'calcular_cabecas_lote','calcular_peso_medio_lote','calcular_taxa_lotacao_modulo',
        'calcular_taxa_lotacao_pasto','fp_seed_imprevisto_categorias','fp_seed_indicadores',
        'gerar_notificacao_ocupacao','notificar_individuo_incompleto','recalc_consumo_series',
        'recalcular_consumo_por_formulacao','recalcular_estoque_cantina','recalcular_formulacao',
        'recalcular_peso_vivo_lote','recalcular_pesos_suplementacao_historico',
        'atualizar_peso_entrada_por_nascimento','atualizar_pesos_em_lote',
        'calcular_peso_vivo_atual_individual','listar_individuos_para_atualizacao_peso',
        'update_quant_atual','get_descendentes_individuo','fp_set_dia','fp_set_obs_semana',
        'fp_set_status_semana','atualizar_cotacao_dolar','soft_delete_record'
      ])
  LOOP
    IF r.proname = 'atualizar_cotacao_dolar' THEN
      -- ACL original: {postgres=X, authenticated=X} (sem PUBLIC)
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    ELSE
      -- ACL original: PUBLIC (implícito) -> anon, authenticated e service_role
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC, anon, authenticated', r.sig);
    END IF;
  END LOOP;
END $$;

-- 3. Remove a função criada pela 5.1
DROP FUNCTION IF EXISTS public.calcular_peso_medio_lote_visivel(uuid);
