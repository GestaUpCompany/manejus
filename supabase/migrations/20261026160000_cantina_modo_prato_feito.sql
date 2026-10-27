-- Cantina: novo modo 'prato_feito' em registros_alimentacao.
--
-- O PWA (SaidaCantinaPage) ganhou a opcao "Prato Feito", que herda os campos da marmita
-- (fornecedor, quantidade_marmitas, preco_unitario, destinatario) e grava modo = 'prato_feito'.
-- Nao movimenta estoque: trg_alimentacao_mov so processa os modos 'cantina' e 'entrada'.
--
-- 1. CHECK registros_cantina_modo_check passa a aceitar 'prato_feito'.
-- 2. editar/excluir_registro_saida_cantina aceitam o novo modo (campos editaveis = os da marmita).
-- 3. get_dados_relatorio_cantina devolve 'pratos_feitos' (mesma estrutura de 'marmitas'),
--    separado das marmitas. As colunas continuam as da marmita.
-- Corpos derivados de 20261009120000 e 20261020190000; ACLs sao preservadas pelo CREATE OR REPLACE.

ALTER TABLE public.registros_alimentacao DROP CONSTRAINT IF EXISTS registros_cantina_modo_check;
ALTER TABLE public.registros_alimentacao
  ADD CONSTRAINT registros_cantina_modo_check
  CHECK (modo IN ('cantina', 'marmita', 'prato_feito', 'entrada'));

CREATE OR REPLACE FUNCTION public.editar_registro_saida_cantina(
  p_id uuid,
  p_fazenda_id uuid,
  p_campos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old registros_alimentacao%ROWTYPE;
  v_new registros_alimentacao%ROWTYPE;
  v_filtered jsonb := '{}'::jsonb;
  v_campo text;
  v_campos_cantina text[] := ARRAY['data','observacao','itens_detalhe'];
  v_campos_marmita text[] := ARRAY['data','observacao','fornecedor','quantidade_marmitas','preco_unitario','destinatario'];
  v_permitidos text[];
  v_is_controller boolean;
  v_auth_id uuid; v_auth_email text; v_auth_nome text;
  v_detalhe jsonb;
  v_itens jsonb;
  v_elem jsonb;
  v_cat itens_cantina%ROWTYPE;
  v_item_id uuid;
  v_q numeric;
  v_vistos uuid[] := ARRAY[]::uuid[];
  v_afetados uuid[] := ARRAY[]::uuid[];
  v_negativos jsonb;
BEGIN
  SELECT u.id, u.email, u.nome INTO v_auth_id, v_auth_email, v_auth_nome
    FROM usuarios u WHERE u.auth_id = auth.uid();
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  PERFORM set_config('app.current_user_id', v_auth_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(v_auth_email, ''), true);
  PERFORM set_config('app.current_user_nome', COALESCE(v_auth_nome, ''), true);

  SELECT EXISTS(
    SELECT 1 FROM usuario_fazenda uf
    WHERE uf.usuario_id = v_auth_id
      AND uf.fazenda_id = p_fazenda_id
      AND uf.papel IN ('admin', 'controller')
      AND uf.ativo = true
  ) INTO v_is_controller;

  IF NOT v_is_controller THEN
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem editar saídas de cantina';
  END IF;

  SELECT * INTO v_old
  FROM registros_alimentacao
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
    AND COALESCE(modo, 'cantina') IN ('cantina', 'marmita', 'prato_feito');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado, já excluído ou não é uma saída de cantina';
  END IF;

  v_permitidos := CASE WHEN COALESCE(v_old.modo, 'cantina') IN ('marmita', 'prato_feito') THEN v_campos_marmita ELSE v_campos_cantina END;

  FOR v_campo IN SELECT jsonb_object_keys(COALESCE(p_campos, '{}'::jsonb)) LOOP
    IF v_campo = ANY(v_permitidos) THEN
      v_filtered := v_filtered || jsonb_build_object(v_campo, p_campos->v_campo);
    END IF;
  END LOOP;

  v_new := jsonb_populate_record(v_old, v_filtered);

  IF v_new.data IS NULL THEN
    RAISE EXCEPTION 'Data é obrigatória';
  END IF;

  IF COALESCE(v_old.modo, 'cantina') IN ('marmita', 'prato_feito') THEN
    IF v_new.fornecedor IS NULL OR btrim(v_new.fornecedor) = '' THEN
      RAISE EXCEPTION 'Fornecedor é obrigatório';
    END IF;
    IF v_new.quantidade_marmitas IS NULL OR v_new.quantidade_marmitas <= 0 THEN
      RAISE EXCEPTION '% deve ser maior que zero',
        CASE WHEN v_old.modo = 'prato_feito' THEN 'Quantidade de pratos feitos' ELSE 'Quantidade de marmitas' END;
    END IF;
    IF v_new.preco_unitario IS NULL OR v_new.preco_unitario < 0 THEN
      RAISE EXCEPTION 'Preço unitário inválido';
    END IF;
    IF v_new.destinatario IS NULL OR btrim(v_new.destinatario) = '' THEN
      RAISE EXCEPTION 'Destinatário é obrigatório';
    END IF;
  ELSIF v_filtered ? 'itens_detalhe' THEN
    v_detalhe := v_new.itens_detalhe;
    IF v_detalhe IS NULL OR jsonb_typeof(v_detalhe) <> 'array' OR jsonb_array_length(v_detalhe) = 0 THEN
      RAISE EXCEPTION 'Informe pelo menos um item';
    END IF;

    v_itens := '{}'::jsonb;
    v_detalhe := '[]'::jsonb;
    FOR v_elem IN SELECT e FROM jsonb_array_elements(v_new.itens_detalhe) e LOOP
      BEGIN
        v_item_id := NULLIF(v_elem->>'itemId', '')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Item inválido na lista';
      END;
      IF v_item_id IS NULL THEN
        RAISE EXCEPTION 'Item sem identificador';
      END IF;
      IF v_item_id = ANY(v_vistos) THEN
        RAISE EXCEPTION 'Item repetido na lista';
      END IF;
      v_vistos := v_vistos || v_item_id;

      SELECT * INTO v_cat FROM itens_cantina
      WHERE id = v_item_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item não encontrado nesta fazenda';
      END IF;

      IF COALESCE(v_elem->>'quantidade', '') !~ '^\d+([.,]\d+)?$' THEN
        RAISE EXCEPTION 'Quantidade inválida para o item %', v_cat.nome;
      END IF;
      v_q := REPLACE(v_elem->>'quantidade', ',', '.')::numeric;
      IF v_q <= 0 THEN
        RAISE EXCEPTION 'Quantidade de % deve ser maior que zero', v_cat.nome;
      END IF;

      v_detalhe := v_detalhe || jsonb_build_array(
        v_elem || jsonb_build_object(
          'itemId', v_item_id,
          'nome', v_cat.nome,
          'unidade_medida', v_cat.unidade_medida,
          'quantidade', v_q::text
        )
      );
      v_itens := v_itens || jsonb_build_object(v_cat.nome || ' (' || v_cat.unidade_medida || ')', v_q::text);
    END LOOP;

    v_new.itens_detalhe := v_detalhe;
    v_new.itens := v_itens;
  END IF;

  UPDATE registros_alimentacao SET
    data = v_new.data,
    observacao = v_new.observacao,
    itens = v_new.itens,
    itens_detalhe = v_new.itens_detalhe,
    fornecedor = v_new.fornecedor,
    quantidade_marmitas = v_new.quantidade_marmitas,
    preco_unitario = v_new.preco_unitario,
    destinatario = v_new.destinatario,
    updated_at = NOW()
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
  RETURNING * INTO v_new;

  -- itens afetados = antigos + novos (o trigger já regerou as movimentações)
  SELECT COALESCE(array_agg(DISTINCT (e->>'itemId')::uuid), ARRAY[]::uuid[]) INTO v_afetados
  FROM jsonb_array_elements(
    COALESCE(v_old.itens_detalhe, '[]'::jsonb) || COALESCE(v_new.itens_detalhe, '[]'::jsonb)
  ) e
  WHERE e->>'itemId' ~ '^[0-9a-fA-F-]{36}$';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('item_id', i.id, 'nome', i.nome, 'estoque_atual', i.estoque_atual)), '[]'::jsonb)
  INTO v_negativos
  FROM itens_cantina i
  WHERE i.id = ANY(v_afetados) AND i.fazenda_id = p_fazenda_id
    AND i.controla_estoque AND i.estoque_atual < 0;

  RETURN jsonb_build_object('registro', to_jsonb(v_new), 'saldos_negativos', v_negativos);
END;
$function$;

CREATE OR REPLACE FUNCTION public.excluir_registro_saida_cantina(
  p_id uuid,
  p_fazenda_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old registros_alimentacao%ROWTYPE;
  v_is_controller boolean;
  v_auth_id uuid; v_auth_email text; v_auth_nome text;
  v_afetados uuid[] := ARRAY[]::uuid[];
  v_negativos jsonb;
BEGIN
  SELECT u.id, u.email, u.nome INTO v_auth_id, v_auth_email, v_auth_nome
    FROM usuarios u WHERE u.auth_id = auth.uid();
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  PERFORM set_config('app.current_user_id', v_auth_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(v_auth_email, ''), true);
  PERFORM set_config('app.current_user_nome', COALESCE(v_auth_nome, ''), true);

  SELECT EXISTS(
    SELECT 1 FROM usuario_fazenda uf
    WHERE uf.usuario_id = v_auth_id
      AND uf.fazenda_id = p_fazenda_id
      AND uf.papel IN ('admin', 'controller')
      AND uf.ativo = true
  ) INTO v_is_controller;

  IF NOT v_is_controller THEN
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem excluir saídas de cantina';
  END IF;

  SELECT * INTO v_old
  FROM registros_alimentacao
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
    AND COALESCE(modo, 'cantina') IN ('cantina', 'marmita', 'prato_feito');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado, já excluído ou não é uma saída de cantina';
  END IF;

  UPDATE registros_alimentacao
  SET deleted_at = NOW(), updated_at = NOW()
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;

  SELECT COALESCE(array_agg(DISTINCT (e->>'itemId')::uuid), ARRAY[]::uuid[]) INTO v_afetados
  FROM jsonb_array_elements(COALESCE(v_old.itens_detalhe, '[]'::jsonb)) e
  WHERE e->>'itemId' ~ '^[0-9a-fA-F-]{36}$';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('item_id', i.id, 'nome', i.nome, 'estoque_atual', i.estoque_atual)), '[]'::jsonb)
  INTO v_negativos
  FROM itens_cantina i
  WHERE i.id = ANY(v_afetados) AND i.fazenda_id = p_fazenda_id
    AND i.controla_estoque AND i.estoque_atual < 0;

  RETURN jsonb_build_object('success', true, 'id', p_id, 'saldos_negativos', v_negativos);
END;
$function$;

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
  v_prato jsonb;
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

  -- Pratos feitos no periodo (mesmas colunas da marmita, modo proprio).
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
  ) INTO v_prato
  FROM registros_alimentacao r
  WHERE r.fazenda_id = v_fazenda_id AND r.deleted_at IS NULL AND r.modo = 'prato_feito'
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
      'pratos_feitos', v_prato,
      'qualidade', v_qual,
      'movimentacoes', v_movs,
      'movimentacoes_total', v_movs_total
    )
  );
END;
$function$;
