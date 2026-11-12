-- Consumo ponderado por cabeças.
-- 1) get_dados_relatorio_consumo: cada ponto diário ganha dois campos novos, sem alterar os existentes:
--      n_cabecas  confinamento: consumo_confinamento_dia.n_cabecas;
--                 pasto: n_cabecas - qtd_bezerros do registro de suplementação que abre o intervalo
--                 (o mesmo divisor do kg/cab/dia).
--      dias       confinamento: 1; pasto: dias do intervalo entre os dois registros que o ponto representa.
--    Corpo idêntico a 20261027180000_relatorio_consumo_lotes_inativos.sql, exceto esses campos.
-- 2) get_infografico_anual_consumo: índices do ano ponderados por cabeças × dias (antes, cada ponto
--    pesava igual e o intervalo de pasto contava como um dia). Passa a devolver totais: MS e MN fornecidas,
--    custo total e cabeça-dias, no ano, por mês e por lote. Ponto sem nº de cabeças usa calculate_quant_em.
-- 3) get_infografico_anual_clima: leituras por mês (o calendário do resumo conta registros, não mm).

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_consumo(
  p_token uuid,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL,
  p_incluir_inativos boolean DEFAULT false
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
    UNION
    SELECT DISTINCT c.lote_id
    FROM consumo_confinamento_dia c
    WHERE c.fazenda_id = v_fazenda_id
  ) regs
  JOIN lotes l ON l.id = regs.lote_id AND (p_incluir_inativos OR l.ativo = true);

  -- Dados calculados por lote + escopo
  WITH conf_pontos AS (
    -- Confinamento: consumo por lote/dia ja calculado em consumo_confinamento_dia.
    -- So dias fechados (a leitura de D+1 fecha D), completos (tratos lancados >= esperados)
    -- e com %PV calculavel, para nao distorcer as medias do front (consumo_percent_pv numerico).
    SELECT
      c.lote_id,
      'lote'::text AS escopo,
      c.data AS dia,
      jsonb_build_object(
        'data', to_char(c.data, 'YYYY-MM-DD'),
        'data_label', to_char(c.data, 'DD/MM'),
        'trato_kg_cab_dia', c.kg_mn_cab_dia,
        'trato_kg_ms_cab_dia', c.kg_ms_cab_dia,
        'consumo_percent_pv', c.consumo_percent_pv,
        'leitura_cocho', lcd.leitura_cocho,
        'custo_reais_cab_dia', c.custo_reais_cab_dia,
        'origem', 'confinamento',
        'leitura_confirmada', c.leitura_confirmada,
        'consumo_piso', c.consumo_piso,
        'n_cabecas', c.n_cabecas,
        'dias', 1
      ) AS pt
    FROM consumo_confinamento_dia c
    -- Nota da leitura de cocho que fecha o dia D (a de D+1, feita antes do 1o trato), a mesma
    -- escolha de recalc_consumo_confinamento_dia: por curral que recebeu oferta em D, preferindo
    -- a leitura do curral e a mais recente; com mais de um curral no dia, vale a do que recebeu
    -- mais oferta. Sem leitura em D+1, fica NULL (o front nao desenha o ponto).
    LEFT JOIN LATERAL (
      SELECT lt.leitura_cocho
      FROM (
        SELECT o.curral_id, SUM(o.kg_ofertado_real) AS kg
        FROM registros_oferta_trato o
        WHERE o.fazenda_id = c.fazenda_id
          AND o.deleted_at IS NULL
          AND o.kg_ofertado_real IS NOT NULL
          AND (o.data AT TIME ZONE 'America/Cuiaba')::date = c.data
          AND COALESCE(o.lote_id, fn_lote_do_curral_em(o.curral_id, c.data)) = c.lote_id
        GROUP BY o.curral_id
      ) o2
      JOIN LATERAL (
        SELECT l.leitura_cocho
        FROM registros_leitura_cocho l
        WHERE l.fazenda_id = c.fazenda_id
          AND l.deleted_at IS NULL
          AND l.leitura_cocho IS NOT NULL
          AND (l.data AT TIME ZONE 'America/Cuiaba')::date = c.data + 1
          AND (l.curral_id = o2.curral_id OR (l.curral_id IS NULL AND l.lote_id = c.lote_id))
        ORDER BY (l.curral_id IS NOT NULL) DESC, l.created_at DESC
        LIMIT 1
      ) lt ON true
      ORDER BY o2.kg DESC
      LIMIT 1
    ) lcd ON true
    WHERE c.fazenda_id = v_fazenda_id
      AND c.lote_id IN (SELECT id FROM lotes WHERE p_incluir_inativos OR ativo = true)
      AND c.data < (now() AT TIME ZONE 'America/Cuiaba')::date
      AND c.kg_mn_cab_dia IS NOT NULL
      AND c.consumo_percent_pv IS NOT NULL
      AND NOT c.dia_incompleto
      AND (p_data_inicio IS NULL OR c.data >= p_data_inicio)
      AND (p_data_fim IS NULL OR c.data <= p_data_fim)
  ),
  registros_windowed AS (
    SELECT
      r.lote_id,
      r.escopo,
      r.data,
      to_char(r.data AT TIME ZONE 'America/Cuiaba', 'DD/MM') AS data_label,
      LAG(r.kg_cocho) OVER w AS lag_kg_cocho,
      LAG(r.n_cabecas) Over w AS lag_n_cabecas,
      LAG(r.qtd_bezerros) OVER w AS lag_qtd_bezerros,
      LAG(r.consumo_medio_geral_percent_pv) OVER w AS lag_consumo_percent_pv,
      LAG(r.consumo_medio_geral_kg_ms) OVER w AS lag_consumo_kg_ms,
      LAG(r.leitura) OVER w AS lag_leitura,
      LAG(r.custo_medio_reais_cab_dia) OVER w AS lag_custo,
      LAG(r.data) OVER w AS lag_data
    FROM registros_suplementacao r
    WHERE r.fazenda_id = v_fazenda_id
      AND r.deleted_at IS NULL
      AND r.lote_id IS NOT NULL
      AND r.lote_id IN (SELECT id FROM lotes WHERE p_incluir_inativos OR ativo = true)
      AND (p_data_inicio IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date >= p_data_inicio)
      AND (p_data_fim IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date <= p_data_fim)
    WINDOW w AS (PARTITION BY r.lote_id, r.escopo ORDER BY r.data, r.created_at)
  ),
  dados_sup AS (
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
        'trato_kg_ms_cab_dia', lag_consumo_kg_ms,
        'consumo_percent_pv', COALESCE(lag_consumo_percent_pv, 0),
        'leitura_cocho', CASE WHEN lag_leitura IS NOT NULL AND lag_leitura ~ '^[0-9]+\.?[0-9]*$' THEN lag_leitura::numeric ELSE NULL END,
        'custo_reais_cab_dia', lag_custo,
        'n_cabecas', CASE WHEN lag_n_cabecas IS NOT NULL THEN GREATEST(1, lag_n_cabecas - COALESCE(lag_qtd_bezerros, 0)) END,
        'dias', GREATEST(1, ((data AT TIME ZONE 'America/Cuiaba')::date - (lag_data AT TIME ZONE 'America/Cuiaba')::date))
      ) ORDER BY data) AS dados
    FROM registros_windowed
    WHERE lag_data IS NOT NULL
    GROUP BY lote_id, escopo
  ),
  dados_por_lote AS (
    SELECT x.lote_id, x.escopo, jsonb_agg(x.pt ORDER BY x.pt->>'data') AS dados
    FROM (
      SELECT s.lote_id, s.escopo, jsonb_array_elements(s.dados) AS pt FROM dados_sup s
      UNION ALL
      SELECT cp.lote_id, cp.escopo, cp.pt FROM conf_pontos cp
    ) x
    GROUP BY x.lote_id, x.escopo
  ),
  lotes_com_registros AS (
    SELECT u.lote_id, u.escopo,
      COALESCE(p_data_inicio, MIN(u.dia)) AS periodo_ini,
      COALESCE(p_data_fim, MAX(u.dia)) AS periodo_fim
    FROM (
      SELECT lote_id, escopo, (data AT TIME ZONE 'America/Cuiaba')::date AS dia
      FROM registros_suplementacao
      WHERE fazenda_id = v_fazenda_id
        AND deleted_at IS NULL
        AND lote_id IS NOT NULL
        AND lote_id IN (SELECT id FROM lotes WHERE p_incluir_inativos OR ativo = true)
        AND (p_data_inicio IS NULL OR (data AT TIME ZONE 'America/Cuiaba')::date >= p_data_inicio)
        AND (p_data_fim IS NULL OR (data AT TIME ZONE 'America/Cuiaba')::date <= p_data_fim)
      UNION ALL
      SELECT lote_id, escopo, dia FROM conf_pontos
    ) u
    GROUP BY u.lote_id, u.escopo
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
      pcp.periodo_dias AS pcp_periodo_dias,
      lcr.periodo_ini,
      lcr.periodo_fim
    FROM lotes_com_registros lcr
    JOIN lotes l ON l.id = lcr.lote_id AND (p_incluir_inativos OR l.ativo = true)
    JOIN lote_categorias lc ON lc.lote_id = lcr.lote_id
      AND (
        (lc.ativo = true AND lc.data_fim IS NULL)
        OR (
          l.ativo = false
          AND NOT EXISTS (
            SELECT 1 FROM lote_categorias x
            WHERE x.lote_id = lc.lote_id AND x.ativo = true AND x.data_fim IS NULL
          )
          AND (lc.data_fim IS NULL OR lc.data_fim >= lcr.periodo_ini)
        )
      )
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
    -- Plano vinculado ao lote (modelo atual) vigente no fim do período do relatório
    -- (inclui planos encerrados; rascunho = inativo sem data_fim, fica de fora)
    LEFT JOIN LATERAL (
      SELECT * FROM planos_nutricionais
      WHERE lote_id = lcr.lote_id AND lote_categoria_id IS NULL AND fazenda_id = v_fazenda_id
        AND (ativo = true OR data_fim IS NOT NULL)
        AND COALESCE(data_inicio, '-infinity'::date) <= lcr.periodo_fim
        AND (data_fim IS NULL OR data_fim >= lcr.periodo_fim)
      ORDER BY data_inicio DESC NULLS LAST, ativo DESC LIMIT 1
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
  -- Histórico de local no período: ocupações de pasto e de curral que tocam
  -- [periodo_ini, periodo_fim] (limites inclusivos), em ordem cronológica.
  -- Ocupações consecutivas no mesmo local viram uma só (gaps-and-islands): o intervalo vai da
  -- primeira entrada à última saída (aberta se alguma ainda estiver aberta).
  local_raw AS (
    SELECT lcr.lote_id, lcr.escopo, x.tipo, x.nome, x.data_inicial, x.data_final
    FROM lotes_com_registros lcr
    JOIN LATERAL (
      SELECT 'pasto'::text AS tipo, pa.nome, h.data_inicial, h.data_final
      FROM lote_pasto_historico h
      JOIN pastos pa ON pa.id = h.pasto_id
      WHERE h.lote_id = lcr.lote_id
        AND h.data_inicial <= lcr.periodo_fim
        AND (h.data_final IS NULL OR h.data_final >= lcr.periodo_ini)
      UNION ALL
      SELECT 'curral'::text, cu.nome, h.data_inicial, h.data_final
      FROM lote_curral_historico h
      JOIN currais cu ON cu.id = h.curral_id
      WHERE h.lote_id = lcr.lote_id
        AND h.data_inicial <= lcr.periodo_fim
        AND (h.data_final IS NULL OR h.data_final >= lcr.periodo_ini)
    ) x ON true
  ),
  local_flag AS (
    SELECT r.*,
      CASE WHEN (r.tipo || '|' || COALESCE(r.nome, ''))
                IS NOT DISTINCT FROM LAG(r.tipo || '|' || COALESCE(r.nome, '')) OVER w
           THEN 0 ELSE 1 END AS novo
    FROM local_raw r
    WINDOW w AS (PARTITION BY r.lote_id, r.escopo ORDER BY r.data_inicial, r.tipo, r.data_final NULLS LAST)
  ),
  local_grp AS (
    SELECT f.*,
      SUM(f.novo) OVER (
        PARTITION BY f.lote_id, f.escopo
        ORDER BY f.data_inicial, f.tipo, f.data_final NULLS LAST
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS grp
    FROM local_flag f
  ),
  local_runs AS (
    SELECT g.lote_id, g.escopo, g.grp, g.tipo, g.nome,
      MIN(g.data_inicial) AS data_inicial,
      CASE WHEN bool_or(g.data_final IS NULL) THEN NULL ELSE MAX(g.data_final) END AS data_final
    FROM local_grp g
    GROUP BY g.lote_id, g.escopo, g.grp, g.tipo, g.nome
  ),
  local_hist AS (
    SELECT
      r.lote_id,
      r.escopo,
      jsonb_agg(jsonb_build_object(
        'tipo', r.tipo, 'nome', r.nome, 'data_inicial', r.data_inicial, 'data_final', r.data_final
      ) ORDER BY r.data_inicial, r.tipo) AS itens,
      string_agg(r.nome, ' → ' ORDER BY r.data_inicial, r.tipo) AS label,
      string_agg(r.nome, ' → ' ORDER BY r.data_inicial) FILTER (WHERE r.tipo = 'pasto') AS pastos,
      string_agg(r.nome, ' → ' ORDER BY r.data_inicial) FILTER (WHERE r.tipo = 'curral') AS currais
    FROM local_runs r
    GROUP BY r.lote_id, r.escopo
  ),
  -- Histórico de dieta no período: planos do lote (modelo atual, sem categoria) que tocam o
  -- período. Creep não tem plano (dieta via lote_categorias.formulacao_id), segue o fallback.
  -- Planos consecutivos com a mesma formulação viram uma só dieta no histórico.
  dieta_raw AS (
    SELECT lcr.lote_id, lcr.escopo, p.formulacao_id, f.nome,
      COALESCE(p.data_inicio, '-infinity'::date) AS data_inicio, p.data_fim
    FROM lotes_com_registros lcr
    JOIN planos_nutricionais p
      ON p.lote_id = lcr.lote_id
      AND p.lote_categoria_id IS NULL
      AND p.fazenda_id = v_fazenda_id
      AND (p.ativo = true OR p.data_fim IS NOT NULL)
      AND COALESCE(p.data_inicio, '-infinity'::date) <= lcr.periodo_fim
      AND (p.data_fim IS NULL OR p.data_fim >= lcr.periodo_ini)
    JOIN formulacoes f ON f.id = p.formulacao_id
    WHERE lcr.escopo <> 'creep'
  ),
  dieta_flag AS (
    SELECT r.*,
      CASE WHEN r.formulacao_id IS NOT DISTINCT FROM LAG(r.formulacao_id) OVER w THEN 0 ELSE 1 END AS novo
    FROM dieta_raw r
    WINDOW w AS (PARTITION BY r.lote_id, r.escopo ORDER BY r.data_inicio, r.data_fim NULLS LAST)
  ),
  dieta_grp AS (
    SELECT f.*,
      SUM(f.novo) OVER (
        PARTITION BY f.lote_id, f.escopo
        ORDER BY f.data_inicio, f.data_fim NULLS LAST
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS grp
    FROM dieta_flag f
  ),
  dieta_runs AS (
    SELECT g.lote_id, g.escopo, g.grp, g.formulacao_id, g.nome,
      MIN(g.data_inicio) AS data_inicio,
      CASE WHEN bool_or(g.data_fim IS NULL) THEN NULL ELSE MAX(g.data_fim) END AS data_fim
    FROM dieta_grp g
    GROUP BY g.lote_id, g.escopo, g.grp, g.formulacao_id, g.nome
  ),
  dieta_hist AS (
    SELECT
      r.lote_id,
      r.escopo,
      jsonb_agg(jsonb_build_object(
        'nome', r.nome,
        'data_inicio', CASE WHEN r.data_inicio = '-infinity'::date THEN NULL ELSE r.data_inicio END,
        'data_fim', r.data_fim
      ) ORDER BY r.data_inicio, r.data_fim) AS itens,
      string_agg(r.nome, ' → ' ORDER BY r.data_inicio, r.data_fim) AS label
    FROM dieta_runs r
    GROUP BY r.lote_id, r.escopo
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
      CASE WHEN lh.itens IS NOT NULL THEN lh.pastos ELSE loc.pasto_nome END AS pasto_nome,
      CASE WHEN lh.itens IS NOT NULL THEN lh.currais ELSE loc.curral_nome END AS curral_nome,
      lh.itens AS local_historico,
      lh.label AS local_label,
      dh.itens AS dieta_historico,
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
      CASE WHEN cce.erros IS NULL AND dh.label IS NOT NULL THEN dh.label
           WHEN cce.erros IS NULL THEN (
        SELECT f.nome FROM cats_pond c2
        LEFT JOIN formulacoes f ON f.id = COALESCE(c2.formulacao_id, c2.plano_formulacao_id, c2.plano_lote_formulacao_id, c2.lote_formulacao_id)
        WHERE c2.lote_id = cpl.lote_id AND c2.escopo = cpl.escopo AND f.nome IS NOT NULL
        ORDER BY c2.quant_atual DESC NULLS LAST
        LIMIT 1
      ) END AS dieta,
      CASE WHEN cce.erros IS NULL AND cpl.escopo <> 'creep' THEN to_char(MIN(COALESCE(cpl.plano_data_inicio, cpl.plano_lote_data_inicio)), 'YYYY-MM-DD')
           WHEN cce.erros IS NULL THEN to_char(pcp2.data_inicio, 'YYYY-MM-DD') END AS data_inicio_plano,
      CASE WHEN cce.erros IS NULL AND cpl.escopo <> 'creep' AND MIN(COALESCE(cpl.plano_data_inicio, cpl.plano_lote_data_inicio)) IS NOT NULL THEN
        GREATEST(0, (LEAST((now() AT TIME ZONE 'America/Cuiaba')::date, MAX(cpl.periodo_fim)) - MIN(COALESCE(cpl.plano_data_inicio, cpl.plano_lote_data_inicio))::date))
           WHEN cce.erros IS NULL AND cpl.escopo = 'creep' AND pcp2.data_inicio IS NOT NULL THEN
        GREATEST(0, (LEAST((now() AT TIME ZONE 'America/Cuiaba')::date, MAX(cpl.periodo_fim)) - pcp2.data_inicio::date))
      END AS dias,
      CASE WHEN cce.erros IS NULL AND cpl.escopo <> 'creep' AND pdl.data_inicio IS NOT NULL THEN
        GREATEST(0, (LEAST((now() AT TIME ZONE 'America/Cuiaba')::date, MAX(cpl.periodo_fim)) - pdl.data_inicio::date))
           WHEN cce.erros IS NULL AND cpl.escopo = 'creep' AND pcp2.data_inicio IS NOT NULL THEN
        GREATEST(0, (LEAST((now() AT TIME ZONE 'America/Cuiaba')::date, MAX(cpl.periodo_fim)) - pcp2.data_inicio::date))
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
    JOIN lotes l ON l.id = cpl.lote_id AND (p_incluir_inativos OR l.ativo = true)
    LEFT JOIN localizacao_por_lote loc ON loc.lote_id = cpl.lote_id
    LEFT JOIN local_hist lh ON lh.lote_id = cpl.lote_id AND lh.escopo = cpl.escopo
    LEFT JOIN dieta_hist dh ON dh.lote_id = cpl.lote_id AND dh.escopo = cpl.escopo
    LEFT JOIN primeira_dieta_por_lote pdl ON pdl.lote_id = cpl.lote_id
    LEFT JOIN primeiro_creep_por_lote pcp2 ON pcp2.lote_id = cpl.lote_id
    LEFT JOIN cats_com_erro cce ON cce.lote_id = cpl.lote_id AND cce.escopo = cpl.escopo
    GROUP BY cpl.lote_id, cpl.escopo, l.nome, loc.pasto_nome, loc.curral_nome,
             lh.itens, lh.label, lh.pastos, lh.currais, dh.itens, dh.label,
             cce.erros, pdl.data_inicio, pcp2.data_inicio
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
      'local_label', il.local_label,
      'local_historico', COALESCE(il.local_historico, '[]'::jsonb),
      'dieta_historico', COALESCE(il.dieta_historico, '[]'::jsonb),
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

GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_consumo(uuid, date, date, boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_infografico_anual_consumo(p_fazenda_id uuid, p_ano int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_ini date; v_fim date; v_ult int; v_res jsonb;
BEGIN
  IF p_ano IS NULL OR p_ano < 2020 OR p_ano > extract(year FROM now())::int THEN
    RAISE EXCEPTION 'Ano inválido';
  END IF;
  SELECT data_inicio, data_fim, ultimo_mes INTO v_ini, v_fim, v_ult FROM public._infografico_anual_periodo(p_ano);
  v_res := public.get_dados_relatorio_consumo_fazenda(p_fazenda_id, v_ini, v_fim);

  RETURN (
    WITH bruto AS (
      SELECT (l->'info'->>'lote_id')::uuid AS lote_id,
             l->'info'->>'lote_nome' AS lote,
             CASE WHEN d->>'origem' = 'confinamento' THEN 'confinamento' ELSE 'pasto' END AS manejo,
             left(d->>'data', 10)::date AS dia,
             (d->>'trato_kg_cab_dia')::numeric AS mn,
             (d->>'trato_kg_ms_cab_dia')::numeric AS ms,
             (d->>'consumo_percent_pv')::numeric AS pv,
             (d->>'leitura_cocho')::numeric AS cocho,
             (d->>'custo_reais_cab_dia')::numeric AS custo,
             NULLIF((d->>'n_cabecas')::numeric, 0) AS cab,
             COALESCE((d->>'dias')::numeric, 1) AS dias
      FROM jsonb_array_elements(COALESCE(v_res->'dados'->'lotes', '[]'::jsonb)) l,
           jsonb_array_elements(COALESCE(l->'dados', '[]'::jsonb)) d
      WHERE CASE WHEN jsonb_typeof(l->'info'->'erro') = 'array' THEN jsonb_array_length(l->'info'->'erro') ELSE 0 END = 0
    ),
    -- Sem nº de cabeças no ponto: rebanho do lote na data pelo histórico (categorias que não são ao pé).
    p AS (
      SELECT b.*, extract(month FROM b.dia)::int AS mes,
             COALESCE(b.cab, NULLIF((
               SELECT sum(public.calculate_quant_em(lc.lote_id, lc.categoria, b.dia::timestamptz))
               FROM lote_categorias lc
               WHERE lc.lote_id = b.lote_id AND lc.ativo = true
                 AND lower(unaccent(trim(lc.categoria))) NOT IN ('bezerro ao pe', 'bezerra ao pe')
             ), 0)) AS cabecas,
             b.cab IS NULL AS cab_estimada
      FROM bruto b
    ),
    -- Peso de cada ponto = cabeças × dias que ele representa (no pasto, o intervalo entre registros).
    w AS (SELECT p.*, p.cabecas * p.dias AS cd FROM p),
    meses AS (SELECT generate_series(1, v_ult) AS mes),
    lt AS (
      SELECT lote, max(manejo) AS manejo, sum(dias) AS dias, sum(cd) AS cab_dias,
             sum(ms * cd) FILTER (WHERE ms IS NOT NULL AND cd IS NOT NULL) / NULLIF(sum(cd) FILTER (WHERE ms IS NOT NULL AND cd IS NOT NULL), 0) AS ms,
             sum(mn * cd) FILTER (WHERE mn IS NOT NULL AND cd IS NOT NULL) / NULLIF(sum(cd) FILTER (WHERE mn IS NOT NULL AND cd IS NOT NULL), 0) AS mn,
             sum(pv * cd) FILTER (WHERE pv IS NOT NULL AND cd IS NOT NULL) / NULLIF(sum(cd) FILTER (WHERE pv IS NOT NULL AND cd IS NOT NULL), 0) AS pv,
             sum(custo * cd) FILTER (WHERE custo IS NOT NULL AND cd IS NOT NULL) / NULLIF(sum(cd) FILTER (WHERE custo IS NOT NULL AND cd IS NOT NULL), 0) AS custo,
             sum(custo * cd) AS custo_total,
             sum(ms * cd) AS ms_total,
             avg(cocho) AS cocho
      FROM w GROUP BY lote
    )
    SELECT jsonb_build_object(
      'ano', p_ano, 'ultimo_mes', v_ult,
      'kpis', jsonb_build_object(
        'lotes', (SELECT count(DISTINCT lote) FROM w),
        'lote_dias', (SELECT sum(dias) FROM w),
        'cab_dias', (SELECT round(sum(cd)) FROM w),
        'cabecas_medias', (SELECT round(sum(cd) / NULLIF(count(DISTINCT dia), 0)) FROM w),
        'mn_kg_cab_dia', (SELECT round(sum(mn * cd) / NULLIF(sum(cd) FILTER (WHERE mn IS NOT NULL), 0), 2) FROM w WHERE mn IS NOT NULL),
        'ms_kg_cab_dia', (SELECT round(sum(ms * cd) / NULLIF(sum(cd), 0), 2) FROM w WHERE ms IS NOT NULL AND cd IS NOT NULL),
        'pct_pv', (SELECT round(sum(pv * cd) / NULLIF(sum(cd), 0), 2) FROM w WHERE pv IS NOT NULL AND cd IS NOT NULL),
        'custo_cab_dia', (SELECT round(sum(custo * cd) / NULLIF(sum(cd), 0), 2) FROM w WHERE custo IS NOT NULL AND cd IS NOT NULL),
        'custo_total', (SELECT round(sum(custo * cd), 2) FROM w WHERE custo IS NOT NULL AND cd IS NOT NULL),
        'ms_total_kg', (SELECT round(sum(ms * cd)) FROM w WHERE ms IS NOT NULL AND cd IS NOT NULL),
        'mn_total_kg', (SELECT round(sum(mn * cd)) FROM w WHERE mn IS NOT NULL AND cd IS NOT NULL),
        'leitura_cocho', (SELECT round(avg(cocho), 2) FROM w),
        'pontos', (SELECT count(*) FROM w),
        'pontos_cabecas_estimadas', (SELECT count(*) FROM w WHERE cab_estimada AND cabecas IS NOT NULL),
        'pontos_sem_cabecas', (SELECT count(*) FROM w WHERE cabecas IS NULL)
      ),
      'mensal', (
        SELECT jsonb_agg(jsonb_build_object(
          'mes', meses.mes,
          'lote_dias', COALESCE((SELECT sum(dias) FROM w WHERE w.mes = meses.mes), 0),
          'registros', (SELECT count(*) FROM w WHERE w.mes = meses.mes),
          'cab_dias', COALESCE((SELECT round(sum(cd)) FROM w WHERE w.mes = meses.mes), 0),
          'ms_total_kg', COALESCE((SELECT round(sum(ms * cd)) FROM w WHERE w.mes = meses.mes AND ms IS NOT NULL), 0),
          'custo_total', COALESCE((SELECT round(sum(custo * cd), 2) FROM w WHERE w.mes = meses.mes AND custo IS NOT NULL), 0),
          'pasto', (SELECT jsonb_build_object(
              'mn', round(sum(mn * cd) FILTER (WHERE mn IS NOT NULL) / NULLIF(sum(cd) FILTER (WHERE mn IS NOT NULL), 0), 2),
              'ms', round(sum(ms * cd) FILTER (WHERE ms IS NOT NULL) / NULLIF(sum(cd) FILTER (WHERE ms IS NOT NULL), 0), 2),
              'pv', round(sum(pv * cd) FILTER (WHERE pv IS NOT NULL) / NULLIF(sum(cd) FILTER (WHERE pv IS NOT NULL), 0), 2),
              'custo', round(sum(custo * cd) FILTER (WHERE custo IS NOT NULL) / NULLIF(sum(cd) FILTER (WHERE custo IS NOT NULL), 0), 2),
              'lote_dias', COALESCE(sum(dias), 0), 'cab_dias', COALESCE(round(sum(cd)), 0))
            FROM w WHERE w.mes = meses.mes AND manejo = 'pasto'),
          'confinamento', (SELECT jsonb_build_object(
              'mn', round(sum(mn * cd) FILTER (WHERE mn IS NOT NULL) / NULLIF(sum(cd) FILTER (WHERE mn IS NOT NULL), 0), 2),
              'ms', round(sum(ms * cd) FILTER (WHERE ms IS NOT NULL) / NULLIF(sum(cd) FILTER (WHERE ms IS NOT NULL), 0), 2),
              'pv', round(sum(pv * cd) FILTER (WHERE pv IS NOT NULL) / NULLIF(sum(cd) FILTER (WHERE pv IS NOT NULL), 0), 2),
              'custo', round(sum(custo * cd) FILTER (WHERE custo IS NOT NULL) / NULLIF(sum(cd) FILTER (WHERE custo IS NOT NULL), 0), 2),
              'lote_dias', COALESCE(sum(dias), 0), 'cab_dias', COALESCE(round(sum(cd)), 0))
            FROM w WHERE w.mes = meses.mes AND manejo = 'confinamento')
        ) ORDER BY meses.mes) FROM meses
      ),
      'por_lote', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('lote', lote, 'manejo', manejo, 'dias', dias,
               'cabecas_medias', round(cab_dias / NULLIF(dias, 0)), 'mn', round(mn, 2), 'ms', round(ms, 2),
               'pv', round(pv, 2), 'custo', round(custo, 2), 'custo_total', round(custo_total, 2),
               'ms_total_kg', round(ms_total), 'cocho', round(cocho, 2)) ORDER BY custo_total DESC NULLS LAST, cab_dias DESC NULLS LAST, lote)
        FROM (SELECT * FROM lt ORDER BY custo_total DESC NULLS LAST, cab_dias DESC NULLS LAST, lote LIMIT 15) t), '[]'::jsonb),
      'lotes_demais', (SELECT count(*) FROM (SELECT 1 FROM lt ORDER BY custo_total DESC NULLS LAST, cab_dias DESC NULLS LAST, lote OFFSET 15) t)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_infografico_anual_clima(p_fazenda_id uuid, p_ano int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_ini date; v_fim date; v_ult int; v_res jsonb;
BEGIN
  IF p_ano IS NULL OR p_ano < 2020 OR p_ano > extract(year FROM now())::int THEN
    RAISE EXCEPTION 'Ano inválido';
  END IF;
  SELECT data_inicio, data_fim, ultimo_mes INTO v_ini, v_fim, v_ult FROM public._infografico_anual_periodo(p_ano);
  v_res := public.get_dados_relatorio_clima_fazenda(p_fazenda_id, v_ini, v_fim);

  RETURN (
    WITH r AS (
      SELECT (x->>'data')::date AS dia, extract(month FROM (x->>'data')::date)::int AS mes,
             COALESCE(x->>'pluviometro_id', x->>'pluviometro_nome', '—') AS pid,
             COALESCE(x->>'pluviometro_nome', '—') AS nome,
             COALESCE((x->>'medicao_mm')::numeric, 0) AS mm,
             (x->>'temperatura')::numeric AS temp,
             (x->>'umidade_relativa')::numeric AS umid
      FROM jsonb_array_elements(COALESCE(v_res->'dados'->'registros', '[]'::jsonb)) x
    ),
    np AS (SELECT GREATEST(count(DISTINCT pid), 1) n FROM r),
    dia_reg AS (SELECT dia, mes, pid, sum(mm) mm FROM r GROUP BY 1, 2, 3),
    dia AS (SELECT dia, mes, sum(mm) soma, max(mm) maior FROM dia_reg GROUP BY 1, 2),
    meses AS (SELECT generate_series(1, v_ult) AS mes),
    pm AS (
      SELECT meses.mes, pl.pid, COALESCE((SELECT sum(mm) FROM r WHERE r.mes = meses.mes AND r.pid = pl.pid), 0) mm
      FROM meses CROSS JOIN (SELECT DISTINCT pid FROM r) pl
    )
    SELECT jsonb_build_object(
      'ano', p_ano, 'ultimo_mes', v_ult,
      'kpis', jsonb_build_object(
        'mm_total', (SELECT round(COALESCE(sum(mm), 0) / (SELECT n FROM np), 1) FROM r),
        'pluviometros', (SELECT count(DISTINCT pid) FROM r),
        'leituras', (SELECT count(*) FROM r),
        'dias_com_chuva', (SELECT count(*) FROM dia WHERE soma > 0),
        'dias_forte', (SELECT count(*) FROM dia WHERE maior >= 25 AND maior < 50),
        'dias_torrencial', (SELECT count(*) FROM dia WHERE maior >= 50),
        'maior_dia_mm', (SELECT round(max(maior), 1) FROM dia),
        'mes_mais_chuvoso', (SELECT mes FROM (SELECT mes, sum(mm) s FROM r GROUP BY mes) t ORDER BY s DESC LIMIT 1),
        'temp_media', (SELECT round(avg(temp), 1) FROM r),
        'temp_min', (SELECT min(temp) FROM r),
        'temp_max', (SELECT max(temp) FROM r),
        'umidade_media', (SELECT round(avg(umid), 1) FROM r)
      ),
      'mensal', (
        SELECT jsonb_agg(jsonb_build_object(
          'mes', meses.mes,
          'leituras', (SELECT count(*) FROM r WHERE r.mes = meses.mes),
          'mm_fazenda', round(COALESCE((SELECT sum(mm) FROM r WHERE r.mes = meses.mes), 0) / (SELECT n FROM np), 1),
          'mm_min', (SELECT round(min(mm), 1) FROM pm WHERE pm.mes = meses.mes),
          'mm_max', (SELECT round(max(mm), 1) FROM pm WHERE pm.mes = meses.mes),
          'dias_chuva', (SELECT count(*) FROM dia WHERE dia.mes = meses.mes AND soma > 0),
          'dias_forte', (SELECT count(*) FROM dia WHERE dia.mes = meses.mes AND maior >= 25 AND maior < 50),
          'dias_torrencial', (SELECT count(*) FROM dia WHERE dia.mes = meses.mes AND maior >= 50),
          'temp_media', (SELECT round(avg(temp), 1) FROM r WHERE r.mes = meses.mes),
          'umidade_media', (SELECT round(avg(umid), 1) FROM r WHERE r.mes = meses.mes)
        ) ORDER BY meses.mes) FROM meses
      ),
      'por_pluviometro', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('nome', nome, 'mm_total', round(mm, 1), 'leituras', n, 'maior_leitura', round(maior, 1)) ORDER BY mm DESC)
        FROM (SELECT max(nome) nome, sum(mm) mm, count(*) n, max(mm) maior FROM r GROUP BY pid) t), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_infografico_anual_consumo(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_infografico_anual_consumo(uuid, int) TO authenticated;
REVOKE ALL ON FUNCTION public.get_infografico_anual_clima(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_infografico_anual_clima(uuid, int) TO authenticated;
