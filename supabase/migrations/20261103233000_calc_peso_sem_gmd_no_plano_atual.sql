-- Complementa 20261103230000: se a dieta atual não tem GMD para a categoria, o peso de entrada não serve de base
-- para voltar no tempo (Jacamim, Lote DM 1/1: 324 kg em 08/10 e 414 kg em 09/10). Usa o peso atual, como antes.

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
  v_plano_atual uuid;
  v_inicio_atual date;
  v_form_atual uuid;
  v_ate timestamptz;
  v_total_cab integer := 0;
  v_cab_com_peso integer := 0;
  v_total_peso numeric := 0;
  v_peso numeric;
  v_gmd numeric;
  v_ganho numeric;
  v_q integer;
  cat RECORD;
BEGIN
  v_plano_id := fn_plano_vigente_lote_em(p_lote_id, p_data);
  v_plano_atual := fn_plano_vigente_lote_em(p_lote_id, CURRENT_DATE);

  SELECT data_inicio, formulacao_id
  INTO v_data_inicio, v_formulacao_id
  FROM planos_nutricionais
  WHERE id = v_plano_id;

  SELECT data_inicio, formulacao_id
  INTO v_inicio_atual, v_form_atual
  FROM planos_nutricionais
  WHERE id = v_plano_atual;

  v_ate := ((p_data + 1)::timestamp AT TIME ZONE 'America/Cuiaba');

  FOR cat IN
    SELECT lc.categoria,
           lc.peso_vivo_atual_kg_cab,
           lc.data_ajuste_peso,
           pcp.peso_inicio_kg_cab AS peso_plano_data,
           COALESCE(pcp.peso_inicio_kg_cab, lc.peso_entrada_kg_cab) AS peso_inicio_cat,
           COALESCE(pcp_atual.peso_inicio_kg_cab, lc.peso_entrada_kg_cab) AS peso_inicio_atual,
           fcg.gmd AS gmd_cat,
           fcg_atual.gmd AS gmd_atual
    FROM lote_categorias lc
    LEFT JOIN plano_categoria_personalizacao pcp
      ON pcp.plano_id = v_plano_id AND pcp.lote_categoria_id = lc.id AND pcp.ativo = true
    LEFT JOIN plano_categoria_personalizacao pcp_atual
      ON pcp_atual.plano_id = v_plano_atual AND pcp_atual.lote_categoria_id = lc.id AND pcp_atual.ativo = true
    LEFT JOIN formulacao_categorias_gmd fcg
      ON fcg.formulacao_id = v_formulacao_id
     AND LOWER(TRIM(fcg.categoria)) = LOWER(TRIM(lc.categoria))
    LEFT JOIN formulacao_categorias_gmd fcg_atual
      ON fcg_atual.formulacao_id = v_form_atual
     AND LOWER(TRIM(fcg_atual.categoria)) = LOWER(TRIM(lc.categoria))
    WHERE lc.lote_id = p_lote_id
      AND lc.ativo = true
      AND LOWER(unaccent(TRIM(lc.categoria))) NOT IN ('bezerro ao pe', 'bezerra ao pe')
  LOOP
    v_q := calculate_quant_em(p_lote_id, cat.categoria, v_ate);
    IF v_q IS NULL OR v_q <= 0 THEN
      CONTINUE;
    END IF;
    v_total_cab := v_total_cab + v_q;

    v_gmd := COALESCE(cat.gmd_cat, cat.gmd_atual);

    IF cat.data_ajuste_peso IS NOT NULL AND cat.peso_vivo_atual_kg_cab IS NOT NULL AND v_gmd IS NOT NULL THEN
      IF p_data >= CURRENT_DATE THEN
        v_peso := cat.peso_vivo_atual_kg_cab + v_gmd * (p_data - CURRENT_DATE);
      ELSE
        -- Volta do peso de hoje até a data, dia a dia, com o GMD do plano vigente em cada dia.
        SELECT SUM(COALESCE(g.gmd, v_gmd)) INTO v_ganho
        FROM generate_series(p_data::timestamp, (CURRENT_DATE - 1)::timestamp, interval '1 day') AS d(dia)
        LEFT JOIN planos_nutricionais pl
          ON pl.id = fn_plano_vigente_lote_em(p_lote_id, d.dia::date)
        LEFT JOIN formulacao_categorias_gmd g
          ON g.formulacao_id = pl.formulacao_id
         AND LOWER(TRIM(g.categoria)) = LOWER(TRIM(cat.categoria));
        v_peso := cat.peso_vivo_atual_kg_cab - v_ganho;
      END IF;
    ELSIF v_data_inicio IS NOT NULL AND cat.gmd_cat IS NOT NULL
          AND cat.peso_inicio_cat IS NOT NULL
          AND (cat.peso_plano_data IS NOT NULL OR v_plano_id IS NOT DISTINCT FROM v_plano_atual) THEN
      -- Plano da data tem peso próprio, ou é o plano atual: conta a partir do início dele.
      v_peso := cat.peso_inicio_cat + cat.gmd_cat * GREATEST(p_data - v_data_inicio, 0);
    ELSIF v_inicio_atual IS NOT NULL AND cat.peso_inicio_atual IS NOT NULL AND v_gmd IS NOT NULL AND cat.gmd_atual IS NOT NULL THEN
      -- Plano antigo sem peso próprio: volta do início do plano atual até a data.
      SELECT COALESCE(SUM(COALESCE(g.gmd, v_gmd)), 0) INTO v_ganho
      FROM generate_series(p_data::timestamp, (v_inicio_atual - 1)::timestamp, interval '1 day') AS d(dia)
      LEFT JOIN planos_nutricionais pl
        ON pl.id = fn_plano_vigente_lote_em(p_lote_id, d.dia::date)
      LEFT JOIN formulacao_categorias_gmd g
        ON g.formulacao_id = pl.formulacao_id
       AND LOWER(TRIM(g.categoria)) = LOWER(TRIM(cat.categoria));
      v_peso := cat.peso_inicio_atual - v_ganho;
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
