-- Infográfico Anual, fase 2D: Estoque de Insumos e Formulações e refeições da Cantina.
-- Mesmo critério da fase 2C: lê o razão direto (movimentacoes_estoque_suplementos), só com GROUP BY, sem
-- reconstruir saldo e sem o teto de 5.000 movimentações da RPC mensal. Insumos e formulações entram juntos
-- (item_tipo), como no relatório mensal com escopo "todos"; o PDF separa os dois nos totais.
-- Regras (iguais às de get_dados_relatorio_estoque):
--  - itens: insumos ativos e formulações ativas e não excluídas; formulação em kg, custo = custo_unitario ou
--    custo_mn_tonelada / 1000;
--  - entrada = tipo 'entrada' (compra) ao valor_total ou quantidade x custo do movimento; 'producao' (formulação
--    fabricada) é separada, para não parecer compra;
--  - consumo = 'baixa' ou 'consumo', a quantidade x custo do movimento (ou custo atual do item quando o movimento
--    não tem custo); ajuste não é fluxo;
--  - insumo gasto na produção de uma formulação (origem 'saida_insumos') também entra no consumo do insumo, e a
--    formulação depois é consumida na suplementação: o mesmo valor aparece duas vezes, como no mensal. A repartição
--    por origem deixa isso visível;
--  - em alerta = saldo negativo ou no mínimo/abaixo (mínimo > 0); valor em estoque = max(0, saldo) x custo atual;
--  - curva ABC: quantos itens respondem por 80% do consumo do ano.
-- Aditiva: cria a função de estoque e acrescenta a chave "refeicoes" à da Cantina (renomeia a da 2C). Rollback em supabase/rollbacks/.

CREATE OR REPLACE FUNCTION public.get_infografico_anual_estoque(p_fazenda_id uuid, p_ano int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_ini date; v_fim date; v_ult int;
BEGIN
  IF p_ano IS NULL OR p_ano < 2020 OR p_ano > extract(year FROM now())::int THEN
    RAISE EXCEPTION 'Ano inválido';
  END IF;
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Acesso negado à fazenda';
  END IF;
  SELECT data_inicio, data_fim, ultimo_mes INTO v_ini, v_fim, v_ult FROM public._infografico_anual_periodo(p_ano);

  RETURN (
    WITH it AS (
      SELECT 'insumo'::text AS item_tipo, i.id AS item_id, i.nome, COALESCE(NULLIF(btrim(i.tipo), ''), 'Insumo') AS classif,
             COALESCE(i.unidade, 'kg') AS unid,
             COALESCE(i.estoque_atual, 0)::numeric AS saldo,
             COALESCE(i.estoque_minimo, 0)::numeric AS minimo,
             COALESCE(i.custo_unitario, 0)::numeric AS custo
      FROM insumos i
      WHERE i.fazenda_id = p_fazenda_id AND i.ativo = true
      UNION ALL
      SELECT 'formulacao'::text, f.id, f.nome,
             CASE WHEN f.e_premix THEN 'Premix' ELSE COALESCE(NULLIF(btrim(f.tipo), ''), 'Formulação') END,
             'kg'::text,
             COALESCE(f.estoque_atual, 0)::numeric,
             COALESCE(f.estoque_minimo, 0)::numeric,
             CASE WHEN COALESCE(f.custo_unitario, 0) > 0 THEN f.custo_unitario ELSE COALESCE(f.custo_mn_tonelada, 0) / 1000.0 END
      FROM formulacoes f
      WHERE f.fazenda_id = p_fazenda_id AND f.ativo = true AND f.deleted_at IS NULL
    ),
    fl AS (
      SELECT it.item_tipo, it.item_id, extract(month FROM m.data)::int AS mes, m.origem,
             CASE WHEN m.tipo_movimentacao = 'entrada'
                  THEN COALESCE(m.valor_total, m.quantidade * COALESCE(NULLIF(m.custo_unitario, 0), it.custo)) ELSE 0 END AS ent_v,
             CASE WHEN m.tipo_movimentacao = 'producao'
                  THEN COALESCE(m.valor_total, m.quantidade * COALESCE(NULLIF(m.custo_unitario, 0), it.custo)) ELSE 0 END AS prod_v,
             CASE WHEN m.tipo_movimentacao IN ('baixa', 'consumo')
                  THEN m.quantidade * COALESCE(NULLIF(m.custo_unitario, 0), it.custo) ELSE 0 END AS cons_v,
             CASE WHEN m.tipo_movimentacao IN ('baixa', 'consumo') THEN m.quantidade ELSE 0 END AS cons_q
      FROM movimentacoes_estoque_suplementos m
      JOIN it ON it.item_tipo = m.item_tipo AND it.item_id = m.item_id
      WHERE m.fazenda_id = p_fazenda_id AND m.deleted_at IS NULL
        AND m.data BETWEEN v_ini AND v_fim
        AND m.tipo_movimentacao IN ('entrada', 'producao', 'baixa', 'consumo')
    ),
    pi AS (
      SELECT item_tipo, item_id, sum(ent_v) AS ent_v, sum(cons_v) AS cons_v, sum(cons_q) AS cons_q
      FROM fl GROUP BY item_tipo, item_id
    ),
    pr AS (
      SELECT it.item_tipo, it.nome, it.classif, it.unid, pi.cons_v, pi.cons_q, pi.ent_v
      FROM pi JOIN it ON it.item_tipo = pi.item_tipo AND it.item_id = pi.item_id
    ),
    tot AS (SELECT COALESCE(sum(cons_v), 0) AS t FROM pr),
    abc AS (
      SELECT nome, cons_v, sum(cons_v) OVER (ORDER BY cons_v DESC, nome) - cons_v AS antes
      FROM pr WHERE cons_v > 0
    ),
    alerta AS (
      SELECT * FROM it WHERE saldo < 0 OR (minimo > 0 AND saldo <= minimo)
    ),
    meses AS (SELECT generate_series(1, v_ult) AS mes)
    SELECT jsonb_build_object(
      'ano', p_ano, 'ultimo_mes', v_ult,
      'kpis', jsonb_build_object(
        'itens', (SELECT count(*) FROM it),
        'insumos', (SELECT count(*) FROM it WHERE item_tipo = 'insumo'),
        'formulacoes', (SELECT count(*) FROM it WHERE item_tipo = 'formulacao'),
        'valor_estoque', (SELECT round(COALESCE(sum(GREATEST(saldo, 0) * custo), 0), 2) FROM it),
        'valor_estoque_insumos', (SELECT round(COALESCE(sum(GREATEST(saldo, 0) * custo), 0), 2) FROM it WHERE item_tipo = 'insumo'),
        'valor_estoque_formulacoes', (SELECT round(COALESCE(sum(GREATEST(saldo, 0) * custo), 0), 2) FROM it WHERE item_tipo = 'formulacao'),
        'em_alerta', (SELECT count(*) FROM alerta),
        'negativos', (SELECT count(*) FROM it WHERE saldo < 0),
        'sem_custo', (SELECT count(*) FROM it WHERE custo <= 0),
        'entradas_valor', (SELECT round(COALESCE(sum(ent_v), 0), 2) FROM fl),
        'producao_valor', (SELECT round(COALESCE(sum(prod_v), 0), 2) FROM fl),
        'consumo_valor', (SELECT round(COALESCE(sum(cons_v), 0), 2) FROM fl),
        'consumo_valor_insumos', (SELECT round(COALESCE(sum(cons_v), 0), 2) FROM fl WHERE item_tipo = 'insumo'),
        'consumo_valor_formulacoes', (SELECT round(COALESCE(sum(cons_v), 0), 2) FROM fl WHERE item_tipo = 'formulacao'),
        'movimentos', (SELECT count(*) FROM fl),
        'itens_com_consumo', (SELECT count(*) FROM abc),
        'itens_80pct', (SELECT count(*) FROM abc, tot WHERE abc.antes < 0.8 * tot.t)
      ),
      'mensal', (
        SELECT jsonb_agg(jsonb_build_object(
          'mes', meses.mes,
          'entradas_valor', round(COALESCE((SELECT sum(ent_v) FROM fl WHERE fl.mes = meses.mes), 0), 2),
          'producao_valor', round(COALESCE((SELECT sum(prod_v) FROM fl WHERE fl.mes = meses.mes), 0), 2),
          'consumo_valor', round(COALESCE((SELECT sum(cons_v) FROM fl WHERE fl.mes = meses.mes), 0), 2),
          'movimentos', (SELECT count(*) FROM fl WHERE fl.mes = meses.mes)
        ) ORDER BY meses.mes) FROM meses
      ),
      'por_item', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', nome, 'tipo', item_tipo, 'classificacao', classif, 'unidade', unid,
                 'consumo_valor', round(cons_v, 2), 'consumo_qtd', round(cons_q, 2), 'entradas_valor', round(ent_v, 2)) ORDER BY cons_v DESC, nome)
        FROM (SELECT * FROM pr WHERE cons_v > 0 ORDER BY cons_v DESC, nome LIMIT 10) q), '[]'::jsonb),
      'por_origem', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', COALESCE(origem, 'outros'), 'valor', round(v, 2)) ORDER BY v DESC)
        FROM (SELECT origem, sum(cons_v) AS v FROM fl WHERE cons_v > 0 GROUP BY origem ORDER BY sum(cons_v) DESC LIMIT 8) q), '[]'::jsonb),
      'por_classificacao', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', classif, 'valor', round(v, 2), 'itens', n) ORDER BY v DESC)
        FROM (SELECT classif, sum(cons_v) AS v, count(*) AS n FROM pr WHERE cons_v > 0 GROUP BY classif ORDER BY sum(cons_v) DESC LIMIT 8) q), '[]'::jsonb),
      'em_alerta', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', nome, 'tipo', item_tipo, 'saldo', saldo, 'minimo', minimo, 'unidade', unid) ORDER BY saldo - minimo, nome)
        FROM (SELECT * FROM alerta ORDER BY saldo - minimo, nome LIMIT 10) q), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_infografico_anual_estoque(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_infografico_anual_estoque(uuid, int) TO authenticated;

-- ───────────────────────────── Cantina: refeições ─────────────────────────────
-- A Cantina anual da fase 2C só tinha o estoque. As refeições vêm de registros_alimentacao, que o relatório
-- mensal usa assim: modo 'cantina' = refeições servidas (café, lanche, almoço, jantar); 'marmita' e
-- 'prato_feito' = quantidade x preço unitário. Para não duplicar o corpo da função de estoque, ela é renomeada
-- para get_infografico_anual_cantina_estoque e get_infografico_anual_cantina passa a ser um invólucro que a chama
-- e acrescenta a chave "refeicoes" (os campos existentes não mudam). Custo por refeição = consumo de estoque do
-- ano (ou do mês) dividido pelas refeições servidas no mesmo período, igual ao relatório mensal.
ALTER FUNCTION public.get_infografico_anual_cantina(uuid, int) RENAME TO get_infografico_anual_cantina_estoque;

CREATE OR REPLACE FUNCTION public.get_infografico_anual_cantina(p_fazenda_id uuid, p_ano int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_ini date; v_fim date; v_ult int; v_base jsonb; v_ref jsonb;
BEGIN
  -- Valida o ano e o acesso à fazenda (a função de estoque faz as duas checagens).
  v_base := public.get_infografico_anual_cantina_estoque(p_fazenda_id, p_ano);
  SELECT data_inicio, data_fim, ultimo_mes INTO v_ini, v_fim, v_ult FROM public._infografico_anual_periodo(p_ano);

  WITH r AS (
    SELECT extract(month FROM (a.data AT TIME ZONE 'America/Cuiaba'))::int AS mes, a.modo,
           COALESCE(a.numero_cafe_manha, 0) AS cafe, COALESCE(a.numero_lanches, 0) AS lanche,
           COALESCE(a.numero_refeicoes_almoco, 0) AS almoco, COALESCE(a.numero_refeicoes_jantar, 0) AS jantar,
           COALESCE(a.quantidade_marmitas, 0) AS qtd,
           ROUND(COALESCE(a.quantidade_marmitas, 0) * COALESCE(a.preco_unitario, 0), 2) AS valor
    FROM registros_alimentacao a
    WHERE a.fazenda_id = p_fazenda_id AND a.deleted_at IS NULL AND a.modo IN ('cantina', 'marmita', 'prato_feito')
      AND (a.data AT TIME ZONE 'America/Cuiaba')::date BETWEEN v_ini AND v_fim
  ),
  cons AS (
    SELECT (m->>'mes')::int AS mes, (m->>'consumo_valor')::numeric AS valor
    FROM jsonb_array_elements(v_base->'mensal') m
  ),
  meses AS (SELECT generate_series(1, v_ult) AS mes),
  mm AS (
    SELECT meses.mes,
           COALESCE((SELECT sum(cafe + lanche + almoco + jantar) FROM r WHERE r.mes = meses.mes AND modo = 'cantina'), 0) AS refeicoes,
           COALESCE((SELECT sum(qtd) FROM r WHERE r.mes = meses.mes AND modo = 'marmita'), 0) AS marmitas,
           COALESCE((SELECT sum(valor) FROM r WHERE r.mes = meses.mes AND modo = 'marmita'), 0) AS marmitas_valor,
           COALESCE((SELECT sum(qtd) FROM r WHERE r.mes = meses.mes AND modo = 'prato_feito'), 0) AS pratos,
           COALESCE((SELECT sum(valor) FROM r WHERE r.mes = meses.mes AND modo = 'prato_feito'), 0) AS pratos_valor,
           COALESCE((SELECT valor FROM cons WHERE cons.mes = meses.mes), 0) AS consumo
    FROM meses
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'registros', (SELECT count(*) FROM r WHERE modo = 'cantina'),
      'refeicoes', (SELECT COALESCE(sum(cafe + lanche + almoco + jantar), 0) FROM r WHERE modo = 'cantina'),
      'cafe_manha', (SELECT COALESCE(sum(cafe), 0) FROM r WHERE modo = 'cantina'),
      'lanches', (SELECT COALESCE(sum(lanche), 0) FROM r WHERE modo = 'cantina'),
      'almocos', (SELECT COALESCE(sum(almoco), 0) FROM r WHERE modo = 'cantina'),
      'jantares', (SELECT COALESCE(sum(jantar), 0) FROM r WHERE modo = 'cantina'),
      'custo_por_refeicao', (SELECT CASE WHEN sum(cafe + lanche + almoco + jantar) > 0
                                         THEN round((v_base->'kpis'->>'consumo_valor')::numeric / sum(cafe + lanche + almoco + jantar), 2) END
                             FROM r WHERE modo = 'cantina'),
      'marmitas', (SELECT COALESCE(sum(qtd), 0) FROM r WHERE modo = 'marmita'),
      'marmitas_valor', (SELECT COALESCE(sum(valor), 0) FROM r WHERE modo = 'marmita'),
      'pratos_feitos', (SELECT COALESCE(sum(qtd), 0) FROM r WHERE modo = 'prato_feito'),
      'pratos_feitos_valor', (SELECT COALESCE(sum(valor), 0) FROM r WHERE modo = 'prato_feito')
    ),
    'mensal', (
      SELECT jsonb_agg(jsonb_build_object(
        'mes', mes, 'refeicoes', refeicoes, 'marmitas', marmitas, 'marmitas_valor', marmitas_valor,
        'pratos_feitos', pratos, 'pratos_feitos_valor', pratos_valor,
        'custo_por_refeicao', CASE WHEN refeicoes > 0 THEN round(consumo / refeicoes, 2) END
      ) ORDER BY mes) FROM mm
    )
  ) INTO v_ref;

  RETURN v_base || jsonb_build_object('refeicoes', v_ref);
END;
$$;

REVOKE ALL ON FUNCTION public.get_infografico_anual_cantina(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_infografico_anual_cantina(uuid, int) TO authenticated;
REVOKE ALL ON FUNCTION public.get_infografico_anual_cantina_estoque(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_infografico_anual_cantina_estoque(uuid, int) TO authenticated;
