-- Corrige a data prevista final do relatório de consumo.
-- A data deve representar o fim projetado da formulação/categoria vigente,
-- independentemente do intervalo de datas usado no relatório.

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_consumo(
  p_token uuid,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
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

  -- LAG sem filtro de data: busca o registro anterior do lote mesmo se estiver fora do periodo
  WITH registros_windowed AS (
    SELECT
      r.lote_id,
      r.data,
      r.created_at,
      r.n_cabecas,
      r.peso_vivo_kg,
      r.qtd_bezerros,
      to_char(r.data AT TIME ZONE 'America/Cuiaba', 'DD/MM') AS data_label,
      (r.data AT TIME ZONE 'America/Cuiaba')::date AS data_local,
      LAG(r.kg_cocho) OVER w AS lag_kg_cocho,
      LAG(r.n_cabecas) OVER w AS lag_n_cabecas,
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
    WINDOW w AS (PARTITION BY r.lote_id ORDER BY r.data, r.created_at)
  ),
  dados_por_lote AS (
    SELECT
      lote_id,
      jsonb_agg(jsonb_build_object(
        'data', to_char(data AT TIME ZONE 'America/Cuiaba', 'YYYY-MM-DD'),
        'data_label', data_label,
        'trato_kg_cab_dia',
          CASE WHEN lag_kg_cocho IS NOT NULL AND lag_data IS NOT NULL THEN
            lag_kg_cocho / GREATEST(1, ((data AT TIME ZONE 'America/Cuiaba')::date - (lag_data AT TIME ZONE 'America/Cuiaba')::date)) / GREATEST(1, COALESCE(lag_n_cabecas, 0) - COALESCE(lag_qtd_bezerros, 0))
          ELSE NULL END,
        'consumo_percent_pv', COALESCE(lag_consumo_percent_pv, 0),
        'leitura_cocho', CASE WHEN lag_leitura IS NOT NULL AND lag_leitura ~ '^[0-9]+([.][0-9]*)?$' THEN lag_leitura::numeric ELSE NULL END,
        'custo_reais_cab_dia', lag_custo
      ) ORDER BY data) AS dados
    FROM registros_windowed
    WHERE lag_data IS NOT NULL
      AND (p_data_inicio IS NULL OR data_local >= p_data_inicio)
      AND (p_data_fim IS NULL OR data_local <= p_data_fim)
    GROUP BY lote_id
  ),
  lotes_com_registros AS (
    SELECT DISTINCT lote_id
    FROM registros_windowed
    WHERE lag_data IS NOT NULL
      AND (p_data_inicio IS NULL OR data_local >= p_data_inicio)
      AND (p_data_fim IS NULL OR data_local <= p_data_fim)
  ),
  -- Ultimo registro dentro do periodo filtrado para cada lote
  ultimo_registro_por_lote AS (
    SELECT DISTINCT ON (lote_id)
      lote_id,
      data,
      n_cabecas,
      peso_vivo_kg,
      (data AT TIME ZONE 'America/Cuiaba')::date AS data_local
    FROM registros_windowed
    WHERE (p_data_inicio IS NULL OR data_local >= p_data_inicio)
      AND (p_data_fim IS NULL OR data_local <= p_data_fim)
    ORDER BY lote_id, data DESC, created_at DESC
  ),
  -- Primeiro registro dentro do periodo filtrado para cada lote
  primeiro_registro_por_lote AS (
    SELECT DISTINCT ON (lote_id)
      lote_id,
      data,
      (data AT TIME ZONE 'America/Cuiaba')::date AS data_local
    FROM registros_windowed
    WHERE (p_data_inicio IS NULL OR data_local >= p_data_inicio)
      AND (p_data_fim IS NULL OR data_local <= p_data_fim)
    ORDER BY lote_id, data ASC, created_at ASC
  ),
  -- Categorias vigentes na data do ultimo registro (nao as de hoje)
  cats_no_periodo AS (
    SELECT
      ur.lote_id,
      ur.data AS ref_data,
      ur.n_cabecas AS reg_n_cabecas,
      ur.peso_vivo_kg AS reg_peso_vivo_kg,
      lc.id AS lote_categoria_id,
      lc.categoria,
      lc.raca,
      lc.quant_atual,
      lc.peso_entrada_kg_cab,
      lc.peso_vivo_atual_kg_cab,
      lc.data_meta_projetada,
      lc.formulacao_id,
      pn.id AS plano_id,
      pn.data_inicio AS plano_data_inicio,
      pn.formulacao_id AS plano_formulacao_id
    FROM ultimo_registro_por_lote ur
    JOIN lote_categorias lc ON lc.lote_id = ur.lote_id
      AND lc.ativo = true
      AND lc.created_at::date <= ur.data_local
      AND (lc.data_fim IS NULL OR lc.data_fim >= ur.data_local)
    LEFT JOIN planos_nutricionais pn ON pn.lote_categoria_id = lc.id
      AND pn.ativo = true
      AND pn.fazenda_id = v_fazenda_id
      AND pn.data_inicio <= ur.data
      AND (pn.data_fim IS NULL OR pn.data_fim >= ur.data)
  ),
  cats_com_erro AS (
    SELECT
      lote_id,
      jsonb_agg(jsonb_build_object(
        'categoria', categoria,
        'dados_faltantes', to_jsonb(array_remove(ARRAY[
          CASE WHEN peso_entrada_kg_cab IS NULL THEN 'peso_entrada_kg_cab' END,
          CASE WHEN reg_peso_vivo_kg IS NULL THEN 'peso_vivo_kg' END,
          CASE WHEN reg_n_cabecas IS NULL OR reg_n_cabecas <= 0 THEN 'n_cabecas' END
        ], NULL))
      )) AS erros
    FROM cats_no_periodo
    WHERE peso_entrada_kg_cab IS NULL
       OR reg_peso_vivo_kg IS NULL
       OR reg_n_cabecas IS NULL OR reg_n_cabecas <= 0
    GROUP BY lote_id
  ),
  info_lotes AS (
    SELECT
      cnp.lote_id,
      l.nome AS lote_nome,
      cnp.reg_n_cabecas AS n_cabecas_atual,
      cnp.reg_peso_vivo_kg AS peso_vivo_atual_kg_cab,
      CASE WHEN cce.erros IS NULL AND SUM(cnp.quant_atual) > 0 THEN
        ROUND((SUM(cnp.peso_entrada_kg_cab * cnp.quant_atual) / SUM(cnp.quant_atual))::numeric, 2)
      END AS peso_entrada_kg_cab,
      CASE WHEN cce.erros IS NULL AND COUNT(DISTINCT cnp.raca) = 1 THEN MAX(cnp.raca)
           WHEN cce.erros IS NULL THEN 'Misto' END AS raca,
      CASE WHEN cce.erros IS NULL THEN string_agg(cnp.categoria, ', ' ORDER BY cnp.categoria) END AS categoria,
      CASE WHEN cce.erros IS NULL THEN (
        SELECT f.nome FROM cats_no_periodo c2
        LEFT JOIN formulacoes f ON f.id = COALESCE(c2.formulacao_id, c2.plano_formulacao_id)
        WHERE c2.lote_id = cnp.lote_id AND f.nome IS NOT NULL
        ORDER BY c2.quant_atual DESC NULLS LAST
        LIMIT 1
      ) END AS dieta,
      CASE WHEN cce.erros IS NULL THEN to_char(COALESCE(p_data_inicio, pr.data_local), 'YYYY-MM-DD') END AS data_inicio_plano,
      CASE WHEN cce.erros IS NULL THEN
        GREATEST(0, (COALESCE(p_data_fim, (now() AT TIME ZONE 'America/Cuiaba')::date) - COALESCE(p_data_inicio, pr.data_local)))
      END AS dias,
      CASE WHEN cce.erros IS NULL THEN to_char(MAX(cnp.data_meta_projetada), 'YYYY-MM-DD') END AS data_prevista_final,
      cce.erros
    FROM cats_no_periodo cnp
    JOIN lotes l ON l.id = cnp.lote_id AND l.ativo = true
    LEFT JOIN cats_com_erro cce ON cce.lote_id = cnp.lote_id
    LEFT JOIN primeiro_registro_por_lote pr ON pr.lote_id = cnp.lote_id
    GROUP BY cnp.lote_id, l.nome, cnp.reg_n_cabecas, cnp.reg_peso_vivo_kg, cce.erros, pr.data_local
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'lote_id', il.lote_id,
    'lote_nome', il.lote_nome,
    'info', jsonb_build_object(
      'lote_id', il.lote_id,
      'lote_nome', il.lote_nome,
      'peso_entrada_kg', il.peso_entrada_kg_cab,
      'peso_atual_kg', il.peso_vivo_atual_kg_cab,
      'data_prevista_final', il.data_prevista_final,
      'n_cabecas_atual', il.n_cabecas_atual,
      'raca', il.raca,
      'categoria', il.categoria,
      'dieta', il.dieta,
      'data_inicio_plano', il.data_inicio_plano,
      'dias', il.dias,
      'erro', il.erros
    ),
    'dados', COALESCE(dp.dados, '[]'::jsonb)
  ) ORDER BY il.lote_nome), '[]'::jsonb)
  INTO v_lotes FROM info_lotes il LEFT JOIN dados_por_lote dp ON dp.lote_id = il.lote_id;

  RETURN jsonb_build_object('fazenda_id', v_fazenda_id, 'dados', jsonb_build_object(
    'fazenda_nome', v_fazenda_nome, 'fazenda_logo_url', v_fazenda_logo_url,
    'lotes', v_lotes, 'lotes_disponiveis', v_lotes_disponiveis));
END;
$function$;
