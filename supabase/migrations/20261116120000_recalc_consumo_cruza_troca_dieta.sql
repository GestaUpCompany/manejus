-- ============================================================================
-- recalc_consumo_series: o intervalo entre dois registros consecutivos do lote
-- (mesmo escopo) é calculado mesmo quando a dieta muda entre eles.
--
-- Antes: a série era separada por formulação, então o último registro de cada
-- dieta ficava sem consumo, mesmo com um registro seguinte (troca de dieta).
-- Agora: a série é (fazenda, lote, escopo). O consumo do intervalo que começa
-- em um registro usa o teor de MS e o custo da dieta desse registro, na data dele:
--   1) versão vigente em formulacoes_versoes (vigente_desde <= data < vigente_ate);
--   2) senão, cadastro atual em formulacoes (ativo = true);
--   3) senão, NULL. Nunca usa a dieta seguinte nem valor padrão.
-- O último registro da série continua sem consumo (não há intervalo fechado).
--
-- Assinatura inalterada (chamadores: excluir/editar_registro_suplementacao).
-- Rollback: supabase/rollbacks/20261116120000_recalc_consumo_cruza_troca_dieta_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalc_consumo_series(p_fazenda_id uuid, p_lote_id uuid, p_formulacao text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_curr_id uuid;
  v_curr_data timestamptz;
  v_curr_formulacao text;
  v_curr_kg_cocho numeric;
  v_curr_n_cabecas integer;
  v_curr_qtd_bezerros integer;
  v_curr_peso_vivo_kg numeric;
  v_prev_id uuid := NULL;
  v_prev_data timestamptz := NULL;
  v_prev_formulacao text := NULL;
  v_prev_kg_cocho numeric := NULL;
  v_prev_n_cabecas integer := NULL;
  v_prev_qtd_bezerros integer := NULL;
  v_prev_peso_vivo_kg numeric := NULL;
  v_dias integer;
  v_animais_elegiveis integer;
  v_consumo_kg_mn numeric;
  v_consumo_kg_ms numeric;
  v_consumo_pct_pv numeric;
  v_custo_medio numeric;
  v_teor_ms numeric;
  v_custo_mn_tonelada numeric;
  v_e_creep boolean;
  v_escopo text;
  v_has_prev boolean := false;
BEGIN
  IF p_lote_id IS NULL OR p_formulacao IS NULL THEN RETURN; END IF;

  -- Escopo da série: mesma regra da versão anterior (flag e_creep da formulação
  -- informada; se ela não existir mais, infere pelos registros remanescentes).
  SELECT f.e_creep
    INTO v_e_creep
  FROM formulacoes f
  WHERE f.fazenda_id = p_fazenda_id AND f.nome = p_formulacao AND f.ativo = true
  LIMIT 1;

  IF v_e_creep IS NULL THEN
    SELECT r.escopo INTO v_escopo
    FROM registros_suplementacao r
    WHERE r.fazenda_id = p_fazenda_id AND r.lote_id = p_lote_id
      AND r.formulacao = p_formulacao AND r.deleted_at IS NULL
    ORDER BY r.data DESC LIMIT 1;
    v_escopo := COALESCE(v_escopo, 'lote');
  ELSE
    v_escopo := CASE WHEN v_e_creep THEN 'creep' ELSE 'lote' END;
  END IF;

  v_has_prev := false;

  FOR v_curr_id, v_curr_data, v_curr_formulacao, v_curr_kg_cocho, v_curr_n_cabecas, v_curr_qtd_bezerros, v_curr_peso_vivo_kg IN
    SELECT id, data, formulacao, kg_cocho, n_cabecas, qtd_bezerros, peso_vivo_kg
    FROM registros_suplementacao
    WHERE fazenda_id = p_fazenda_id AND lote_id = p_lote_id
      AND escopo = v_escopo
      AND deleted_at IS NULL
    ORDER BY data ASC, created_at ASC
  LOOP
    IF v_has_prev THEN
      v_animais_elegiveis := COALESCE(v_prev_n_cabecas, 0) - COALESCE(v_prev_qtd_bezerros, 0);
      IF v_animais_elegiveis > 0 AND v_prev_kg_cocho IS NOT NULL AND v_prev_kg_cocho > 0 THEN
        -- Teor e custo da dieta em vigor no registro que abre o intervalo
        v_teor_ms := NULL;
        v_custo_mn_tonelada := NULL;
        SELECT (v.dados->>'teor_ms_dieta')::numeric, (v.dados->>'custo_mn_tonelada')::numeric
          INTO v_teor_ms, v_custo_mn_tonelada
        FROM formulacoes_versoes v
        WHERE v.fazenda_id = p_fazenda_id
          AND (
            v.dados->>'nome' = v_prev_formulacao
            OR v.formulacao_id IN (
              SELECT f.id FROM formulacoes f
              WHERE f.fazenda_id = p_fazenda_id AND f.nome = v_prev_formulacao
            )
          )
          AND v.vigente_desde <= v_prev_data
          AND (v.vigente_ate IS NULL OR v.vigente_ate > v_prev_data)
        ORDER BY v.vigente_desde DESC
        LIMIT 1;

        IF v_teor_ms IS NULL THEN
          SELECT f.teor_ms_dieta, f.custo_mn_tonelada
            INTO v_teor_ms, v_custo_mn_tonelada
          FROM formulacoes f
          WHERE f.fazenda_id = p_fazenda_id AND f.nome = v_prev_formulacao AND f.ativo = true
          LIMIT 1;
        END IF;

        v_dias := GREATEST((v_curr_data::date - v_prev_data::date), 1);
        v_consumo_kg_mn := v_prev_kg_cocho / v_dias / v_animais_elegiveis;
        v_consumo_kg_ms := CASE WHEN v_teor_ms IS NOT NULL AND v_teor_ms > 0 THEN v_prev_kg_cocho / v_dias / v_animais_elegiveis * (v_teor_ms / 100) ELSE NULL END;
        v_consumo_pct_pv := CASE WHEN v_consumo_kg_ms IS NOT NULL AND v_prev_peso_vivo_kg IS NOT NULL AND v_prev_peso_vivo_kg > 0 THEN (v_consumo_kg_ms / v_prev_peso_vivo_kg) * 100 ELSE NULL END;
        v_custo_medio := CASE WHEN v_custo_mn_tonelada IS NOT NULL THEN (v_custo_mn_tonelada * v_consumo_kg_mn) / 1000 ELSE NULL END;
        UPDATE registros_suplementacao SET consumo_medio_geral_kg_mn = v_consumo_kg_mn, consumo_medio_30dias_kg_mn = v_consumo_kg_mn, consumo_medio_geral_kg_ms = v_consumo_kg_ms, consumo_medio_30dias_kg_ms = v_consumo_kg_ms, consumo_medio_geral_percent_pv = v_consumo_pct_pv, consumo_medio_30dias_percent_pv = v_consumo_pct_pv, custo_medio_reais_cab_dia = v_custo_medio, updated_at = NOW() WHERE id = v_prev_id;
      ELSE
        UPDATE registros_suplementacao SET consumo_medio_geral_kg_mn = NULL, consumo_medio_30dias_kg_mn = NULL, consumo_medio_geral_kg_ms = NULL, consumo_medio_30dias_kg_ms = NULL, consumo_medio_geral_percent_pv = NULL, consumo_medio_30dias_percent_pv = NULL, custo_medio_reais_cab_dia = NULL, updated_at = NOW() WHERE id = v_prev_id;
      END IF;
    END IF;

    v_prev_id := v_curr_id;
    v_prev_data := v_curr_data;
    v_prev_formulacao := v_curr_formulacao;
    v_prev_kg_cocho := v_curr_kg_cocho;
    v_prev_n_cabecas := v_curr_n_cabecas;
    v_prev_qtd_bezerros := v_curr_qtd_bezerros;
    v_prev_peso_vivo_kg := v_curr_peso_vivo_kg;
    v_has_prev := true;
  END LOOP;

  -- Último registro da série: sem intervalo fechado, sem consumo
  IF v_has_prev THEN
    UPDATE registros_suplementacao SET consumo_medio_geral_kg_mn = NULL, consumo_medio_30dias_kg_mn = NULL, consumo_medio_geral_kg_ms = NULL, consumo_medio_30dias_kg_ms = NULL, consumo_medio_geral_percent_pv = NULL, consumo_medio_30dias_percent_pv = NULL, custo_medio_reais_cab_dia = NULL, updated_at = NOW() WHERE id = v_prev_id;
  END IF;
END;
$function$;
