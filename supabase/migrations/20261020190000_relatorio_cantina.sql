-- Relatorio de Cantina (tipo 'cantina'): estoque da cozinha por item, extrato, operacao (refeicoes) e marmitas no periodo.
-- Parte 1: get_dados_relatorio_cantina, SECURITY DEFINER validada por token (mesmo padrao do estoque de combustivel).
-- Parte 2: variante _fazenda para o Infografico Mensal (token temporario).
-- Saldo reconstruido pelo ledger movimentacoes_cantina em ordem (data, created_at, id): entrada soma, baixa/estorno
-- subtraem, ajuste define o saldo absoluto. Valor em estoque = max(0, saldo final) * custo medio ATUAL do item.
-- Operacao e marmitas vem de registros_alimentacao (data convertida para o fuso America/Cuiaba).
-- Aditiva: so cria funcoes novas. Rollback em supabase/rollbacks/.

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_cantina(
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
  v_bai numeric;
  v_bai_v numeric;
  v_aju numeric;
  v_qtd_aju integer;
  v_delta numeric;
  v_valor_mov numeric;
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
  v_valor_bai numeric := 0;
  v_oper jsonb;
  v_marm jsonb;
  v_qual jsonb;
  v_reg_sem_itens integer;
  v_itens_sem_controle integer;
  v_duplicados integer;
BEGIN
  SELECT fazenda_id, ativo, expira_em INTO v_fazenda_id, v_ativo, v_expira
  FROM relatorios_publicos
  WHERE id = p_token AND tipo = 'cantina';

  IF NOT FOUND OR v_ativo = false OR (v_expira IS NOT NULL AND v_expira < now()) THEN
    RAISE EXCEPTION 'Token invalido ou expirado';
  END IF;

  v_dias := CASE WHEN v_tem_periodo THEN GREATEST((p_data_fim - p_data_inicio) + 1, 1) ELSE NULL END;

  FOR v_item IN
    SELECT i.id, i.nome, i.classificacao, i.unidade_medida, COALESCE(i.estoque_minimo, 0) AS estoque_minimo,
           COALESCE(i.estoque_atual, 0) AS estoque_atual, COALESCE(i.custo_unitario, 0) AS custo_unitario
    FROM itens_cantina i
    WHERE i.fazenda_id = v_fazenda_id AND i.deleted_at IS NULL AND i.controla_estoque = true
    ORDER BY i.classificacao, i.nome
  LOOP
    v_saldo := 0; v_saldo_ini := 0;
    v_ent := 0; v_ent_v := 0; v_bai := 0; v_bai_v := 0; v_aju := 0; v_qtd_aju := 0;

    FOR v_mov IN
      SELECT m.id, m.data, m.tipo_movimentacao, m.origem, m.quantidade, m.custo_unitario,
             m.valor_total, m.fornecedor, m.observacao
      FROM movimentacoes_cantina m
      WHERE m.item_id = v_item.id AND m.deleted_at IS NULL
        AND (p_data_fim IS NULL OR m.data <= p_data_fim)
      ORDER BY m.data, m.created_at, m.id
    LOOP
      v_delta := 0;
      v_valor_mov := NULL;
      IF v_mov.tipo_movimentacao = 'entrada' THEN
        v_delta := v_mov.quantidade;
        v_valor_mov := COALESCE(v_mov.valor_total, v_mov.quantidade * COALESCE(v_mov.custo_unitario, 0));
      ELSIF v_mov.tipo_movimentacao IN ('baixa', 'estorno') THEN
        v_delta := -v_mov.quantidade;
        v_valor_mov := COALESCE(v_mov.valor_total, v_mov.quantidade * COALESCE(v_mov.custo_unitario, 0));
      ELSE
        v_delta := v_mov.quantidade - v_saldo;
      END IF;
      v_saldo := v_saldo + v_delta;

      IF p_data_inicio IS NOT NULL AND v_mov.data < p_data_inicio THEN
        v_saldo_ini := v_saldo;
      ELSE
        IF v_mov.tipo_movimentacao = 'entrada' THEN
          v_ent := v_ent + v_mov.quantidade; v_ent_v := v_ent_v + v_valor_mov;
        ELSIF v_mov.tipo_movimentacao IN ('baixa', 'estorno') THEN
          v_bai := v_bai + v_mov.quantidade; v_bai_v := v_bai_v + v_valor_mov;
        ELSE
          v_aju := v_aju + v_delta; v_qtd_aju := v_qtd_aju + 1;
        END IF;
        v_movs_total := v_movs_total + 1;
        IF v_movs_total <= c_max_movs THEN
          v_movs := v_movs || jsonb_build_object(
            'item_id', v_item.id,
            'item', v_item.nome,
            'classificacao', v_item.classificacao,
            'unidade', v_item.unidade_medida,
            'data', to_char(v_mov.data, 'YYYY-MM-DD'),
            'tipo', v_mov.tipo_movimentacao,
            'origem', v_mov.origem,
            'quantidade', v_mov.quantidade,
            'variacao', v_delta,
            'custo_unitario', v_mov.custo_unitario,
            'valor', v_valor_mov,
            'saldo_apos', v_saldo,
            'fornecedor', v_mov.fornecedor,
            'observacao', v_mov.observacao
          );
        END IF;
      END IF;
    END LOOP;

    v_consumo_dia := CASE WHEN v_dias IS NOT NULL THEN v_bai / v_dias ELSE NULL END;
    v_cobertura := CASE
      WHEN v_consumo_dia IS NULL OR v_consumo_dia <= 0 THEN NULL
      ELSE GREATEST(v_saldo, 0) / v_consumo_dia END;
    v_falta := CASE WHEN v_item.estoque_minimo > 0 THEN GREATEST(v_item.estoque_minimo - v_saldo, 0) ELSE 0 END;
    v_sem_custo := v_item.custo_unitario <= 0 AND (v_saldo > 0 OR v_bai > 0 OR v_ent > 0);
    -- Divergencia so faz sentido quando o relatorio vai ate hoje: compara com o saldo gravado no item.
    v_diverg := CASE
      WHEN (p_data_fim IS NULL OR p_data_fim >= v_hoje) AND ABS(v_saldo - v_item.estoque_atual) > 0.0005
        THEN ROUND(v_saldo - v_item.estoque_atual, 3) ELSE NULL END;

    v_valor_total := v_valor_total + ROUND(GREATEST(v_saldo, 0) * v_item.custo_unitario, 2);
    v_valor_ent := v_valor_ent + v_ent_v;
    v_valor_bai := v_valor_bai + v_bai_v;
    IF v_saldo < 0 THEN v_negativos := v_negativos + 1; END IF;
    IF v_item.estoque_minimo > 0 AND v_saldo <= v_item.estoque_minimo THEN v_em_alerta := v_em_alerta + 1; END IF;
    IF v_sem_custo THEN v_sem_custo_n := v_sem_custo_n + 1; END IF;
    IF v_falta > 0 THEN v_a_repor := v_a_repor + 1; END IF;
    IF v_diverg IS NOT NULL THEN v_divergencias := v_divergencias + 1; END IF;

    v_itens := v_itens || jsonb_build_object(
      'id', v_item.id,
      'nome', v_item.nome,
      'classificacao', v_item.classificacao,
      'unidade', v_item.unidade_medida,
      'estoque_minimo', v_item.estoque_minimo,
      'saldo_inicial', v_saldo_ini,
      'entradas', v_ent,
      'entradas_valor', v_ent_v,
      'baixas', v_bai,
      'baixas_valor', v_bai_v,
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

  -- Operacao da cozinha (modo cantina) no periodo.
  SELECT jsonb_build_object(
    'registros', COUNT(*),
    'cafe_manha', COALESCE(SUM(numero_cafe_manha), 0),
    'lanches', COALESCE(SUM(numero_lanches), 0),
    'almocos', COALESCE(SUM(numero_refeicoes_almoco), 0),
    'jantares', COALESCE(SUM(numero_refeicoes_jantar), 0),
    'refeicoes_total', COALESCE(SUM(COALESCE(numero_cafe_manha, 0) + COALESCE(numero_lanches, 0)
                         + COALESCE(numero_refeicoes_almoco, 0) + COALESCE(numero_refeicoes_jantar, 0)), 0)
  ) INTO v_oper
  FROM registros_alimentacao r
  WHERE r.fazenda_id = v_fazenda_id AND r.deleted_at IS NULL AND r.modo = 'cantina'
    AND (p_data_inicio IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date >= p_data_inicio)
    AND (p_data_fim IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date <= p_data_fim);

  -- Marmitas no periodo.
  SELECT jsonb_build_object(
    'registros', COUNT(*),
    'quantidade', COALESCE(SUM(quantidade_marmitas), 0),
    'valor', COALESCE(SUM(ROUND(COALESCE(quantidade_marmitas, 0) * COALESCE(preco_unitario, 0), 2)), 0),
    'sem_preco', COUNT(*) FILTER (WHERE COALESCE(preco_unitario, 0) <= 0),
    'lista', COALESCE(jsonb_agg(jsonb_build_object(
      'data', to_char((r.data AT TIME ZONE 'America/Cuiaba')::date, 'YYYY-MM-DD'),
      'fornecedor', r.fornecedor,
      'destinatario', r.destinatario,
      'quantidade', r.quantidade_marmitas,
      'preco_unitario', r.preco_unitario,
      'valor', ROUND(COALESCE(r.quantidade_marmitas, 0) * COALESCE(r.preco_unitario, 0), 2)
    ) ORDER BY r.data) , '[]'::jsonb)
  ) INTO v_marm
  FROM registros_alimentacao r
  WHERE r.fazenda_id = v_fazenda_id AND r.deleted_at IS NULL AND r.modo = 'marmita'
    AND (p_data_inicio IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date >= p_data_inicio)
    AND (p_data_fim IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date <= p_data_fim);

  -- Qualidade dos dados.
  SELECT COUNT(*) INTO v_reg_sem_itens
  FROM registros_alimentacao r
  WHERE r.fazenda_id = v_fazenda_id AND r.deleted_at IS NULL AND r.modo IN ('cantina', 'entrada')
    AND COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(r.itens_detalhe) = 'array' THEN r.itens_detalhe ELSE '[]'::jsonb END), 0) = 0
    AND (p_data_inicio IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date >= p_data_inicio)
    AND (p_data_fim IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date <= p_data_fim);

  SELECT COUNT(DISTINCT i.id) INTO v_itens_sem_controle
  FROM registros_alimentacao r
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.itens_detalhe) = 'array' THEN r.itens_detalhe ELSE '[]'::jsonb END) e
  JOIN itens_cantina i ON i.fazenda_id = r.fazenda_id AND i.id::text = e->>'itemId'
  WHERE r.fazenda_id = v_fazenda_id AND r.deleted_at IS NULL AND r.modo IN ('cantina', 'entrada')
    AND i.controla_estoque = false
    AND (p_data_inicio IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date >= p_data_inicio)
    AND (p_data_fim IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date <= p_data_fim);

  SELECT COUNT(*) INTO v_duplicados FROM (
    SELECT 1 FROM itens_cantina
    WHERE fazenda_id = v_fazenda_id AND deleted_at IS NULL
    GROUP BY lower(btrim(nome)) HAVING COUNT(*) > 1
  ) d;

  v_qual := jsonb_build_object(
    'registros_sem_itens', v_reg_sem_itens,
    'itens_sem_controle', v_itens_sem_controle,
    'nomes_duplicados', v_duplicados
  );

  v_oper := v_oper || jsonb_build_object(
    'custo_baixas', v_valor_bai,
    'custo_por_refeicao', CASE WHEN (v_oper->>'refeicoes_total')::numeric > 0
                               THEN ROUND(v_valor_bai / (v_oper->>'refeicoes_total')::numeric, 2) ELSE NULL END
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
        'valor_baixas', ROUND(v_valor_bai, 2)
      ),
      'operacao', v_oper,
      'marmitas', v_marm,
      'qualidade', v_qual,
      'movimentacoes', v_movs,
      'movimentacoes_total', v_movs_total
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_cantina(uuid, date, date) TO anon, authenticated;

-- Variante para o Infografico Mensal: recebe fazenda_id, valida acesso do usuario autenticado
-- e reutiliza a RPC publica via token temporario.
CREATE OR REPLACE FUNCTION public.get_dados_relatorio_cantina_fazenda(
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
  VALUES (p_fazenda_id, 'cantina', 'Relatório temporário')
  RETURNING id INTO v_token;
  v_result := public.get_dados_relatorio_cantina(v_token, p_data_inicio, p_data_fim);
  DELETE FROM public.relatorios_publicos WHERE id = v_token;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dados_relatorio_cantina_fazenda(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_cantina_fazenda(uuid, date, date) TO authenticated;
