-- Corrige o cálculo de rebanho_total na RPC de mortalidade.
-- A contagem de cabeças passa a usar lote_categorias.quant_atual,
-- que é a tabela de origem do dado, em vez de lotes.n_cabecas/numero_cabecas.

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_morte(
  p_token uuid,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fazenda_id uuid;
  v_ativo boolean;
  v_expira timestamptz;
  v_fazenda_nome text;
  v_fazenda_logo_url text;
  v_timezone text;
  v_linhas jsonb;
  v_lotes_disponiveis jsonb;
  v_causas_disponiveis jsonb;
  v_categorias_disponiveis jsonb;
  v_sexos_disponiveis jsonb;
  v_pastos_disponiveis jsonb;
  v_resumo jsonb;
  v_total_mortes bigint;
  v_dias_distintos bigint;
  v_media_por_dia numeric;
  v_peso_medio numeric;
  v_causa_mais_frequente text;
  v_causa_mais_frequente_count bigint;
  v_rebanho_total integer;
  v_taxa_mortalidade numeric;
  v_periodo_inicio_eff date;
  v_periodo_fim_eff date;
  v_duracao_dias integer;
  v_prev_inicio date;
  v_prev_fim date;
  v_prev_total_mortes bigint;
  v_prev_dias_distintos bigint;
  v_prev_media_por_dia numeric;
  v_prev_peso_medio numeric;
  v_prev_taxa_mortalidade numeric;
  v_periodo_anterior jsonb;
BEGIN
  SELECT fazenda_id, ativo, expira_em INTO v_fazenda_id, v_ativo, v_expira
  FROM relatorios_publicos
  WHERE id = p_token AND tipo = 'morte';

  IF NOT FOUND OR v_ativo = false OR (v_expira IS NOT NULL AND v_expira < now()) THEN
    RAISE EXCEPTION 'Token invalido ou expirado';
  END IF;

  SELECT nome, logo_url, COALESCE(timezone, 'America/Cuiaba') INTO v_fazenda_nome, v_fazenda_logo_url, v_timezone
  FROM fazendas
  WHERE id = v_fazenda_id;

  SELECT COALESCE(SUM(COALESCE(lc.quant_atual, 0)), 0)
  INTO v_rebanho_total
  FROM lote_categorias lc
  JOIN lotes l ON l.id = lc.lote_id
  WHERE l.fazenda_id = v_fazenda_id
    AND l.deleted_at IS NULL
    AND lc.ativo = true;

  IF p_data_inicio IS NOT NULL AND p_data_fim IS NOT NULL THEN
    v_periodo_inicio_eff := p_data_inicio;
    v_periodo_fim_eff := p_data_fim;
  ELSIF p_data_inicio IS NOT NULL AND p_data_fim IS NULL THEN
    v_periodo_inicio_eff := p_data_inicio;
    v_periodo_fim_eff := CURRENT_DATE;
  ELSIF p_data_inicio IS NULL AND p_data_fim IS NOT NULL THEN
    v_periodo_fim_eff := p_data_fim;
    SELECT MIN((r.data AT TIME ZONE v_timezone)::date) INTO v_periodo_inicio_eff
    FROM registros_morte r
    WHERE r.fazenda_id = v_fazenda_id AND r.deleted_at IS NULL
      AND (r.data AT TIME ZONE v_timezone)::date <= p_data_fim;
    IF v_periodo_inicio_eff IS NULL THEN
      v_periodo_inicio_eff := p_data_fim - 365;
    END IF;
  ELSE
    SELECT MIN((r.data AT TIME ZONE v_timezone)::date), MAX((r.data AT TIME ZONE v_timezone)::date)
    INTO v_periodo_inicio_eff, v_periodo_fim_eff
    FROM registros_morte r
    WHERE r.fazenda_id = v_fazenda_id AND r.deleted_at IS NULL;
    IF v_periodo_inicio_eff IS NULL THEN
      v_periodo_inicio_eff := CURRENT_DATE - 365;
      v_periodo_fim_eff := CURRENT_DATE;
    END IF;
  END IF;

  v_duracao_dias := GREATEST(v_periodo_fim_eff - v_periodo_inicio_eff + 1, 1);
  v_prev_fim := v_periodo_inicio_eff - 1;
  v_prev_inicio := v_prev_fim - v_duracao_dias + 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('lote_id', l.id, 'lote_nome', l.nome) ORDER BY l.nome), '[]'::jsonb)
  INTO v_lotes_disponiveis
  FROM (
    SELECT DISTINCT COALESCE(r.lote_id, NULL) AS lote_id
    FROM registros_morte r
    WHERE r.fazenda_id = v_fazenda_id
      AND r.deleted_at IS NULL
  ) regs
  JOIN lotes l ON l.id = regs.lote_id;

  SELECT COALESCE(jsonb_agg(distinct causa_morte ORDER BY causa_morte), '[]'::jsonb)
  INTO v_causas_disponiveis
  FROM registros_morte
  WHERE fazenda_id = v_fazenda_id
    AND deleted_at IS NULL
    AND causa_morte IS NOT NULL
    AND causa_morte <> '';

  SELECT COALESCE(jsonb_agg(distinct categoria ORDER BY categoria), '[]'::jsonb)
  INTO v_categorias_disponiveis
  FROM registros_morte
  WHERE fazenda_id = v_fazenda_id
    AND deleted_at IS NULL
    AND categoria IS NOT NULL
    AND categoria <> '';

  SELECT COALESCE(jsonb_agg(distinct sexo ORDER BY sexo), '[]'::jsonb)
  INTO v_sexos_disponiveis
  FROM registros_morte
  WHERE fazenda_id = v_fazenda_id
    AND deleted_at IS NULL
    AND sexo IS NOT NULL
    AND sexo <> '';

  SELECT COALESCE(jsonb_agg(distinct pasto ORDER BY pasto), '[]'::jsonb)
  INTO v_pastos_disponiveis
  FROM registros_morte
  WHERE fazenda_id = v_fazenda_id
    AND deleted_at IS NULL
    AND pasto IS NOT NULL
    AND pasto <> '';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'data', to_char(r.data AT TIME ZONE v_timezone, 'YYYY-MM-DD'),
    'data_hora', to_char(r.data AT TIME ZONE v_timezone, 'YYYY-MM-DD HH24:MI'),
    'lote_id', r.lote_id,
    'lote_nome', COALESCE(l.nome, r.lote),
    'pasto', r.pasto,
    'sexo', r.sexo,
    'raca', r.raca,
    'idade', r.idade,
    'peso_vivo', r.peso_vivo,
    'causa_morte', r.causa_morte,
    'categoria', r.categoria,
    'categoria_outros', r.categoria_outros,
    'brinco', r.brinco,
    'chip', r.chip,
    'escore', r.escore,
    'nutricao_atual', r.nutricao_atual,
    'nutricao_anterior', r.nutricao_anterior,
    'diagnosticos', r.diagnosticos,
    'observacao_identificacao', r.observacao_identificacao,
    'nome_usuario', r.nome_usuario
  ) ORDER BY r.data DESC), '[]'::jsonb)
  INTO v_linhas
  FROM registros_morte r
  LEFT JOIN lotes l ON l.id = r.lote_id
  WHERE r.fazenda_id = v_fazenda_id
    AND r.deleted_at IS NULL
    AND (p_data_inicio IS NULL OR (r.data AT TIME ZONE v_timezone)::date >= p_data_inicio)
    AND (p_data_fim IS NULL OR (r.data AT TIME ZONE v_timezone)::date <= p_data_fim);

  SELECT
    COUNT(*),
    COUNT(DISTINCT to_char(r.data AT TIME ZONE v_timezone, 'YYYY-MM-DD')),
    round(avg(r.peso_vivo) FILTER (WHERE r.peso_vivo IS NOT NULL)::numeric, 1)
  INTO v_total_mortes, v_dias_distintos, v_peso_medio
  FROM registros_morte r
  WHERE r.fazenda_id = v_fazenda_id
    AND r.deleted_at IS NULL
    AND (p_data_inicio IS NULL OR (r.data AT TIME ZONE v_timezone)::date >= p_data_inicio)
    AND (p_data_fim IS NULL OR (r.data AT TIME ZONE v_timezone)::date <= p_data_fim);

  v_media_por_dia := CASE WHEN v_dias_distintos > 0 THEN round((v_total_mortes::numeric / v_dias_distintos)::numeric, 2) ELSE NULL END;
  v_taxa_mortalidade := CASE WHEN v_rebanho_total > 0 THEN round((v_total_mortes::numeric / v_rebanho_total * 100)::numeric, 2) ELSE NULL END;

  SELECT causa_morte, COUNT(*)
  INTO v_causa_mais_frequente, v_causa_mais_frequente_count
  FROM registros_morte
  WHERE fazenda_id = v_fazenda_id
    AND deleted_at IS NULL
    AND causa_morte IS NOT NULL
    AND causa_morte <> ''
    AND (p_data_inicio IS NULL OR (data AT TIME ZONE v_timezone)::date >= p_data_inicio)
    AND (p_data_fim IS NULL OR (data AT TIME ZONE v_timezone)::date <= p_data_fim)
  GROUP BY causa_morte
  ORDER BY COUNT(*) DESC, causa_morte
  LIMIT 1;

  SELECT
    COUNT(*),
    COUNT(DISTINCT to_char(r.data AT TIME ZONE v_timezone, 'YYYY-MM-DD')),
    round(avg(r.peso_vivo) FILTER (WHERE r.peso_vivo IS NOT NULL)::numeric, 1)
  INTO v_prev_total_mortes, v_prev_dias_distintos, v_prev_peso_medio
  FROM registros_morte r
  WHERE r.fazenda_id = v_fazenda_id
    AND r.deleted_at IS NULL
    AND (r.data AT TIME ZONE v_timezone)::date >= v_prev_inicio
    AND (r.data AT TIME ZONE v_timezone)::date <= v_prev_fim;

  v_prev_media_por_dia := CASE WHEN v_prev_dias_distintos > 0 THEN round((v_prev_total_mortes::numeric / v_prev_dias_distintos)::numeric, 2) ELSE NULL END;
  v_prev_taxa_mortalidade := CASE WHEN v_rebanho_total > 0 THEN round((v_prev_total_mortes::numeric / v_rebanho_total * 100)::numeric, 2) ELSE NULL END;

  v_periodo_anterior := jsonb_build_object(
    'total_mortes', v_prev_total_mortes,
    'taxa_mortalidade', v_prev_taxa_mortalidade,
    'peso_medio', v_prev_peso_medio,
    'media_por_dia', v_prev_media_por_dia,
    'data_inicio', to_char(v_prev_inicio, 'YYYY-MM-DD'),
    'data_fim', to_char(v_prev_fim, 'YYYY-MM-DD')
  );

  WITH base AS (
    SELECT
      r.causa_morte,
      r.categoria,
      r.sexo,
      r.peso_vivo,
      r.diagnosticos,
      to_char(r.data AT TIME ZONE v_timezone, 'YYYY-MM-DD') AS data_dia
    FROM registros_morte r
    WHERE r.fazenda_id = v_fazenda_id
      AND r.deleted_at IS NULL
      AND (p_data_inicio IS NULL OR (r.data AT TIME ZONE v_timezone)::date >= p_data_inicio)
      AND (p_data_fim IS NULL OR (r.data AT TIME ZONE v_timezone)::date <= p_data_fim)
  ),
  por_causa AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('label', causa_morte, 'valor', cnt) ORDER BY cnt DESC, causa_morte), '[]'::jsonb) AS agg
    FROM (
      SELECT COALESCE(causa_morte, 'Não informada') AS causa_morte, COUNT(*) AS cnt
      FROM base GROUP BY causa_morte
    ) c
  ),
  por_categoria AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('label', categoria, 'valor', cnt) ORDER BY cnt DESC, categoria), '[]'::jsonb) AS agg
    FROM (
      SELECT COALESCE(categoria, 'Não informada') AS categoria, COUNT(*) AS cnt
      FROM base GROUP BY categoria
    ) c
  ),
  por_sexo AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('label', sexo, 'valor', cnt) ORDER BY cnt DESC, sexo), '[]'::jsonb) AS agg
    FROM (
      SELECT COALESCE(sexo, 'Não informado') AS sexo, COUNT(*) AS cnt
      FROM base GROUP BY sexo
    ) s
  ),
  diag_keys AS (
    SELECT DISTINCT chave
    FROM base,
    LATERAL jsonb_object_keys(diagnosticos) AS chave
  ),
  diag_counts AS (
    SELECT
      dk.chave,
      COUNT(*) FILTER (
        WHERE (base.diagnosticos -> dk.chave ->> 'valor') = 'S'
      ) AS cnt
    FROM diag_keys dk
    CROSS JOIN base
    GROUP BY dk.chave
  ),
  frequencia_diagnosticos AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('label', chave, 'valor', cnt) ORDER BY cnt DESC, chave), '[]'::jsonb) AS agg
    FROM diag_counts
    WHERE cnt > 0
  )
  SELECT jsonb_build_object(
    'total_mortes', v_total_mortes,
    'media_por_dia', v_media_por_dia,
    'peso_medio', v_peso_medio,
    'causa_mais_frequente', v_causa_mais_frequente,
    'causa_mais_frequente_count', v_causa_mais_frequente_count,
    'taxa_mortalidade', v_taxa_mortalidade,
    'por_causa', (SELECT agg FROM por_causa),
    'por_categoria', (SELECT agg FROM por_categoria),
    'por_sexo', (SELECT agg FROM por_sexo),
    'frequencia_diagnosticos', (SELECT agg FROM frequencia_diagnosticos)
  )
  INTO v_resumo;

  RETURN jsonb_build_object(
    'fazenda_id', v_fazenda_id,
    'dados', jsonb_build_object(
      'fazenda_nome', v_fazenda_nome,
      'fazenda_logo_url', v_fazenda_logo_url,
      'timezone', v_timezone,
      'rebanho_total', v_rebanho_total,
      'lotes_disponiveis', v_lotes_disponiveis,
      'causas_disponiveis', v_causas_disponiveis,
      'categorias_disponiveis', v_categorias_disponiveis,
      'sexos_disponiveis', v_sexos_disponiveis,
      'pastos_disponiveis', v_pastos_disponiveis,
      'linhas', v_linhas,
      'resumo', v_resumo,
      'periodo_anterior', v_periodo_anterior
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_morte(uuid, date, date) TO anon, authenticated;
