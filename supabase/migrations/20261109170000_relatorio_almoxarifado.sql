-- Relatorio de Almoxarifado (tipo 'almoxarifado'): estoque por item, extrato e retiradas por responsavel/setor no periodo.
-- Parte 1: get_dados_relatorio_almoxarifado, SECURITY DEFINER validada por token (mesmo padrao da cantina).
-- Parte 2: variante _fazenda para o Infografico Mensal (token temporario).
-- Saldo reconstruido pelo ledger movimentacoes_almoxarifado na MESMA ordem de recalcular_estoque_almoxarifado
-- (created_at, id), para que o saldo final bata com itens_almoxarifado.estoque_atual:
--   entrada soma; devolucao soma quantidade_aprovada; baixa/estorno subtraem; ajuste define o saldo absoluto.
-- O periodo separa o que veio antes (saldo inicial) do que entrou/saiu dentro dele pela coluna data.
-- Consumo do periodo = retiradas (baixa + estorno) - devolucoes aprovadas, nunca negativo por item.
-- Valor em estoque = max(0, saldo final) * custo medio ATUAL do item.
-- Retiradas por responsavel e setor vem de registros_almoxarifado (via registro_origem_id).
-- Aditiva: so cria funcoes novas. Rollback em supabase/rollbacks/.

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_almoxarifado(
  p_token uuid,
  p_data_inicio date DEFAULT NULL::date,
  p_data_fim date DEFAULT NULL::date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_max_movs CONSTANT integer := 5000;
  v_fazenda_id uuid;
  v_ativo boolean;
  v_expira timestamptz;
  v_item record;
  v_mov record;
  v_saldo numeric;
  v_saldo_ini numeric;
  v_ent numeric;
  v_ent_v numeric;
  v_ret numeric;
  v_ret_v numeric;
  v_dev numeric;
  v_dev_v numeric;
  v_aju numeric;
  v_qtd_aju integer;
  v_delta numeric;
  v_q numeric;
  v_valor_mov numeric;
  v_consumo numeric;
  v_consumo_v numeric;
  v_dias integer;
  v_consumo_dia numeric;
  v_cobertura numeric;
  v_falta numeric;
  v_sem_custo boolean;
  v_diverg numeric;
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_tem_periodo boolean := (p_data_inicio IS NOT NULL AND p_data_fim IS NOT NULL);
  v_itens jsonb := '[]'::jsonb;
  v_movs jsonb := '[]'::jsonb;
  v_movs_total integer := 0;
  v_valor_total numeric := 0;
  v_em_alerta integer := 0;
  v_negativos integer := 0;
  v_sem_custo_n integer := 0;
  v_a_repor integer := 0;
  v_divergencias integer := 0;
  v_valor_ent numeric := 0;
  v_valor_ret numeric := 0;
  v_valor_dev numeric := 0;
  v_valor_consumo numeric := 0;
  v_por_resp jsonb;
  v_por_setor jsonb;
  v_qual jsonb;
  v_reg_sem_itens integer;
  v_itens_sem_controle integer;
  v_duplicados integer;
  v_em_revisao integer;
BEGIN
  SELECT fazenda_id, ativo, expira_em INTO v_fazenda_id, v_ativo, v_expira
  FROM relatorios_publicos
  WHERE id = p_token AND tipo = 'almoxarifado';

  IF NOT FOUND OR v_ativo = false OR (v_expira IS NOT NULL AND v_expira < now()) THEN
    RAISE EXCEPTION 'Token invalido ou expirado';
  END IF;

  v_dias := CASE WHEN v_tem_periodo THEN GREATEST((p_data_fim - p_data_inicio) + 1, 1) ELSE NULL END;

  FOR v_item IN
    SELECT i.id, i.nome, i.classificacao, i.unidade, COALESCE(i.estoque_minimo, 0) AS estoque_minimo,
           COALESCE(i.estoque_atual, 0) AS estoque_atual, COALESCE(i.custo_unitario, 0) AS custo_unitario
    FROM itens_almoxarifado i
    WHERE i.fazenda_id = v_fazenda_id AND i.deleted_at IS NULL AND i.controla_estoque = true
    ORDER BY i.classificacao, i.nome
  LOOP
    v_saldo := 0; v_saldo_ini := 0;
    v_ent := 0; v_ent_v := 0; v_ret := 0; v_ret_v := 0; v_dev := 0; v_dev_v := 0; v_aju := 0; v_qtd_aju := 0;

    FOR v_mov IN
      SELECT m.id, m.data, m.tipo_movimentacao, m.origem, m.quantidade, m.quantidade_aprovada, m.custo_unitario,
             m.valor_total, m.fornecedor, m.observacao, r.quem_pegou, r.setor
      FROM movimentacoes_almoxarifado m
      LEFT JOIN registros_almoxarifado r ON r.id = m.registro_origem_id
      WHERE m.item_id = v_item.id AND m.deleted_at IS NULL
        AND (p_data_fim IS NULL OR m.data <= p_data_fim)
      ORDER BY m.created_at, m.id
    LOOP
      v_delta := 0;
      v_valor_mov := NULL;
      v_q := CASE WHEN v_mov.tipo_movimentacao = 'devolucao' THEN COALESCE(v_mov.quantidade_aprovada, 0) ELSE v_mov.quantidade END;
      IF v_mov.tipo_movimentacao = 'entrada' THEN
        v_delta := v_q;
        v_valor_mov := COALESCE(v_mov.valor_total, v_q * COALESCE(v_mov.custo_unitario, 0));
      ELSIF v_mov.tipo_movimentacao = 'devolucao' THEN
        v_delta := v_q;
        v_valor_mov := v_q * COALESCE(v_mov.custo_unitario, 0);
      ELSIF v_mov.tipo_movimentacao IN ('baixa', 'estorno') THEN
        v_delta := -v_q;
        v_valor_mov := COALESCE(v_mov.valor_total, v_q * COALESCE(v_mov.custo_unitario, 0));
      ELSE
        v_delta := v_q - v_saldo;
      END IF;
      v_saldo := v_saldo + v_delta;

      IF p_data_inicio IS NOT NULL AND v_mov.data < p_data_inicio THEN
        v_saldo_ini := v_saldo;
      ELSE
        IF v_mov.tipo_movimentacao = 'entrada' THEN
          v_ent := v_ent + v_q; v_ent_v := v_ent_v + v_valor_mov;
        ELSIF v_mov.tipo_movimentacao = 'devolucao' THEN
          v_dev := v_dev + v_q; v_dev_v := v_dev_v + v_valor_mov;
        ELSIF v_mov.tipo_movimentacao IN ('baixa', 'estorno') THEN
          v_ret := v_ret + v_q; v_ret_v := v_ret_v + v_valor_mov;
        ELSE
          v_aju := v_aju + v_delta; v_qtd_aju := v_qtd_aju + 1;
        END IF;
        v_movs_total := v_movs_total + 1;
        IF v_movs_total <= c_max_movs THEN
          v_movs := v_movs || jsonb_build_object(
            'item_id', v_item.id,
            'item', v_item.nome,
            'classificacao', v_item.classificacao,
            'unidade', v_item.unidade,
            'data', to_char(v_mov.data, 'YYYY-MM-DD'),
            'tipo', v_mov.tipo_movimentacao,
            'origem', v_mov.origem,
            'quantidade', v_q,
            'variacao', v_delta,
            'custo_unitario', v_mov.custo_unitario,
            'valor', v_valor_mov,
            'saldo_apos', v_saldo,
            'fornecedor', v_mov.fornecedor,
            'responsavel', NULLIF(btrim(COALESCE(v_mov.quem_pegou, '')), ''),
            'setor', NULLIF(btrim(COALESCE(v_mov.setor, '')), ''),
            'observacao', v_mov.observacao
          );
        END IF;
      END IF;
    END LOOP;

    v_consumo := GREATEST(v_ret - v_dev, 0);
    v_consumo_v := GREATEST(v_ret_v - v_dev_v, 0);
    v_consumo_dia := CASE WHEN v_dias IS NOT NULL THEN v_consumo / v_dias ELSE NULL END;
    v_cobertura := CASE
      WHEN v_consumo_dia IS NULL OR v_consumo_dia <= 0 THEN NULL
      ELSE GREATEST(v_saldo, 0) / v_consumo_dia END;
    v_falta := CASE WHEN v_item.estoque_minimo > 0 THEN GREATEST(v_item.estoque_minimo - v_saldo, 0) ELSE 0 END;
    v_sem_custo := v_item.custo_unitario <= 0 AND (v_saldo > 0 OR v_ret > 0 OR v_ent > 0);
    -- Divergencia so faz sentido quando o relatorio vai ate hoje: compara com o saldo gravado no item.
    v_diverg := CASE
      WHEN (p_data_fim IS NULL OR p_data_fim >= v_hoje) AND ABS(v_saldo - v_item.estoque_atual) > 0.0005
        THEN ROUND(v_saldo - v_item.estoque_atual, 3) ELSE NULL END;

    v_valor_total := v_valor_total + ROUND(GREATEST(v_saldo, 0) * v_item.custo_unitario, 2);
    v_valor_ent := v_valor_ent + v_ent_v;
    v_valor_ret := v_valor_ret + v_ret_v;
    v_valor_dev := v_valor_dev + v_dev_v;
    v_valor_consumo := v_valor_consumo + v_consumo_v;
    IF v_saldo < 0 THEN v_negativos := v_negativos + 1; END IF;
    IF v_item.estoque_minimo > 0 AND v_saldo <= v_item.estoque_minimo THEN v_em_alerta := v_em_alerta + 1; END IF;
    IF v_sem_custo THEN v_sem_custo_n := v_sem_custo_n + 1; END IF;
    IF v_falta > 0 THEN v_a_repor := v_a_repor + 1; END IF;
    IF v_diverg IS NOT NULL THEN v_divergencias := v_divergencias + 1; END IF;

    v_itens := v_itens || jsonb_build_object(
      'id', v_item.id,
      'nome', v_item.nome,
      'classificacao', v_item.classificacao,
      'unidade', v_item.unidade,
      'estoque_minimo', v_item.estoque_minimo,
      'saldo_inicial', v_saldo_ini,
      'entradas', v_ent,
      'entradas_valor', v_ent_v,
      'retiradas', v_ret,
      'retiradas_valor', v_ret_v,
      'devolucoes', v_dev,
      'devolucoes_valor', v_dev_v,
      'baixas', v_consumo,
      'baixas_valor', v_consumo_v,
      'ajustes', v_aju,
      'qtd_ajustes', v_qtd_aju,
      'saldo_final', v_saldo,
      'estoque_atual', v_item.estoque_atual,
      'custo_unitario', v_item.custo_unitario,
      'valor_estoque', ROUND(GREATEST(v_saldo, 0) * v_item.custo_unitario, 2),
      'negativo', v_saldo < 0,
      'em_alerta', v_item.estoque_minimo > 0 AND v_saldo <= v_item.estoque_minimo,
      'falta_para_minimo', v_falta,
      'consumo_medio_dia', v_consumo_dia,
      'cobertura_dias', v_cobertura,
      'sem_custo', v_sem_custo,
      'divergencia', v_diverg
    );
  END LOOP;

  -- Retiradas por responsavel (quem_pegou) no periodo, so de itens com controle de estoque.
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'valor_retirado')::numeric DESC, x->>'nome'), '[]'::jsonb) INTO v_por_resp
  FROM (
  SELECT x FROM (
    SELECT jsonb_build_object(
      'nome', COALESCE(NULLIF(btrim(r.quem_pegou), ''), 'Não informado'),
      'retiradas', COUNT(*) FILTER (WHERE m.tipo_movimentacao IN ('baixa', 'estorno')),
      'valor_retirado', ROUND(COALESCE(SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.custo_unitario, 0))) FILTER (WHERE m.tipo_movimentacao IN ('baixa', 'estorno')), 0), 2),
      'valor_devolvido', ROUND(COALESCE(SUM(m.quantidade_aprovada * COALESCE(m.custo_unitario, 0)) FILTER (WHERE m.tipo_movimentacao = 'devolucao'), 0), 2),
      'valor_liquido', ROUND(
        COALESCE(SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.custo_unitario, 0))) FILTER (WHERE m.tipo_movimentacao IN ('baixa', 'estorno')), 0)
        - COALESCE(SUM(m.quantidade_aprovada * COALESCE(m.custo_unitario, 0)) FILTER (WHERE m.tipo_movimentacao = 'devolucao'), 0), 2)
    ) AS x
    FROM movimentacoes_almoxarifado m
    JOIN registros_almoxarifado r ON r.id = m.registro_origem_id AND r.deleted_at IS NULL
    JOIN itens_almoxarifado i ON i.id = m.item_id AND i.controla_estoque = true AND i.deleted_at IS NULL
    WHERE m.fazenda_id = v_fazenda_id AND m.deleted_at IS NULL
      AND m.tipo_movimentacao IN ('baixa', 'estorno', 'devolucao')
      AND (p_data_inicio IS NULL OR m.data >= p_data_inicio)
      AND (p_data_fim IS NULL OR m.data <= p_data_fim)
    GROUP BY COALESCE(NULLIF(btrim(r.quem_pegou), ''), 'Não informado')
  ) g
  ORDER BY (x->>'valor_retirado')::numeric DESC, x->>'nome'
  LIMIT 15
) t;

  -- Retiradas por setor no periodo.
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'valor_retirado')::numeric DESC, x->>'nome'), '[]'::jsonb) INTO v_por_setor
  FROM (
  SELECT x FROM (
    SELECT jsonb_build_object(
      'nome', COALESCE(NULLIF(btrim(r.setor), ''), 'Não informado'),
      'retiradas', COUNT(*) FILTER (WHERE m.tipo_movimentacao IN ('baixa', 'estorno')),
      'valor_retirado', ROUND(COALESCE(SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.custo_unitario, 0))) FILTER (WHERE m.tipo_movimentacao IN ('baixa', 'estorno')), 0), 2),
      'valor_devolvido', ROUND(COALESCE(SUM(m.quantidade_aprovada * COALESCE(m.custo_unitario, 0)) FILTER (WHERE m.tipo_movimentacao = 'devolucao'), 0), 2),
      'valor_liquido', ROUND(
        COALESCE(SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.custo_unitario, 0))) FILTER (WHERE m.tipo_movimentacao IN ('baixa', 'estorno')), 0)
        - COALESCE(SUM(m.quantidade_aprovada * COALESCE(m.custo_unitario, 0)) FILTER (WHERE m.tipo_movimentacao = 'devolucao'), 0), 2)
    ) AS x
    FROM movimentacoes_almoxarifado m
    JOIN registros_almoxarifado r ON r.id = m.registro_origem_id AND r.deleted_at IS NULL
    JOIN itens_almoxarifado i ON i.id = m.item_id AND i.controla_estoque = true AND i.deleted_at IS NULL
    WHERE m.fazenda_id = v_fazenda_id AND m.deleted_at IS NULL
      AND m.tipo_movimentacao IN ('baixa', 'estorno', 'devolucao')
      AND (p_data_inicio IS NULL OR m.data >= p_data_inicio)
      AND (p_data_fim IS NULL OR m.data <= p_data_fim)
    GROUP BY COALESCE(NULLIF(btrim(r.setor), ''), 'Não informado')
  ) g
  ORDER BY (x->>'valor_retirado')::numeric DESC, x->>'nome'
  LIMIT 15
) t;

  -- Qualidade dos dados.
  SELECT COUNT(*) INTO v_reg_sem_itens
  FROM registros_almoxarifado r
  WHERE r.fazenda_id = v_fazenda_id AND r.deleted_at IS NULL
    AND COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(r.itens) = 'array' THEN r.itens ELSE '[]'::jsonb END), 0) = 0
    AND (p_data_inicio IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date >= p_data_inicio)
    AND (p_data_fim IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date <= p_data_fim);

  SELECT COUNT(DISTINCT i.id) INTO v_itens_sem_controle
  FROM registros_almoxarifado r
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.itens) = 'array' THEN r.itens ELSE '[]'::jsonb END) e
  JOIN itens_almoxarifado i ON i.fazenda_id = r.fazenda_id AND i.id::text = e->>'itemId'
  WHERE r.fazenda_id = v_fazenda_id AND r.deleted_at IS NULL
    AND i.controla_estoque = false
    AND (p_data_inicio IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date >= p_data_inicio)
    AND (p_data_fim IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date <= p_data_fim);

  SELECT COUNT(*) INTO v_duplicados FROM (
    SELECT 1 FROM itens_almoxarifado
    WHERE fazenda_id = v_fazenda_id AND deleted_at IS NULL
    GROUP BY lower(btrim(nome)) HAVING COUNT(*) > 1
  ) d;

  SELECT COUNT(*) INTO v_em_revisao
  FROM movimentacoes_almoxarifado m
  WHERE m.fazenda_id = v_fazenda_id AND m.deleted_at IS NULL AND m.requer_revisao = true;

  v_qual := jsonb_build_object(
    'registros_sem_itens', v_reg_sem_itens,
    'itens_sem_controle', v_itens_sem_controle,
    'nomes_duplicados', v_duplicados,
    'devolucoes_em_revisao', v_em_revisao
  );

  RETURN jsonb_build_object(
    'fazenda_id', v_fazenda_id,
    'dados', jsonb_build_object(
      'gerado_em', now(),
      'data_inicio', p_data_inicio,
      'data_fim', p_data_fim,
      'tem_periodo', v_tem_periodo,
      'itens', v_itens,
      'totais', jsonb_build_object(
        'valor_total', ROUND(v_valor_total, 2),
        'total_itens', jsonb_array_length(v_itens),
        'em_alerta', v_em_alerta,
        'negativos', v_negativos,
        'sem_custo', v_sem_custo_n,
        'a_repor', v_a_repor,
        'divergencias', v_divergencias,
        'valor_entradas', ROUND(v_valor_ent, 2),
        'valor_baixas', ROUND(v_valor_consumo, 2),
        'valor_retiradas', ROUND(v_valor_ret, 2),
        'valor_devolucoes', ROUND(v_valor_dev, 2)
      ),
      'por_responsavel', v_por_resp,
      'por_setor', v_por_setor,
      'qualidade', v_qual,
      'movimentacoes', v_movs,
      'movimentacoes_total', v_movs_total
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_almoxarifado(uuid, date, date) TO anon, authenticated;

-- Variante para o Infografico Mensal: recebe fazenda_id, valida acesso do usuario autenticado
-- e reutiliza a RPC publica via token temporario.
CREATE OR REPLACE FUNCTION public.get_dados_relatorio_almoxarifado_fazenda(
  p_fazenda_id uuid,
  p_data_inicio date DEFAULT NULL::date,
  p_data_fim date DEFAULT NULL::date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token uuid;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Acesso negado à fazenda';
  END IF;
  INSERT INTO public.relatorios_publicos (fazenda_id, tipo, titulo)
  VALUES (p_fazenda_id, 'almoxarifado', 'Relatório temporário')
  RETURNING id INTO v_token;
  v_result := public.get_dados_relatorio_almoxarifado(v_token, p_data_inicio, p_data_fim);
  DELETE FROM public.relatorios_publicos WHERE id = v_token;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dados_relatorio_almoxarifado_fazenda(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_almoxarifado_fazenda(uuid, date, date) TO authenticated;
