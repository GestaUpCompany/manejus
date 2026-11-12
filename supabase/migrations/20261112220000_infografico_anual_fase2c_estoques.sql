-- Infográfico Anual, fase 2C: Almoxarifado, Farmácia e Cantina (estoque).
-- As três têm o mesmo formato de razão (movimentacoes_<x>: item, tipo_movimentacao, quantidade, custo_unitario,
-- valor_total, data). Diferente das fases anteriores, estas RPCs NÃO chamam a RPC mensal: ela reconstrói o saldo
-- item a item e corta em 5.000 movimentações, o que não serve para um ano. Aqui o razão é lido direto, só com
-- GROUP BY, e devolve fluxos em R$ (entradas e consumo por mês), valor em estoque de hoje, itens em alerta,
-- ranking de consumo e curva ABC. Não reconstrói saldo de 1/jan nem de 31/dez (isso exige o replay do razão;
-- o PDF mensal continua sendo o lugar do saldo inicial e final por item).
-- Regras (iguais às dos relatórios mensais):
--  - só itens com controle de estoque e não excluídos; movimentos não excluídos, pela coluna data;
--  - valor do movimento = valor_total ou quantidade x custo_unitario; entrada soma; consumo = baixa + estorno;
--  - Almoxarifado: consumo líquido = retiradas menos devoluções aprovadas (quantidade_aprovada x custo);
--  - ajuste e reclassificação não são fluxo (não entram em entradas nem em consumo);
--  - em alerta = saldo negativo ou no mínimo/abaixo (mínimo > 0); valor em estoque = max(0, saldo) x custo atual;
--  - curva ABC: quantos itens respondem por 80% do consumo do ano.
--  - o consumo do ano soma o consumo líquido de cada item com piso em zero (igual ao relatório mensal); a série mensal
--    limita cada mês em zero, então a soma dos meses pode passar do total quando há devolução maior que a retirada do mês.
-- Aditiva: só cria funções novas. Rollback em supabase/rollbacks/.

-- ───────────────────────────── Almoxarifado ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_infografico_anual_almoxarifado(p_fazenda_id uuid, p_ano int)
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
      SELECT i.id, i.nome AS nome,
             COALESCE(NULLIF(btrim(i.classificacao), ''), 'Sem classificação') AS classif,
             i.unidade AS unid,
             COALESCE(i.estoque_atual, 0) AS saldo,
             COALESCE(i.estoque_minimo, 0) AS minimo,
             COALESCE(i.custo_unitario, 0) AS custo
      FROM itens_almoxarifado i
      WHERE i.fazenda_id = p_fazenda_id AND i.deleted_at IS NULL AND i.controla_estoque = true
    ),
    fl AS (
      SELECT m.item_id AS item_id, extract(month FROM m.data)::int AS mes,
             CASE WHEN m.tipo_movimentacao = 'entrada' THEN COALESCE(m.valor_total, m.quantidade * COALESCE(m.custo_unitario, 0)) ELSE 0 END AS ent_v,
             CASE WHEN m.tipo_movimentacao IN ('baixa', 'estorno') THEN COALESCE(m.valor_total, m.quantidade * COALESCE(m.custo_unitario, 0)) ELSE 0 END AS sai_v,
             CASE WHEN m.tipo_movimentacao IN ('baixa', 'estorno') THEN m.quantidade ELSE 0 END AS sai_q,
             CASE WHEN m.tipo_movimentacao = 'devolucao' THEN COALESCE(m.quantidade_aprovada, 0) * COALESCE(m.custo_unitario, 0) ELSE 0 END AS dev_v,
             CASE WHEN m.tipo_movimentacao = 'devolucao' THEN COALESCE(m.quantidade_aprovada, 0) ELSE 0 END AS dev_q
      FROM movimentacoes_almoxarifado m
      JOIN it ON it.id = m.item_id
      WHERE m.fazenda_id = p_fazenda_id AND m.deleted_at IS NULL
        AND m.data BETWEEN v_ini AND v_fim
        AND m.tipo_movimentacao IN ('entrada', 'baixa', 'estorno', 'devolucao')
    ),
    pi AS (
      SELECT item_id, sum(ent_v) AS ent_v, sum(dev_v) AS dev_v,
             GREATEST(sum(sai_v - dev_v), 0) AS cons_v, GREATEST(sum(sai_q - dev_q), 0) AS cons_q
      FROM fl GROUP BY item_id
    ),
    pr AS (
      SELECT it.nome, it.classif, it.unid, pi.cons_v, pi.cons_q, pi.ent_v
      FROM pi JOIN it ON it.id = pi.item_id
    ),
    tot AS (SELECT COALESCE(sum(cons_v), 0) AS t FROM pr),
    abc AS (
      SELECT nome, cons_v, sum(cons_v) OVER (ORDER BY cons_v DESC, nome) - cons_v AS antes
      FROM pr WHERE cons_v > 0
    ),
    alerta AS (
      SELECT * FROM it WHERE saldo < 0 OR (minimo > 0 AND saldo <= minimo)
    ),
    meses AS (SELECT generate_series(1, v_ult) AS mes),
    mm AS (
      SELECT meses.mes,
             COALESCE((SELECT sum(ent_v) FROM fl WHERE fl.mes = meses.mes), 0) AS ent_v,
             GREATEST(COALESCE((SELECT sum(sai_v - dev_v) FROM fl WHERE fl.mes = meses.mes), 0), 0) AS cons_v,
             (SELECT count(*) FROM fl WHERE fl.mes = meses.mes) AS movimentos
      FROM meses
    )
    SELECT jsonb_build_object(
      'ano', p_ano, 'ultimo_mes', v_ult,
      'kpis', jsonb_build_object(
        'itens', (SELECT count(*) FROM it),
        'valor_estoque', (SELECT round(COALESCE(sum(GREATEST(saldo, 0) * custo), 0), 2) FROM it),
        'em_alerta', (SELECT count(*) FROM alerta),
        'negativos', (SELECT count(*) FROM it WHERE saldo < 0),
        'sem_custo', (SELECT count(*) FROM it WHERE saldo > 0 AND custo <= 0),
        'entradas_valor', (SELECT round(COALESCE(sum(ent_v), 0), 2) FROM mm),
        'consumo_valor', (SELECT round(t, 2) FROM tot),
        'devolucoes_valor', (SELECT round(COALESCE(sum(dev_v), 0), 2) FROM fl),
        'movimentos', (SELECT count(*) FROM fl),
        'itens_com_consumo', (SELECT count(*) FROM abc),
        'itens_80pct', (SELECT count(*) FROM abc, tot WHERE abc.antes < 0.8 * tot.t)
      ),
      'mensal', (
        SELECT jsonb_agg(jsonb_build_object('mes', mes, 'entradas_valor', round(ent_v, 2), 'consumo_valor', round(cons_v, 2), 'movimentos', movimentos) ORDER BY mes)
        FROM mm
      ),
      'por_item', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', nome, 'classificacao', classif, 'unidade', unid,
                 'consumo_valor', round(cons_v, 2), 'consumo_qtd', round(cons_q, 2), 'entradas_valor', round(ent_v, 2)) ORDER BY cons_v DESC, nome)
        FROM (SELECT * FROM pr WHERE cons_v > 0 ORDER BY cons_v DESC, nome LIMIT 10) q), '[]'::jsonb),
      'por_classificacao', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', classif, 'valor', round(v, 2), 'itens', n) ORDER BY v DESC)
        FROM (SELECT classif, sum(cons_v) AS v, count(*) AS n FROM pr WHERE cons_v > 0 GROUP BY classif ORDER BY sum(cons_v) DESC LIMIT 8) q), '[]'::jsonb),
      'em_alerta', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', nome, 'saldo', saldo, 'minimo', minimo, 'unidade', unid) ORDER BY saldo - minimo, nome)
        FROM (SELECT * FROM alerta ORDER BY saldo - minimo, nome LIMIT 10) q), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_infografico_anual_almoxarifado(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_infografico_anual_almoxarifado(uuid, int) TO authenticated;

-- ───────────────────────────── Farmácia ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_infografico_anual_farmacia(p_fazenda_id uuid, p_ano int)
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
      SELECT i.id, i.nome_comercial AS nome,
             COALESCE(NULLIF(btrim(i.tipo::text), ''), 'Sem classificação') AS classif,
             i.unidade AS unid,
             COALESCE(i.estoque_atual, 0) AS saldo,
             COALESCE(i.estoque_minimo, 0) AS minimo,
             COALESCE(i.custo_unitario, 0) AS custo
      FROM medicamentos i
      WHERE i.fazenda_id = p_fazenda_id AND i.deleted_at IS NULL AND i.controla_estoque = true
    ),
    fl AS (
      SELECT m.medicamento_id AS item_id, extract(month FROM m.data)::int AS mes,
             CASE WHEN m.tipo_movimentacao = 'entrada' THEN COALESCE(m.valor_total, m.quantidade * COALESCE(m.custo_unitario, 0)) ELSE 0 END AS ent_v,
             CASE WHEN m.tipo_movimentacao IN ('baixa', 'estorno') THEN COALESCE(m.valor_total, m.quantidade * COALESCE(m.custo_unitario, 0)) ELSE 0 END AS sai_v,
             CASE WHEN m.tipo_movimentacao IN ('baixa', 'estorno') THEN m.quantidade ELSE 0 END AS sai_q,
             0 AS dev_v,
             0 AS dev_q
      FROM movimentacoes_farmacia m
      JOIN it ON it.id = m.medicamento_id
      WHERE m.fazenda_id = p_fazenda_id AND m.deleted_at IS NULL
        AND m.data BETWEEN v_ini AND v_fim
        AND m.tipo_movimentacao IN ('entrada', 'baixa', 'estorno')
    ),
    pi AS (
      SELECT item_id, sum(ent_v) AS ent_v, sum(dev_v) AS dev_v,
             GREATEST(sum(sai_v - dev_v), 0) AS cons_v, GREATEST(sum(sai_q - dev_q), 0) AS cons_q
      FROM fl GROUP BY item_id
    ),
    pr AS (
      SELECT it.nome, it.classif, it.unid, pi.cons_v, pi.cons_q, pi.ent_v
      FROM pi JOIN it ON it.id = pi.item_id
    ),
    tot AS (SELECT COALESCE(sum(cons_v), 0) AS t FROM pr),
    abc AS (
      SELECT nome, cons_v, sum(cons_v) OVER (ORDER BY cons_v DESC, nome) - cons_v AS antes
      FROM pr WHERE cons_v > 0
    ),
    alerta AS (
      SELECT * FROM it WHERE saldo < 0 OR (minimo > 0 AND saldo <= minimo)
    ),
    meses AS (SELECT generate_series(1, v_ult) AS mes),
    mm AS (
      SELECT meses.mes,
             COALESCE((SELECT sum(ent_v) FROM fl WHERE fl.mes = meses.mes), 0) AS ent_v,
             GREATEST(COALESCE((SELECT sum(sai_v - dev_v) FROM fl WHERE fl.mes = meses.mes), 0), 0) AS cons_v,
             (SELECT count(*) FROM fl WHERE fl.mes = meses.mes) AS movimentos
      FROM meses
    )
    SELECT jsonb_build_object(
      'ano', p_ano, 'ultimo_mes', v_ult,
      'kpis', jsonb_build_object(
        'itens', (SELECT count(*) FROM it),
        'valor_estoque', (SELECT round(COALESCE(sum(GREATEST(saldo, 0) * custo), 0), 2) FROM it),
        'em_alerta', (SELECT count(*) FROM alerta),
        'negativos', (SELECT count(*) FROM it WHERE saldo < 0),
        'sem_custo', (SELECT count(*) FROM it WHERE saldo > 0 AND custo <= 0),
        'entradas_valor', (SELECT round(COALESCE(sum(ent_v), 0), 2) FROM mm),
        'consumo_valor', (SELECT round(t, 2) FROM tot),
        'devolucoes_valor', (SELECT round(COALESCE(sum(dev_v), 0), 2) FROM fl),
        'movimentos', (SELECT count(*) FROM fl),
        'itens_com_consumo', (SELECT count(*) FROM abc),
        'itens_80pct', (SELECT count(*) FROM abc, tot WHERE abc.antes < 0.8 * tot.t)
      ),
      'mensal', (
        SELECT jsonb_agg(jsonb_build_object('mes', mes, 'entradas_valor', round(ent_v, 2), 'consumo_valor', round(cons_v, 2), 'movimentos', movimentos) ORDER BY mes)
        FROM mm
      ),
      'por_item', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', nome, 'classificacao', classif, 'unidade', unid,
                 'consumo_valor', round(cons_v, 2), 'consumo_qtd', round(cons_q, 2), 'entradas_valor', round(ent_v, 2)) ORDER BY cons_v DESC, nome)
        FROM (SELECT * FROM pr WHERE cons_v > 0 ORDER BY cons_v DESC, nome LIMIT 10) q), '[]'::jsonb),
      'por_classificacao', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', classif, 'valor', round(v, 2), 'itens', n) ORDER BY v DESC)
        FROM (SELECT classif, sum(cons_v) AS v, count(*) AS n FROM pr WHERE cons_v > 0 GROUP BY classif ORDER BY sum(cons_v) DESC LIMIT 8) q), '[]'::jsonb),
      'em_alerta', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', nome, 'saldo', saldo, 'minimo', minimo, 'unidade', unid) ORDER BY saldo - minimo, nome)
        FROM (SELECT * FROM alerta ORDER BY saldo - minimo, nome LIMIT 10) q), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_infografico_anual_farmacia(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_infografico_anual_farmacia(uuid, int) TO authenticated;

-- ───────────────────────────── Cantina ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_infografico_anual_cantina(p_fazenda_id uuid, p_ano int)
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
      SELECT i.id, i.nome AS nome,
             COALESCE(NULLIF(btrim(i.classificacao), ''), 'Sem classificação') AS classif,
             i.unidade_medida AS unid,
             COALESCE(i.estoque_atual, 0) AS saldo,
             COALESCE(i.estoque_minimo, 0) AS minimo,
             COALESCE(i.custo_unitario, 0) AS custo
      FROM itens_cantina i
      WHERE i.fazenda_id = p_fazenda_id AND i.deleted_at IS NULL AND i.controla_estoque = true
    ),
    fl AS (
      SELECT m.item_id AS item_id, extract(month FROM m.data)::int AS mes,
             CASE WHEN m.tipo_movimentacao = 'entrada' THEN COALESCE(m.valor_total, m.quantidade * COALESCE(m.custo_unitario, 0)) ELSE 0 END AS ent_v,
             CASE WHEN m.tipo_movimentacao IN ('baixa', 'estorno') THEN COALESCE(m.valor_total, m.quantidade * COALESCE(m.custo_unitario, 0)) ELSE 0 END AS sai_v,
             CASE WHEN m.tipo_movimentacao IN ('baixa', 'estorno') THEN m.quantidade ELSE 0 END AS sai_q,
             0 AS dev_v,
             0 AS dev_q
      FROM movimentacoes_cantina m
      JOIN it ON it.id = m.item_id
      WHERE m.fazenda_id = p_fazenda_id AND m.deleted_at IS NULL
        AND m.data BETWEEN v_ini AND v_fim
        AND m.tipo_movimentacao IN ('entrada', 'baixa', 'estorno')
    ),
    pi AS (
      SELECT item_id, sum(ent_v) AS ent_v, sum(dev_v) AS dev_v,
             GREATEST(sum(sai_v - dev_v), 0) AS cons_v, GREATEST(sum(sai_q - dev_q), 0) AS cons_q
      FROM fl GROUP BY item_id
    ),
    pr AS (
      SELECT it.nome, it.classif, it.unid, pi.cons_v, pi.cons_q, pi.ent_v
      FROM pi JOIN it ON it.id = pi.item_id
    ),
    tot AS (SELECT COALESCE(sum(cons_v), 0) AS t FROM pr),
    abc AS (
      SELECT nome, cons_v, sum(cons_v) OVER (ORDER BY cons_v DESC, nome) - cons_v AS antes
      FROM pr WHERE cons_v > 0
    ),
    alerta AS (
      SELECT * FROM it WHERE saldo < 0 OR (minimo > 0 AND saldo <= minimo)
    ),
    meses AS (SELECT generate_series(1, v_ult) AS mes),
    mm AS (
      SELECT meses.mes,
             COALESCE((SELECT sum(ent_v) FROM fl WHERE fl.mes = meses.mes), 0) AS ent_v,
             GREATEST(COALESCE((SELECT sum(sai_v - dev_v) FROM fl WHERE fl.mes = meses.mes), 0), 0) AS cons_v,
             (SELECT count(*) FROM fl WHERE fl.mes = meses.mes) AS movimentos
      FROM meses
    )
    SELECT jsonb_build_object(
      'ano', p_ano, 'ultimo_mes', v_ult,
      'kpis', jsonb_build_object(
        'itens', (SELECT count(*) FROM it),
        'valor_estoque', (SELECT round(COALESCE(sum(GREATEST(saldo, 0) * custo), 0), 2) FROM it),
        'em_alerta', (SELECT count(*) FROM alerta),
        'negativos', (SELECT count(*) FROM it WHERE saldo < 0),
        'sem_custo', (SELECT count(*) FROM it WHERE saldo > 0 AND custo <= 0),
        'entradas_valor', (SELECT round(COALESCE(sum(ent_v), 0), 2) FROM mm),
        'consumo_valor', (SELECT round(t, 2) FROM tot),
        'devolucoes_valor', (SELECT round(COALESCE(sum(dev_v), 0), 2) FROM fl),
        'movimentos', (SELECT count(*) FROM fl),
        'itens_com_consumo', (SELECT count(*) FROM abc),
        'itens_80pct', (SELECT count(*) FROM abc, tot WHERE abc.antes < 0.8 * tot.t)
      ),
      'mensal', (
        SELECT jsonb_agg(jsonb_build_object('mes', mes, 'entradas_valor', round(ent_v, 2), 'consumo_valor', round(cons_v, 2), 'movimentos', movimentos) ORDER BY mes)
        FROM mm
      ),
      'por_item', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', nome, 'classificacao', classif, 'unidade', unid,
                 'consumo_valor', round(cons_v, 2), 'consumo_qtd', round(cons_q, 2), 'entradas_valor', round(ent_v, 2)) ORDER BY cons_v DESC, nome)
        FROM (SELECT * FROM pr WHERE cons_v > 0 ORDER BY cons_v DESC, nome LIMIT 10) q), '[]'::jsonb),
      'por_classificacao', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', classif, 'valor', round(v, 2), 'itens', n) ORDER BY v DESC)
        FROM (SELECT classif, sum(cons_v) AS v, count(*) AS n FROM pr WHERE cons_v > 0 GROUP BY classif ORDER BY sum(cons_v) DESC LIMIT 8) q), '[]'::jsonb),
      'em_alerta', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', nome, 'saldo', saldo, 'minimo', minimo, 'unidade', unid) ORDER BY saldo - minimo, nome)
        FROM (SELECT * FROM alerta ORDER BY saldo - minimo, nome LIMIT 10) q), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_infografico_anual_cantina(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_infografico_anual_cantina(uuid, int) TO authenticated;
