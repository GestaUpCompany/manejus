-- Relatorio de Estoque de Insumos e Formulacoes (tipo 'estoque'): periodo, movimentacao, cobertura e qualidade dos dados.
-- Substitui get_dados_relatorio_estoque(uuid) e get_dados_relatorio_estoque_fazenda(uuid) por versoes com
-- p_data_inicio/p_data_fim opcionais. Sem datas (links antigos) o resultado e a posicao atual, como antes, mais os
-- campos novos que nao dependem do ledger. Com datas, o saldo e reconstruido pelo ledger movimentacoes_estoque_suplementos
-- em ordem (data, created_at): entrada e producao somam, baixa e consumo subtraem, ajuste define o saldo absoluto.
-- A ordem do trigger de saldo e created_at; lancamentos retroativos podem fazer o saldo reconstruido divergir de
-- estoque_atual, o que e sinalizado em divergencia_l. Ledger anterior a 2026-10-01 teve limpezas manuais (ver HISTORICO).
-- Rollback em supabase/rollbacks/.

DROP FUNCTION IF EXISTS public.get_dados_relatorio_estoque_fazenda(uuid);
DROP FUNCTION IF EXISTS public.get_dados_relatorio_estoque(uuid);

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_estoque(
  p_token uuid,
  p_data_inicio date DEFAULT NULL::date,
  p_data_fim date DEFAULT NULL::date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fazenda_id uuid;
  v_ativo boolean;
  v_expira timestamptz;
  v_escopo text;
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_periodo boolean := (p_data_inicio IS NOT NULL OR p_data_fim IS NOT NULL);
  v_dias integer;
  v_fim_hoje boolean;
  v_item record;
  v_mov record;
  v_saldo numeric;
  v_saldo_ini numeric;
  v_ent numeric;
  v_ent_v numeric;
  v_sai numeric;
  v_sai_v numeric;
  v_aju numeric;
  v_qtd_aju integer;
  v_ult_entrada date;
  v_origens jsonb;
  v_delta numeric;
  v_valor numeric;
  v_custo_mov numeric;
  v_ref numeric;
  v_cons_dia numeric;
  v_cob numeric;
  v_itens jsonb := '[]'::jsonb;
  v_movs jsonb := '[]'::jsonb;
  v_totais jsonb;
BEGIN
  SELECT fazenda_id, ativo, expira_em, COALESCE(config->>'escopo', 'todos')
    INTO v_fazenda_id, v_ativo, v_expira, v_escopo
  FROM relatorios_publicos
  WHERE id = p_token AND tipo = 'estoque';

  IF NOT FOUND OR v_ativo = false OR (v_expira IS NOT NULL AND v_expira < now()) THEN
    RAISE EXCEPTION 'Token invalido ou expirado';
  END IF;

  IF v_escopo NOT IN ('insumos', 'formulacoes', 'todos') THEN
    v_escopo := 'todos';
  END IF;

  IF v_periodo AND p_data_inicio IS NOT NULL AND p_data_fim IS NOT NULL AND p_data_fim < p_data_inicio THEN
    RAISE EXCEPTION 'Periodo invalido';
  END IF;

  -- Dias do periodo para o consumo medio diario: inicio..fim; sem fim vai ate hoje; sem inicio nao ha media.
  IF p_data_inicio IS NOT NULL THEN
    v_dias := (COALESCE(p_data_fim, v_hoje) - p_data_inicio) + 1;
  END IF;
  v_fim_hoje := (p_data_fim IS NULL OR p_data_fim >= v_hoje);

  FOR v_item IN
    SELECT 'insumo'::text AS item_tipo, i.id AS item_id, i.nome, i.tipo, i.unidade,
           COALESCE(i.estoque_atual, 0)::numeric AS estoque_atual,
           COALESCE(i.custo_unitario, 0)::numeric AS custo_unitario,
           COALESCE(i.estoque_minimo, 0)::numeric AS estoque_minimo
    FROM insumos i
    WHERE i.fazenda_id = v_fazenda_id AND i.ativo = true AND v_escopo IN ('insumos', 'todos')
    UNION ALL
    SELECT 'formulacao'::text, f.id, f.nome,
           CASE WHEN f.e_premix THEN 'Premix' ELSE COALESCE(f.tipo, 'Formulação') END,
           'kg'::text,
           COALESCE(f.estoque_atual, 0)::numeric,
           CASE WHEN COALESCE(f.custo_unitario, 0) > 0 THEN f.custo_unitario
                ELSE COALESCE(f.custo_mn_tonelada, 0) / 1000.0 END,
           COALESCE(f.estoque_minimo, 0)::numeric
    FROM formulacoes f
    WHERE f.fazenda_id = v_fazenda_id AND f.ativo = true AND f.deleted_at IS NULL AND v_escopo IN ('formulacoes', 'todos')
    ORDER BY 1 DESC, 3
  LOOP
    v_saldo := 0; v_saldo_ini := 0;
    v_ent := 0; v_ent_v := 0; v_sai := 0; v_sai_v := 0; v_aju := 0; v_qtd_aju := 0;
    v_ult_entrada := NULL; v_origens := '{}'::jsonb;

    IF v_periodo THEN
      FOR v_mov IN
        SELECT m.data, m.created_at, m.tipo_movimentacao, m.origem, m.quantidade, m.custo_unitario,
               m.valor_total, m.observacao, cab.fornecedor, cab.nota_fiscal
        FROM movimentacoes_estoque_suplementos m
        LEFT JOIN entrada_insumos_itens ei ON ei.id = m.registro_origem_id AND m.tipo_movimentacao = 'entrada'
        LEFT JOIN registros_entrada_insumos cab ON cab.id = ei.entrada_id
        WHERE m.fazenda_id = v_fazenda_id
          AND m.item_tipo = v_item.item_tipo
          AND m.item_id = v_item.item_id
          AND m.deleted_at IS NULL
          AND (p_data_fim IS NULL OR m.data <= p_data_fim)
        ORDER BY m.data, m.created_at
      LOOP
        v_custo_mov := COALESCE(NULLIF(v_mov.custo_unitario, 0), v_item.custo_unitario);
        IF v_mov.tipo_movimentacao IN ('entrada', 'producao') THEN
          v_delta := v_mov.quantidade;
          v_valor := COALESCE(v_mov.valor_total, v_mov.quantidade * v_custo_mov);
        ELSIF v_mov.tipo_movimentacao IN ('baixa', 'consumo') THEN
          v_delta := -v_mov.quantidade;
          v_valor := v_mov.quantidade * v_custo_mov;
        ELSE
          v_delta := v_mov.quantidade - v_saldo;
          v_valor := NULL;
        END IF;
        v_saldo := v_saldo + v_delta;

        IF p_data_inicio IS NOT NULL AND v_mov.data < p_data_inicio THEN
          v_saldo_ini := v_saldo;
        ELSE
          IF v_mov.tipo_movimentacao IN ('entrada', 'producao') THEN
            v_ent := v_ent + v_mov.quantidade; v_ent_v := v_ent_v + COALESCE(v_valor, 0);
            IF v_mov.tipo_movimentacao = 'entrada' THEN v_ult_entrada := v_mov.data; END IF;
          ELSIF v_mov.tipo_movimentacao IN ('baixa', 'consumo') THEN
            v_sai := v_sai + v_mov.quantidade; v_sai_v := v_sai_v + COALESCE(v_valor, 0);
            v_origens := jsonb_set(
              v_origens, ARRAY[COALESCE(v_mov.origem, 'outros')],
              to_jsonb(COALESCE((v_origens ->> COALESCE(v_mov.origem, 'outros'))::numeric, 0) + v_mov.quantidade)
            );
          ELSE
            v_aju := v_aju + v_delta; v_qtd_aju := v_qtd_aju + 1;
          END IF;
          v_movs := v_movs || jsonb_build_object(
            'item_tipo', v_item.item_tipo,
            'item', v_item.nome,
            'unidade', v_item.unidade,
            'data', to_char(v_mov.data, 'YYYY-MM-DD'),
            'tipo', v_mov.tipo_movimentacao,
            'origem', v_mov.origem,
            'quantidade', v_mov.quantidade,
            'variacao', v_delta,
            'custo_unitario', CASE WHEN v_mov.tipo_movimentacao = 'ajuste' THEN v_mov.custo_unitario ELSE v_custo_mov END,
            'valor', v_valor,
            'saldo_apos', v_saldo,
            'fornecedor', v_mov.fornecedor,
            'nota_fiscal', v_mov.nota_fiscal,
            'observacao', v_mov.observacao
          );
        END IF;
      END LOOP;
      v_ref := v_saldo;
    ELSE
      v_saldo_ini := NULL;
      v_ref := v_item.estoque_atual;
    END IF;

    v_cons_dia := CASE WHEN v_periodo AND COALESCE(v_dias, 0) > 0 AND v_sai > 0 THEN ROUND(v_sai / v_dias, 3) ELSE NULL END;
    v_cob := CASE WHEN v_cons_dia IS NOT NULL THEN ROUND(GREATEST(v_ref, 0) / v_cons_dia, 1) ELSE NULL END;

    v_itens := v_itens || jsonb_build_object(
      'item_tipo', v_item.item_tipo,
      'nome', v_item.nome,
      'tipo', v_item.tipo,
      'unidade', v_item.unidade,
      'estoque_atual', v_item.estoque_atual,
      'custo_unitario', v_item.custo_unitario,
      'estoque_minimo', v_item.estoque_minimo,
      -- Saldo negativo e problema de saneamento, nao ativo negativo: entra na lista (flag negativo) mas vale 0.
      'valor_estoque', ROUND(GREATEST(v_ref, 0) * v_item.custo_unitario, 2),
      'negativo', v_ref < 0,
      'em_alerta', (v_item.estoque_minimo > 0 AND v_ref <= v_item.estoque_minimo),
      'saldo_inicial', v_saldo_ini,
      'entradas', CASE WHEN v_periodo THEN v_ent END,
      'entradas_valor', CASE WHEN v_periodo THEN ROUND(v_ent_v, 2) END,
      'saidas', CASE WHEN v_periodo THEN v_sai END,
      'saidas_valor', CASE WHEN v_periodo THEN ROUND(v_sai_v, 2) END,
      'ajustes', CASE WHEN v_periodo THEN v_aju END,
      'qtd_ajustes', CASE WHEN v_periodo THEN v_qtd_aju END,
      'saldo_final', v_ref,
      'ultima_entrada', to_char(v_ult_entrada, 'YYYY-MM-DD'),
      'consumo_origem', CASE WHEN v_periodo THEN v_origens END,
      'falta_para_minimo', CASE WHEN v_item.estoque_minimo > 0 THEN GREATEST(v_item.estoque_minimo - v_ref, 0) END,
      'consumo_medio_dia', v_cons_dia,
      'cobertura_dias', v_cob,
      'data_esgotamento', CASE WHEN v_cob IS NOT NULL THEN to_char(v_hoje + FLOOR(v_cob)::integer, 'YYYY-MM-DD') END,
      'sem_custo', v_item.custo_unitario <= 0,
      'divergencia_l', CASE WHEN v_periodo AND v_fim_hoje AND ABS(v_saldo - v_item.estoque_atual) > 0.0005
                            THEN ROUND(v_saldo - v_item.estoque_atual, 3) END,
      'qtd_negativa', CASE WHEN v_ref < 0 THEN ABS(v_ref) END,
      'valor_negativo', CASE WHEN v_ref < 0 THEN ROUND(ABS(v_ref) * v_item.custo_unitario, 2) END
    );
  END LOOP;

  SELECT jsonb_build_object(
    'valor_total', COALESCE(SUM((e->>'valor_estoque')::numeric), 0),
    'total_itens', COUNT(*),
    'em_alerta', COUNT(*) FILTER (WHERE (e->>'em_alerta')::boolean),
    'negativos', COUNT(*) FILTER (WHERE (e->>'negativo')::boolean),
    'sem_custo', COUNT(*) FILTER (WHERE (e->>'sem_custo')::boolean),
    'a_repor', COUNT(*) FILTER (WHERE COALESCE((e->>'falta_para_minimo')::numeric, 0) > 0),
    'divergencias', COUNT(*) FILTER (WHERE e->>'divergencia_l' IS NOT NULL),
    'valor_entradas', COALESCE(SUM((e->>'entradas_valor')::numeric), 0),
    'valor_saidas', COALESCE(SUM((e->>'saidas_valor')::numeric), 0)
  )
  INTO v_totais
  FROM jsonb_array_elements(v_itens) e;

  RETURN jsonb_build_object(
    'fazenda_id', v_fazenda_id,
    'dados', jsonb_build_object(
      'escopo', v_escopo,
      'gerado_em', now(),
      'data_inicio', p_data_inicio,
      'data_fim', p_data_fim,
      'tem_periodo', v_periodo,
      'itens', v_itens,
      'totais', v_totais,
      'movimentacoes', v_movs
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_estoque(uuid, date, date) TO anon, authenticated;

-- Variante para o Infografico Mensal: recebe fazenda_id, valida acesso do usuario autenticado e reutiliza a RPC
-- publica via token temporario. Sem escopo: no consolidado sempre mostra insumos + formulacoes.
CREATE OR REPLACE FUNCTION public.get_dados_relatorio_estoque_fazenda(
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
  INSERT INTO public.relatorios_publicos (fazenda_id, tipo, titulo, config)
  VALUES (p_fazenda_id, 'estoque', 'Relatório temporário', '{"escopo":"todos"}'::jsonb)
  RETURNING id INTO v_token;
  v_result := public.get_dados_relatorio_estoque(v_token, p_data_inicio, p_data_fim);
  DELETE FROM public.relatorios_publicos WHERE id = v_token;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dados_relatorio_estoque_fazenda(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_estoque_fazenda(uuid, date, date) TO authenticated;
