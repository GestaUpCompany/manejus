-- Rollback de 20261103240000: volta a usar o teor e o custo atuais da dieta.

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

  -- Dieta: fabrica do trato (maior volume) -> plano vigente em p_data -> formulacao do lote.
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
    WHERE id = fn_plano_vigente_lote_em(p_lote_id, p_data)
      AND formulacao_id IS NOT NULL;
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

DROP FUNCTION public.fn_formulacao_valores_em(uuid, date);
