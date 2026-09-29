-- RPC get_dados_relatorio_consumo: adiciona pasto_nome/curral_nome ao info
-- ----------------------------------------------------------------------------
-- Novo pill "Pasto"/"Curral" no relatório de consumo (página pública, PDF
-- individual e seção de consumo do infográfico). A localização atual do lote
-- vem de duas fontes mutuamente exclusivas (trigger trg_*_pasto_curral_exclusivo):
--   - lotes.pasto_id -> pastos.nome        (lote em pasto)
--   - currais.lote_id -> currais.nome      (lote confinado)
-- Os campos são calculados por lote e independem do escopo da série (a entrada
-- escopo='creep' mostra a mesma localização do lote). Não são bloqueados por
-- cce.erros: a localização é válida mesmo quando faltam dados de categoria.
CREATE OR REPLACE FUNCTION public.get_dados_relatorio_consumo(
  p_token uuid,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET timezone TO 'America/Cuiaba'
AS $function$
DECLARE
  v_fazenda_id uuid;
  v_ativo boolean;
  v_expira timestamptz;
  v_fazenda_nome text;
  v_fazenda_logo_url text;
  v_lotes jsonb;
  v_lotes_disponiveis jsonb;
BEGIN
  SELECT fazenda_id, ativo, expira_em INTO v_fazenda_id, v_ativo, v_expira
  FROM relatorios_publicos
  WHERE id = p_token AND tipo = 'consumo';

  IF NOT FOUND OR v_ativo = false OR (v_expira IS NOT NULL AND v_expira < now()) THEN
    RAISE EXCEPTION 'Token invalido ou expirado';
  END IF;

  SELECT nome, logo_url INTO v_fazenda_nome, v_fazenda_logo_url
  FROM fazendas WHERE id = v_fazenda_id;

  -- Lotes disponíveis (todos com registros, sem filtro de data, para o slicer)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('lote_id', l.id, 'lote_nome', l.nome) ORDER BY l.nome), '[]'::jsonb)
  INTO v_lotes_disponiveis
  FROM (
    SELECT DISTINCT r.lote_id
    FROM registros_suplementacao r
    WHERE r.fazenda_id = v_fazenda_id
      AND r.deleted_at IS NULL
      AND r.lote_id IS NOT NULL
  ) regs
  JOIN lotes l ON l.id = regs.lote_id AND l.ativo = true;

  -- Dados calculados por lote + escopo
  WITH registros_windowed AS (
    SELECT
      r.lote_id,
      r.escopo,
      r.data,
      to_char(r.data AT TIME ZONE 'America/Cuiaba', 'DD/MM') AS data_label,
      LAG(r.kg_cocho) OVER w AS lag_kg_cocho,
      LAG(r.n_cabecas) Over w AS lag_n_cabecas,
      LAG(r.qtd_bezerros) OVER w AS lag_qtd_bezerros,
      LAG(r.consumo_medio_geral_percent_pv) OVER w AS lag_consumo_percent_pv,
      LAG(r.leitura) OVER w AS lag_leitura,
      LAG(r.custo_medio_reais_cab_dia) OVER w AS lag_custo,
      LAG(r.data) OVER w AS lag_data
    FROM registros_suplementacao r
    WHERE r.fazenda_id = v_fazenda_id
      AND r.deleted_at IS NULL
      AND r.lote_id IS NOT NULL
      AND r.lote_id IN (SELECT id FROM lotes WHERE ativo = true)
      AND (p_data_inicio IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date >= p_data_inicio)
      AND (p_data_fim IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date <= p_data_fim)
    WINDOW w AS (PARTITION BY r.lote_id, r.escopo ORDER BY r.data, r.created_at)
  ),
  dados_por_lote AS (
    SELECT
      lote_id,
      escopo,
      jsonb_agg(jsonb_build_object(
        'data', to_char(data AT TIME ZONE 'America/Cuiaba', 'YYYY-MM-DD'),
        'data_label', data_label,
        'trato_kg_cab_dia',
          CASE WHEN lag_kg_cocho IS NOT NULL AND lag_data IS NOT NULL THEN
            lag_kg_cocho / GREATEST(1, ((data AT TIME ZONE 'America/Cuiaba')::date - (lag_data AT TIME ZONE 'America/Cuiaba')::date)) / GREATEST(1, COALESCE(lag_n_cabecas, 0) - COALESCE(lag_qtd_bezerros, 0))
          ELSE NULL END,
        'consumo_percent_pv', COALESCE(lag_consumo_percent_pv, 0),
        'leitura_cocho', CASE WHEN lag_leitura IS NOT NULL AND lag_leitura ~ '^[0-9]+\.?[0-9]*$' THEN lag_leitura::numeric ELSE NULL END,
        'custo_reais_cab_dia', lag_custo
      ) ORDER BY data) AS dados
    FROM registros_windowed
    WHERE lag_data IS NOT NULL
    GROUP BY lote_id, escopo
  ),
  lotes_com_registros AS (
    SELECT DISTINCT lote_id, escopo
    FROM registros_suplementacao
    WHERE fazenda_id = v_fazenda_id
      AND deleted_at IS NULL
      AND lote_id IS NOT NULL
      AND lote_id IN (SELECT id FROM lotes WHERE ativo = true)
      AND (p_data_inicio IS NULL OR (data AT TIME ZONE 'America/Cuiaba')::date >= p_data_inicio)
      AND (p_data_fim IS NULL OR (data AT TIME ZONE 'America/Cuiaba')::date <= p_data_fim)
  ),
  -- Categorias do lote, filtradas pelo escopo da série:
  --   escopo 'lote'  → categorias não-ao-pé
  --   escopo 'creep' → apenas bezerro(a) ao pé (dieta via lc.formulacao_id)
  cats_por_lote AS (
    SELECT
      lcr.lote_id,
      lcr.escopo,
      lc.id AS lote_categoria_id,
      lc.categoria,
      lc.raca,
      lc.quant_atual,
      lc.peso_entrada_kg_cab,
      lc.peso_vivo_atual_kg_cab,
      lc.data_meta_projetada,
      lc.formulacao_id,
      lc.peso_vivo_meta_kg_cab,
      l.formulacao_id AS lote_formulacao_id,
      pn.id AS plano_id,
      pn.data_inicio AS plano_data_inicio,
      pn.formulacao_id AS plano_formulacao_id,
      pn_lote.id AS plano_lote_id,
      pn_lote.data_inicio AS plano_lote_data_inicio,
      pn_lote.formulacao_id AS plano_lote_formulacao_id,
      pn_lote.periodo_dias AS plano_lote_periodo_dias,
      pcp.periodo_dias AS pcp_periodo_dias
    FROM lotes_com_registros lcr
    JOIN lotes l ON l.id = lcr.lote_id AND l.ativo = true
    JOIN lote_categorias lc ON lc.lote_id = lcr.lote_id AND lc.ativo = true AND lc.data_fim IS NULL
      AND (
        (lcr.escopo = 'creep' AND lower(unaccent(trim(lc.categoria))) IN ('bezerro ao pe', 'bezerra ao pe'))
        OR (lcr.escopo <> 'creep' AND lower(unaccent(trim(lc.categoria))) NOT IN ('bezerro ao pe', 'bezerra ao pe'))
      )
    -- Plano ativo vinculado à categoria (modelo antigo)
    LEFT JOIN LATERAL (
      SELECT * FROM planos_nutricionais
      WHERE lote_categoria_id = lc.id AND ativo = true AND fazenda_id = v_fazenda_id
      ORDER BY data_inicio DESC NULLS LAST LIMIT 1
    ) pn ON true
    -- Plano ativo vinculado ao lote (modelo atual)
    LEFT JOIN LATERAL (
      SELECT * FROM planos_nutricionais
      WHERE lote_id = lcr.lote_id AND lote_categoria_id IS NULL AND ativo = true AND data_fim IS NULL AND fazenda_id = v_fazenda_id
      ORDER BY data_inicio DESC NULLS LAST LIMIT 1
    ) pn_lote ON true
    -- Personalização do plano efetivo para a categoria
    LEFT JOIN plano_categoria_personalizacao pcp
      ON pcp.plano_id = COALESCE(pn.id, pn_lote.id)
      AND pcp.lote_categoria_id = lc.id
      AND pcp.ativo = true
  ),
  primeira_dieta_por_lote AS (
    SELECT todas.lote_id, MIN(todas.data_inicio) AS data_inicio
    FROM (
      SELECT p.lote_id, p.data_inicio
      FROM planos_nutricionais p
      WHERE p.fazenda_id = v_fazenda_id
        AND p.lote_id IS NOT NULL
        AND p.data_inicio IS NOT NULL
      UNION ALL
      SELECT lc.lote_id, p.data_inicio
      FROM planos_nutricionais p
      JOIN lote_categorias lc ON lc.id = p.lote_categoria_id
      WHERE p.fazenda_id = v_fazenda_id
        AND p.data_inicio IS NOT NULL
    ) todas
    GROUP BY todas.lote_id
  ),
  -- "Início" da dieta creep = primeiro registro creep do lote (sem plano)
  primeiro_creep_por_lote AS (
    SELECT lote_id, MIN((data AT TIME ZONE 'America/Cuiaba')::date) AS data_inicio
    FROM registros_suplementacao
    WHERE fazenda_id = v_fazenda_id
      AND escopo = 'creep'
      AND deleted_at IS NULL
      AND lote_id IS NOT NULL
    GROUP BY lote_id
  ),
  -- Localização atual por lote: pasto via lotes.pasto_id, curral via
  -- currais.lote_id (exclusivos por trigger). Independe de categoria/escopo.
  localizacao_por_lote AS (
    SELECT
      l.id AS lote_id,
      pa.nome AS pasto_nome,
      cu.nome AS curral_nome
    FROM lotes l
    LEFT JOIN pastos pa ON pa.id = l.pasto_id
    LEFT JOIN LATERAL (
      SELECT c.nome
      FROM currais c
      WHERE c.lote_id = l.id
        AND c.ativo = true
        AND c.deleted_at IS NULL
      ORDER BY c.nome
      LIMIT 1
    ) cu ON true
    WHERE l.fazenda_id = v_fazenda_id
  ),
  cats_com_erro AS (
    SELECT
      lote_id,
      escopo,
      jsonb_agg(jsonb_build_object(
        'categoria', categoria,
        'dados_faltantes', to_jsonb(array_remove(ARRAY[
          CASE WHEN peso_entrada_kg_cab IS NULL THEN 'peso_entrada_kg_cab' END,
          CASE WHEN peso_vivo_atual_kg_cab IS NULL THEN 'peso_vivo_atual_kg_cab' END,
          CASE WHEN quant_atual IS NULL OR quant_atual <= 0 THEN 'quant_atual' END
        ], NULL))
      )) AS erros
    FROM cats_por_lote
    WHERE peso_entrada_kg_cab IS NULL
       OR peso_vivo_atual_kg_cab IS NULL
       OR quant_atual IS NULL OR quant_atual <= 0
    GROUP BY lote_id, escopo
  ),
  info_lotes AS (
    SELECT
      cpl.lote_id,
      cpl.escopo,
      l.nome AS lote_nome,
      loc.pasto_nome,
      loc.curral_nome,
      CASE WHEN cce.erros IS NULL AND SUM(cpl.quant_atual) > 0 THEN
        ROUND((SUM(cpl.peso_entrada_kg_cab * cpl.quant_atual) / SUM(cpl.quant_atual))::numeric, 2)
      END AS peso_entrada_kg_cab,
      CASE WHEN cce.erros IS NULL AND SUM(cpl.quant_atual) > 0 THEN
        ROUND((SUM(cpl.peso_vivo_atual_kg_cab * cpl.quant_atual) / SUM(cpl.quant_atual))::numeric, 2)
      END AS peso_vivo_atual_kg_cab,
      CASE WHEN cce.erros IS NULL THEN SUM(cpl.quant_atual) END AS n_cabecas_atual,
      CASE WHEN cce.erros IS NULL AND COUNT(DISTINCT cpl.raca) = 1 THEN MAX(cpl.raca)
           WHEN cce.erros IS NULL THEN 'Misto' END AS raca,
      CASE WHEN cce.erros IS NULL THEN string_agg(cpl.categoria, ', ' ORDER BY cpl.categoria) END AS categoria,
      CASE WHEN cce.erros IS NULL THEN (
        SELECT f.nome FROM cats_por_lote c2
        LEFT JOIN formulacoes f ON f.id = COALESCE(c2.formulacao_id, c2.plano_formulacao_id, c2.plano_lote_formulacao_id, c2.lote_formulacao_id)
        WHERE c2.lote_id = cpl.lote_id AND c2.escopo = cpl.escopo AND f.nome IS NOT NULL
        ORDER BY c2.quant_atual DESC NULLS LAST
        LIMIT 1
      ) END AS dieta,
      CASE WHEN cce.erros IS NULL AND cpl.escopo <> 'creep' THEN to_char(MIN(COALESCE(cpl.plano_data_inicio, cpl.plano_lote_data_inicio)), 'YYYY-MM-DD')
           WHEN cce.erros IS NULL THEN to_char(pcp2.data_inicio, 'YYYY-MM-DD') END AS data_inicio_plano,
      CASE WHEN cce.erros IS NULL AND cpl.escopo <> 'creep' AND MIN(COALESCE(cpl.plano_data_inicio, cpl.plano_lote_data_inicio)) IS NOT NULL THEN
        GREATEST(0, ((now() AT TIME ZONE 'America/Cuiaba')::date - MIN(COALESCE(cpl.plano_data_inicio, cpl.plano_lote_data_inicio))::date))
           WHEN cce.erros IS NULL AND cpl.escopo = 'creep' AND pcp2.data_inicio IS NOT NULL THEN
        GREATEST(0, ((now() AT TIME ZONE 'America/Cuiaba')::date - pcp2.data_inicio::date))
      END AS dias,
      CASE WHEN cce.erros IS NULL AND cpl.escopo <> 'creep' AND pdl.data_inicio IS NOT NULL THEN
        GREATEST(0, ((now() AT TIME ZONE 'America/Cuiaba')::date - pdl.data_inicio::date))
           WHEN cce.erros IS NULL AND cpl.escopo = 'creep' AND pcp2.data_inicio IS NOT NULL THEN
        GREATEST(0, ((now() AT TIME ZONE 'America/Cuiaba')::date - pcp2.data_inicio::date))
      END AS dias_total,
      CASE WHEN cce.erros IS NULL AND cpl.escopo <> 'creep' THEN
        COALESCE(
          to_char(MAX(cpl.data_meta_projetada), 'YYYY-MM-DD'),
          to_char(
            (MIN(COALESCE(cpl.plano_data_inicio, cpl.plano_lote_data_inicio)) + MAX(COALESCE(cpl.pcp_periodo_dias, cpl.plano_lote_periodo_dias)))::date,
            'YYYY-MM-DD'
          )
        )
      END AS data_prevista_final,
      cce.erros
    FROM cats_por_lote cpl
    JOIN lotes l ON l.id = cpl.lote_id AND l.ativo = true
    LEFT JOIN localizacao_por_lote loc ON loc.lote_id = cpl.lote_id
    LEFT JOIN primeira_dieta_por_lote pdl ON pdl.lote_id = cpl.lote_id
    LEFT JOIN primeiro_creep_por_lote pcp2 ON pcp2.lote_id = cpl.lote_id
    LEFT JOIN cats_com_erro cce ON cce.lote_id = cpl.lote_id AND cce.escopo = cpl.escopo
    GROUP BY cpl.lote_id, cpl.escopo, l.nome, loc.pasto_nome, loc.curral_nome, cce.erros, pdl.data_inicio, pcp2.data_inicio
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'lote_id', il.lote_id,
    'lote_nome', il.lote_nome,
    'escopo', il.escopo,
    'info', jsonb_build_object(
      'lote_id', il.lote_id,
      'lote_nome', il.lote_nome,
      'escopo', il.escopo,
      'pasto_nome', il.pasto_nome,
      'curral_nome', il.curral_nome,
      'peso_entrada_kg', il.peso_entrada_kg_cab,
      'peso_atual_kg', il.peso_vivo_atual_kg_cab,
      'data_prevista_final', il.data_prevista_final,
      'n_cabecas_atual', il.n_cabecas_atual,
      'raca', il.raca,
      'categoria', il.categoria,
      'dieta', il.dieta,
      'data_inicio_plano', il.data_inicio_plano,
      'dias', il.dias,
      'dias_total', il.dias_total,
      'erro', il.erros
    ),
    'dados', COALESCE(dp.dados, '[]'::jsonb)
  ) ORDER BY il.dieta NULLS LAST, il.lote_nome), '[]'::jsonb)
  INTO v_lotes
  FROM info_lotes il
  LEFT JOIN dados_por_lote dp ON dp.lote_id = il.lote_id AND dp.escopo = il.escopo;

  RETURN jsonb_build_object(
    'fazenda_id', v_fazenda_id,
    'dados', jsonb_build_object(
      'fazenda_nome', v_fazenda_nome,
      'fazenda_logo_url', v_fazenda_logo_url,
      'lotes', v_lotes,
      'lotes_disponiveis', v_lotes_disponiveis
    )
  );
END;
$function$;
