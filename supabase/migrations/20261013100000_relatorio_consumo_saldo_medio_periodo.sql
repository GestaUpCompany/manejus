-- Relatório de consumo: saldo de cabeças = média do saldo no início e no fim do período
-- ----------------------------------------------------------------------------
-- Antes a RPC ponderava e validava por lote_categorias.quant_atual (saldo de HOJE).
-- Lote esvaziado (ex.: Lote 2 Descarte, fazenda f5d64d63) ficava com quant_atual=0
-- e o relatório do período não era gerado. Agora:
--   - calculate_quant_em(lote, categoria, ate): mesma regra de calculate_quant_atual,
--     limitada a movimentações com data < ate (saldo em um instante passado).
--   - quant do período por categoria = ROUND((saldo no início + saldo no fim) / 2).
--     Sem filtro de datas: início/fim = primeira/última data de registro da série.
--   - categorias sem saldo no período saem da ponderação; erro só se o lote inteiro
--     estiver sem cabeças, ou faltar peso em categoria com saldo.
-- calculate_quant_atual e triggers/PWA não são alterados.
CREATE OR REPLACE FUNCTION public.calculate_quant_em(p_lote_id uuid, p_categoria text, p_ate timestamptz)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_quant_inicial_raw INTEGER;
  v_quant_base_raw INTEGER;
  v_created_at timestamptz;
  v_date_cutoff timestamptz;
  v_entradas INTEGER;
  v_saidas INTEGER;
  v_transf_saida INTEGER;
  v_transf_entrada INTEGER;
  v_maternidade INTEGER;
  v_morte INTEGER;
  v_quant INTEGER;
BEGIN
  SELECT quant_inicial, quant_base, created_at
  INTO v_quant_inicial_raw, v_quant_base_raw, v_created_at
  FROM lote_categorias
  WHERE lote_id = p_lote_id AND LOWER(categoria) = LOWER(p_categoria) AND ativo = true
  LIMIT 1;

  IF v_created_at IS NULL THEN RETURN 0; END IF;

  v_quant_inicial_raw := COALESCE(v_quant_base_raw, v_quant_inicial_raw);
  v_date_cutoff := CASE WHEN v_quant_inicial_raw IS NULL THEN '1900-01-01'::timestamptz ELSE v_created_at END;

  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_entradas
  FROM registros_movimentacao
  WHERE lote_origem_id = p_lote_id AND LOWER(categoria) = LOWER(p_categoria)
    AND motivo_movimentacao = 'Entrada'
    AND data >= v_date_cutoff AND data < p_ate AND deleted_at IS NULL;

  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_saidas
  FROM registros_movimentacao
  WHERE lote_origem_id = p_lote_id AND LOWER(categoria) = LOWER(p_categoria)
    AND (motivo_movimentacao IN ('Consumo', 'Saída', 'Doação') OR (motivo_movimentacao = 'Entrevero' AND lote_destino_id IS NULL))
    AND tipo_saida IS NULL
    AND data >= v_date_cutoff AND data < p_ate AND deleted_at IS NULL;

  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_transf_saida
  FROM registros_movimentacao
  WHERE lote_origem_id = p_lote_id AND LOWER(categoria) = LOWER(p_categoria)
    AND (tipo_saida IN ('Transferência', 'Apartação') OR (motivo_movimentacao = 'Entrevero' AND lote_destino_id IS NOT NULL))
    AND data >= v_date_cutoff AND data < p_ate AND deleted_at IS NULL;

  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_transf_entrada
  FROM registros_movimentacao
  WHERE lote_destino_id = p_lote_id AND LOWER(categoria) = LOWER(p_categoria)
    AND (tipo_entrada IN ('Transferência', 'Apartação') OR motivo_movimentacao = 'Entrevero' OR (tipo_entrada IS NULL AND lote_destino_id IS NOT NULL))
    AND (subtipo IS NULL OR subtipo <> 'Novo Lote')
    AND data >= v_date_cutoff AND data < p_ate AND deleted_at IS NULL;

  IF LOWER(unaccent(p_categoria)) ILIKE 'bezerro ao pe' THEN
    SELECT COUNT(*) INTO v_maternidade FROM registros_maternidade
    WHERE lote_id = p_lote_id AND sexo = 'Macho' AND data >= v_date_cutoff AND data < p_ate AND deleted_at IS NULL
      AND (tipo_parto IS NULL OR NOT (tipo_parto ? 'Aborto' OR tipo_parto ? 'Natimorto'));
  ELSIF LOWER(unaccent(p_categoria)) ILIKE 'bezerra ao pe' THEN
    SELECT COUNT(*) INTO v_maternidade FROM registros_maternidade
    WHERE lote_id = p_lote_id AND sexo = 'Fêmea' AND data >= v_date_cutoff AND data < p_ate AND deleted_at IS NULL
      AND (tipo_parto IS NULL OR NOT (tipo_parto ? 'Aborto' OR tipo_parto ? 'Natimorto'));
  ELSE
    v_maternidade := 0;
  END IF;

  SELECT COUNT(*) INTO v_morte FROM registros_morte
  WHERE lote_id = p_lote_id AND LOWER(categoria) = LOWER(p_categoria)
    AND data >= v_date_cutoff AND data < p_ate AND deleted_at IS NULL;

  v_quant := COALESCE(v_quant_inicial_raw, 0) + v_entradas - v_saidas - v_transf_saida + v_transf_entrada + v_maternidade - v_morte;
  RETURN GREATEST(v_quant, 0);
END;
$function$;

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
    SELECT lote_id, escopo,
      COALESCE(p_data_inicio, MIN((data AT TIME ZONE 'America/Cuiaba')::date)) AS periodo_ini,
      COALESCE(p_data_fim, MAX((data AT TIME ZONE 'America/Cuiaba')::date)) AS periodo_fim
    FROM registros_suplementacao
    WHERE fazenda_id = v_fazenda_id
      AND deleted_at IS NULL
      AND lote_id IS NOT NULL
      AND lote_id IN (SELECT id FROM lotes WHERE ativo = true)
      AND (p_data_inicio IS NULL OR (data AT TIME ZONE 'America/Cuiaba')::date >= p_data_inicio)
      AND (p_data_fim IS NULL OR (data AT TIME ZONE 'America/Cuiaba')::date <= p_data_fim)
    GROUP BY lote_id, escopo
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
      qp.quant_periodo AS quant_atual,
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
    -- Saldo de cabeças do período: média simples entre o saldo no início
    -- (00:00 do 1º dia) e no fim (fim do último dia) do período do relatório
    CROSS JOIN LATERAL (
      SELECT ROUND((
        public.calculate_quant_em(lc.lote_id, lc.categoria, lcr.periodo_ini::timestamptz)
        + public.calculate_quant_em(lc.lote_id, lc.categoria, (lcr.periodo_fim + 1)::timestamptz)
      ) / 2.0)::int AS quant_periodo
    ) qp
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
  -- Categorias com saldo médio > 0 entram na ponderação; as vazias no período
  -- só aparecem se o lote inteiro estiver sem cabeças (aí vira erro abaixo).
  cats_pond AS (
    SELECT * FROM (
      SELECT c.*, SUM(c.quant_atual) OVER (PARTITION BY c.lote_id, c.escopo) AS soma_lote
      FROM cats_por_lote c
    ) x
    WHERE x.quant_atual > 0 OR COALESCE(x.soma_lote, 0) <= 0
  ),
  cats_com_erro AS (
    SELECT lote_id, escopo, jsonb_agg(e) AS erros
    FROM (
      SELECT lote_id, escopo,
        jsonb_build_object(
          'categoria', categoria,
          'dados_faltantes', to_jsonb(array_remove(ARRAY[
            CASE WHEN peso_entrada_kg_cab IS NULL THEN 'peso_entrada_kg_cab' END,
            CASE WHEN peso_vivo_atual_kg_cab IS NULL THEN 'peso_vivo_atual_kg_cab' END
          ], NULL))
        ) AS e
      FROM cats_por_lote
      WHERE quant_atual > 0
        AND (peso_entrada_kg_cab IS NULL OR peso_vivo_atual_kg_cab IS NULL)
      UNION ALL
      SELECT lote_id, escopo,
        jsonb_build_object('categoria', 'todas as categorias', 'dados_faltantes', jsonb_build_array('saldo de cabeças no período'))
      FROM cats_por_lote
      GROUP BY lote_id, escopo
      HAVING COALESCE(SUM(quant_atual), 0) <= 0
    ) t
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
        SELECT f.nome FROM cats_pond c2
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
    FROM cats_pond cpl
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
