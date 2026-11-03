-- Rollback de 20261103220000_consumo_confinamento_plano_vigente.sql
-- Restaura o uso do plano ativo no momento do recálculo.
-- Não desfaz linhas de consumo_confinamento_dia já recalculadas: para isso, usar a tabela de backup.

CREATE OR REPLACE FUNCTION public.calc_cabecas_peso_lote_em(p_lote_id uuid, p_data date)
 RETURNS TABLE(n_cabecas integer, peso_vivo_kg numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_plano_id uuid;
  v_data_inicio date;
  v_formulacao_id uuid;
  v_ate timestamptz;
  v_total_cab integer := 0;
  v_cab_com_peso integer := 0;
  v_total_peso numeric := 0;
  v_peso numeric;
  v_q integer;
  cat RECORD;
BEGIN
  SELECT id, data_inicio, formulacao_id
  INTO v_plano_id, v_data_inicio, v_formulacao_id
  FROM planos_nutricionais
  WHERE lote_id = p_lote_id AND ativo = true AND data_fim IS NULL
  LIMIT 1;

  v_ate := ((p_data + 1)::timestamp AT TIME ZONE 'America/Cuiaba');

  FOR cat IN
    SELECT lc.categoria,
           lc.peso_vivo_atual_kg_cab,
           lc.data_ajuste_peso,
           COALESCE(pcp.peso_inicio_kg_cab, lc.peso_entrada_kg_cab) AS peso_inicio_cat,
           fcg.gmd AS gmd_cat
    FROM lote_categorias lc
    LEFT JOIN plano_categoria_personalizacao pcp
      ON pcp.plano_id = v_plano_id AND pcp.lote_categoria_id = lc.id AND pcp.ativo = true
    LEFT JOIN formulacao_categorias_gmd fcg
      ON fcg.formulacao_id = v_formulacao_id
     AND LOWER(TRIM(fcg.categoria)) = LOWER(TRIM(lc.categoria))
    WHERE lc.lote_id = p_lote_id
      AND lc.ativo = true
      AND LOWER(unaccent(TRIM(lc.categoria))) NOT IN ('bezerro ao pe', 'bezerra ao pe')
  LOOP
    v_q := calculate_quant_em(p_lote_id, cat.categoria, v_ate);
    IF v_q IS NULL OR v_q <= 0 THEN
      CONTINUE;
    END IF;
    v_total_cab := v_total_cab + v_q;

    IF cat.data_ajuste_peso IS NOT NULL AND cat.peso_vivo_atual_kg_cab IS NOT NULL AND cat.gmd_cat IS NOT NULL THEN
      v_peso := cat.peso_vivo_atual_kg_cab + cat.gmd_cat * (p_data - CURRENT_DATE);
    ELSIF cat.peso_inicio_cat IS NOT NULL AND v_data_inicio IS NOT NULL AND cat.gmd_cat IS NOT NULL THEN
      v_peso := cat.peso_inicio_cat + cat.gmd_cat * GREATEST(p_data - v_data_inicio, 0);
    ELSE
      v_peso := COALESCE(cat.peso_vivo_atual_kg_cab, cat.peso_inicio_cat);
    END IF;

    IF v_peso IS NOT NULL AND v_peso > 0 THEN
      v_total_peso := v_total_peso + v_peso * v_q;
      v_cab_com_peso := v_cab_com_peso + v_q;
    END IF;
  END LOOP;

  RETURN QUERY SELECT
    v_total_cab,
    CASE WHEN v_cab_com_peso > 0 THEN ROUND(v_total_peso / v_cab_com_peso, 2) ELSE NULL END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_consumo_confinamento_dia(p_fazenda_id uuid, p_lote_id uuid, p_data date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_n_currais integer;
  v_n_tratos integer;
  v_tratos_min integer;
  v_tratos_esp integer;
  v_incompleto boolean;
  v_ofertado numeric;
  v_consumido numeric;
  v_com_leitura integer;
  v_piso boolean;
  v_form uuid;
  v_teor numeric;
  v_custo numeric;
  v_cab integer;
  v_peso numeric;
  v_mn numeric;
  v_ms numeric;
  v_pv numeric;
  v_custo_cab numeric;
BEGIN
  WITH ofertas AS (
    SELECT o.curral_id, SUM(o.kg_ofertado_real) AS kg, COUNT(*) AS n,
           GREATEST(MAX(o.ordem_trato), COALESCE(MAX(pt.quantidade_tratos), 0)) AS esperado
    FROM registros_oferta_trato o
    LEFT JOIN programacao_tratos pt ON pt.id = o.programacao_id
    WHERE o.fazenda_id = p_fazenda_id
      AND o.deleted_at IS NULL
      AND o.kg_ofertado_real IS NOT NULL
      AND (o.data AT TIME ZONE 'America/Cuiaba')::date = p_data
      AND COALESCE(o.lote_id, fn_lote_do_curral_em(o.curral_id, p_data)) = p_lote_id
    GROUP BY o.curral_id
  ),
  leit AS (
    SELECT DISTINCT ON (of.curral_id) of.curral_id, l.leitura_cocho, l.nota_config_id
    FROM ofertas of
    JOIN registros_leitura_cocho l
      ON l.fazenda_id = p_fazenda_id
     AND l.deleted_at IS NULL
     AND l.leitura_cocho IS NOT NULL
     AND (l.data AT TIME ZONE 'America/Cuiaba')::date = p_data + 1
     AND (l.curral_id = of.curral_id OR (l.curral_id IS NULL AND l.lote_id = p_lote_id))
    ORDER BY of.curral_id, (l.curral_id IS NOT NULL) DESC, l.created_at DESC
  ),
  ajuste AS (
    SELECT lt.curral_id, lt.leitura_cocho,
           COALESCE(c1.percentual_ajuste, c2.percentual_ajuste) AS pct
    FROM leit lt
    LEFT JOIN notas_leitura_cocho_config c1 ON c1.id = lt.nota_config_id
    LEFT JOIN notas_leitura_cocho_config c2
      ON c2.fazenda_id = p_fazenda_id AND c2.nota = lt.leitura_cocho
  )
  SELECT COUNT(*),
         SUM(of.n),
         SUM(of.kg),
         SUM(of.kg * COALESCE(LEAST(1, 1 + a.pct / 100), 1)),
         COUNT(a.pct),
         COALESCE(BOOL_OR(a.pct IS NOT NULL AND a.leitura_cocho <= 0), false),
         MIN(of.n), MAX(of.esperado), BOOL_OR(of.n < of.esperado)
  INTO v_n_currais, v_n_tratos, v_ofertado, v_consumido, v_com_leitura, v_piso,
       v_tratos_min, v_tratos_esp, v_incompleto
  FROM ofertas of
  LEFT JOIN ajuste a ON a.curral_id = of.curral_id;

  IF v_n_currais IS NULL OR v_n_currais = 0 OR v_ofertado IS NULL OR v_ofertado <= 0 THEN
    DELETE FROM consumo_confinamento_dia WHERE lote_id = p_lote_id AND data = p_data;
    RETURN;
  END IF;

  -- Dieta: fabrica do trato (maior volume) -> plano ativo do lote -> formulacao do lote.
  SELECT f.formulacao_id
  INTO v_form
  FROM registros_oferta_trato o
  JOIN registros_fabrica_confinamento f ON f.id = o.fabrica_confinamento_id
  WHERE o.fazenda_id = p_fazenda_id
    AND o.deleted_at IS NULL
    AND o.kg_ofertado_real IS NOT NULL
    AND (o.data AT TIME ZONE 'America/Cuiaba')::date = p_data
    AND COALESCE(o.lote_id, fn_lote_do_curral_em(o.curral_id, p_data)) = p_lote_id
    AND f.formulacao_id IS NOT NULL
  GROUP BY f.formulacao_id
  ORDER BY SUM(o.kg_ofertado_real) DESC
  LIMIT 1;

  IF v_form IS NULL THEN
    SELECT formulacao_id INTO v_form
    FROM planos_nutricionais
    WHERE lote_id = p_lote_id AND ativo = true AND data_fim IS NULL AND formulacao_id IS NOT NULL
    LIMIT 1;
  END IF;
  IF v_form IS NULL THEN
    SELECT formulacao_id INTO v_form FROM lotes WHERE id = p_lote_id;
  END IF;
  IF v_form IS NOT NULL THEN
    SELECT teor_ms_dieta, custo_mn_tonelada INTO v_teor, v_custo FROM formulacoes WHERE id = v_form;
  END IF;

  SELECT c.n_cabecas, c.peso_vivo_kg INTO v_cab, v_peso FROM calc_cabecas_peso_lote_em(p_lote_id, p_data) c;

  IF v_cab IS NOT NULL AND v_cab > 0 THEN
    v_mn := v_consumido / v_cab;
    IF v_teor IS NOT NULL AND v_teor > 0 THEN
      v_ms := v_mn * v_teor / 100;
      IF v_peso IS NOT NULL AND v_peso > 0 THEN
        v_pv := v_ms / v_peso * 100;
      END IF;
    END IF;
    IF v_custo IS NOT NULL THEN
      v_custo_cab := v_mn * v_custo / 1000;
    END IF;
  END IF;

  INSERT INTO consumo_confinamento_dia (
    fazenda_id, lote_id, data, n_currais, n_tratos, kg_ofertado_mn, kg_consumido_mn, fator_consumo,
    currais_com_leitura, leitura_confirmada, consumo_piso, formulacao_id, teor_ms_dieta, custo_mn_tonelada,
    n_cabecas, peso_vivo_kg, kg_mn_cab_dia, kg_ms_cab_dia, consumo_percent_pv, custo_reais_cab_dia,
    fora_faixa_pv, tratos_min_curral, tratos_esperados, dia_incompleto, calculado_em
  ) VALUES (
    p_fazenda_id, p_lote_id, p_data, v_n_currais, v_n_tratos, v_ofertado, v_consumido,
    ROUND(v_consumido / v_ofertado, 4),
    v_com_leitura, (v_com_leitura = v_n_currais), v_piso, v_form, v_teor, v_custo,
    v_cab, v_peso, v_mn, v_ms, v_pv, v_custo_cab,
    (v_pv IS NOT NULL AND (v_pv < 2.0 OR v_pv > 3.5)),
    v_tratos_min, v_tratos_esp, COALESCE(v_incompleto, false), now()
  )
  ON CONFLICT (lote_id, data) DO UPDATE SET
    fazenda_id = EXCLUDED.fazenda_id,
    n_currais = EXCLUDED.n_currais,
    n_tratos = EXCLUDED.n_tratos,
    kg_ofertado_mn = EXCLUDED.kg_ofertado_mn,
    kg_consumido_mn = EXCLUDED.kg_consumido_mn,
    fator_consumo = EXCLUDED.fator_consumo,
    currais_com_leitura = EXCLUDED.currais_com_leitura,
    leitura_confirmada = EXCLUDED.leitura_confirmada,
    consumo_piso = EXCLUDED.consumo_piso,
    formulacao_id = EXCLUDED.formulacao_id,
    teor_ms_dieta = EXCLUDED.teor_ms_dieta,
    custo_mn_tonelada = EXCLUDED.custo_mn_tonelada,
    n_cabecas = EXCLUDED.n_cabecas,
    peso_vivo_kg = EXCLUDED.peso_vivo_kg,
    kg_mn_cab_dia = EXCLUDED.kg_mn_cab_dia,
    kg_ms_cab_dia = EXCLUDED.kg_ms_cab_dia,
    consumo_percent_pv = EXCLUDED.consumo_percent_pv,
    custo_reais_cab_dia = EXCLUDED.custo_reais_cab_dia,
    fora_faixa_pv = EXCLUDED.fora_faixa_pv,
    tratos_min_curral = EXCLUDED.tratos_min_curral,
    tratos_esperados = EXCLUDED.tratos_esperados,
    dia_incompleto = EXCLUDED.dia_incompleto,
    calculado_em = EXCLUDED.calculado_em;
END;
$function$;

DROP FUNCTION public.fn_plano_vigente_lote_em(uuid, date);
