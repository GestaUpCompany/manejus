-- Cantina: marmita separada em interna (funcionários) e terceirizada (trabalhadores de empresas
-- terceirizadas), com quantidade por refeição (café, lanche, almoço, jantar) no mesmo lançamento.
--
-- Formato de registros_alimentacao.marmitas_detalhe (só modo 'marmita'):
--   {"interna": {"cafe_manha":0,"lanche":0,"almoco":30,"jantar":20},
--    "terceirizadas": [{"empresa":"Construtora Silva","cafe_manha":0,"lanche":0,"almoco":12,"jantar":5}]}
-- quantidade_marmitas continua sendo o TOTAL e destinatario vira a lista de empresas (ou 'Funcionários'):
-- ambos são recalculados pelo servidor (trigger e RPC) a partir do detalhe. Registros antigos ficam com
-- marmitas_detalhe nulo e contam como internas, refeição não informada, no relatório.
--
-- 1. coluna marmitas_detalhe + CHECK de tipo
-- 2. marmitas_detalhe_resumo(): valida o detalhe e devolve total e destinatário
-- 3. trigger trg_alimentacao_marmitas_detalhe: vale também para o sync direto do PWA
-- 4. editar_registro_saida_cantina: edita a grade (só modo marmita)
-- 5. get_dados_relatorio_cantina: marmitas.por_tipo, por_refeicao e por_empresa
-- Corpos derivados de 20261026160000; ACLs preservadas pelo CREATE OR REPLACE.

ALTER TABLE public.registros_alimentacao ADD COLUMN IF NOT EXISTS marmitas_detalhe jsonb;
ALTER TABLE public.registros_alimentacao DROP CONSTRAINT IF EXISTS registros_alimentacao_marmitas_detalhe_check;
ALTER TABLE public.registros_alimentacao
  ADD CONSTRAINT registros_alimentacao_marmitas_detalhe_check
  CHECK (marmitas_detalhe IS NULL OR jsonb_typeof(marmitas_detalhe) = 'object');

CREATE OR REPLACE FUNCTION public.marmitas_detalhe_resumo(p_detalhe jsonb)
RETURNS TABLE(total integer, destinatario text)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_campos text[] := ARRAY['cafe_manha', 'lanche', 'almoco', 'jantar'];
  v_c text;
  v_t jsonb;
  v_valor jsonb;
  v_total integer := 0;
  v_linha integer;
  v_empresa text;
  v_empresas text[] := ARRAY[]::text[];
  v_chaves text[] := ARRAY[]::text[];
BEGIN
  IF p_detalhe IS NULL OR jsonb_typeof(p_detalhe) <> 'object'
     OR jsonb_typeof(p_detalhe->'interna') <> 'object'
     OR jsonb_typeof(COALESCE(p_detalhe->'terceirizadas', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Detalhe de marmitas inválido';
  END IF;

  FOREACH v_c IN ARRAY v_campos LOOP
    v_valor := p_detalhe->'interna'->v_c;
    IF v_valor IS NOT NULL AND (jsonb_typeof(v_valor) <> 'number' OR (v_valor #>> '{}')::numeric < 0
       OR (v_valor #>> '{}')::numeric <> trunc((v_valor #>> '{}')::numeric)) THEN
      RAISE EXCEPTION 'Quantidade de marmitas inválida';
    END IF;
    v_total := v_total + COALESCE((v_valor #>> '{}')::numeric::integer, 0);
  END LOOP;

  FOR v_t IN SELECT e FROM jsonb_array_elements(COALESCE(p_detalhe->'terceirizadas', '[]'::jsonb)) e LOOP
    IF jsonb_typeof(v_t) <> 'object' THEN
      RAISE EXCEPTION 'Detalhe de marmitas inválido';
    END IF;
    v_empresa := btrim(regexp_replace(COALESCE(v_t->>'empresa', ''), '\s+', ' ', 'g'));
    v_linha := 0;
    FOREACH v_c IN ARRAY v_campos LOOP
      v_valor := v_t->v_c;
      IF v_valor IS NOT NULL AND (jsonb_typeof(v_valor) <> 'number' OR (v_valor #>> '{}')::numeric < 0
         OR (v_valor #>> '{}')::numeric <> trunc((v_valor #>> '{}')::numeric)) THEN
        RAISE EXCEPTION 'Quantidade de marmitas inválida';
      END IF;
      v_linha := v_linha + COALESCE((v_valor #>> '{}')::numeric::integer, 0);
    END LOOP;
    IF v_linha > 0 AND v_empresa = '' THEN
      RAISE EXCEPTION 'Informe a empresa terceirizada';
    END IF;
    IF v_empresa <> '' AND NOT (lower(public.unaccent(v_empresa)) = ANY(v_chaves)) THEN
      v_empresas := v_empresas || v_empresa;
      v_chaves := v_chaves || lower(public.unaccent(v_empresa));
    END IF;
    v_total := v_total + v_linha;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Informe a quantidade de marmitas de pelo menos uma refeição';
  END IF;

  RETURN QUERY SELECT v_total,
    CASE WHEN COALESCE(array_length(v_empresas, 1), 0) > 0 THEN array_to_string(v_empresas, ', ') ELSE 'Funcionários' END;
END;
$function$;

REVOKE ALL ON FUNCTION public.marmitas_detalhe_resumo(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marmitas_detalhe_resumo(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_alimentacao_marmitas_detalhe()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_resumo record;
BEGIN
  IF NEW.marmitas_detalhe IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.modo IS DISTINCT FROM 'marmita' THEN
    RAISE EXCEPTION 'Detalhe de marmitas só vale para o modo marmita';
  END IF;
  SELECT * INTO v_resumo FROM public.marmitas_detalhe_resumo(NEW.marmitas_detalhe);
  NEW.quantidade_marmitas := v_resumo.total;
  NEW.destinatario := v_resumo.destinatario;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_alimentacao_marmitas_detalhe ON public.registros_alimentacao;
CREATE TRIGGER trg_alimentacao_marmitas_detalhe
  BEFORE INSERT OR UPDATE ON public.registros_alimentacao
  FOR EACH ROW EXECUTE FUNCTION public.trg_alimentacao_marmitas_detalhe();

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
  v_campos_marmita text[] := ARRAY['data','observacao','fornecedor','quantidade_marmitas','preco_unitario','destinatario','marmitas_detalhe'];
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
  v_resumo record;
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

  IF v_filtered ? 'marmitas_detalhe' AND COALESCE(v_old.modo, 'cantina') <> 'marmita' THEN
    RAISE EXCEPTION 'Detalhe de marmitas só vale para o modo marmita';
  END IF;

  v_new := jsonb_populate_record(v_old, v_filtered);

  -- Marmita detalhada: total e destinatário legados saem sempre da grade
  IF v_filtered ? 'marmitas_detalhe' AND v_new.marmitas_detalhe IS NOT NULL THEN
    SELECT * INTO v_resumo FROM public.marmitas_detalhe_resumo(v_new.marmitas_detalhe);
    v_new.quantidade_marmitas := v_resumo.total;
    v_new.destinatario := v_resumo.destinatario;
  END IF;

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
    marmitas_detalhe = v_new.marmitas_detalhe,
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

  -- Marmitas: divisão interna x terceirizada, por refeição e por empresa terceirizada.
  -- Registros antigos (sem marmitas_detalhe) contam como internas, com refeição "nao_informada".
  WITH base AS (
    SELECT r.id, COALESCE(r.quantidade_marmitas, 0) AS qtd, COALESCE(r.preco_unitario, 0) AS preco, r.marmitas_detalhe AS d
    FROM registros_alimentacao r
    WHERE r.fazenda_id = v_fazenda_id AND r.deleted_at IS NULL AND r.modo = 'marmita'
      AND (p_data_inicio IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date >= p_data_inicio)
      AND (p_data_fim IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date <= p_data_fim)
  ),
  refeicoes(refeicao) AS (VALUES ('cafe_manha'), ('lanche'), ('almoco'), ('jantar')),
  linhas AS (
    SELECT b.preco, 'interna'::text AS tipo, NULL::text AS empresa, k.refeicao,
           COALESCE((b.d->'interna'->>k.refeicao)::numeric, 0) AS qtd
    FROM base b CROSS JOIN refeicoes k
    WHERE b.d IS NOT NULL
    UNION ALL
    SELECT b.preco, 'terceirizada', btrim(regexp_replace(COALESCE(t->>'empresa', ''), '\s+', ' ', 'g')), k.refeicao,
           COALESCE((t->>k.refeicao)::numeric, 0)
    FROM base b
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.d->'terceirizadas', '[]'::jsonb)) t
    CROSS JOIN refeicoes k
    WHERE b.d IS NOT NULL
    UNION ALL
    SELECT b.preco, 'interna', NULL, 'nao_informada', b.qtd FROM base b WHERE b.d IS NULL
  )
  SELECT v_marm || jsonb_build_object(
    'por_tipo', jsonb_build_object(
      'interna', jsonb_build_object(
        'quantidade', COALESCE(SUM(qtd) FILTER (WHERE tipo = 'interna'), 0),
        'valor', ROUND(COALESCE(SUM(qtd * preco) FILTER (WHERE tipo = 'interna'), 0), 2)),
      'terceirizada', jsonb_build_object(
        'quantidade', COALESCE(SUM(qtd) FILTER (WHERE tipo = 'terceirizada'), 0),
        'valor', ROUND(COALESCE(SUM(qtd * preco) FILTER (WHERE tipo = 'terceirizada'), 0), 2))
    ),
    'por_refeicao', jsonb_build_object(
      'cafe_manha', COALESCE(SUM(qtd) FILTER (WHERE refeicao = 'cafe_manha'), 0),
      'lanche', COALESCE(SUM(qtd) FILTER (WHERE refeicao = 'lanche'), 0),
      'almoco', COALESCE(SUM(qtd) FILTER (WHERE refeicao = 'almoco'), 0),
      'jantar', COALESCE(SUM(qtd) FILTER (WHERE refeicao = 'jantar'), 0),
      'nao_informada', COALESCE(SUM(qtd) FILTER (WHERE refeicao = 'nao_informada'), 0)
    ),
    'por_empresa', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('empresa', e.empresa, 'quantidade', e.qtd, 'valor', e.valor)
                                ORDER BY e.qtd DESC, e.empresa), '[]'::jsonb)
      FROM (
        SELECT (array_agg(empresa ORDER BY qtd DESC, empresa))[1] AS empresa, SUM(qtd) AS qtd, ROUND(SUM(qtd * preco), 2) AS valor
        FROM linhas
        WHERE tipo = 'terceirizada' AND qtd > 0
        GROUP BY lower(public.unaccent(empresa))
      ) e
    )
  ) INTO v_marm
  FROM linhas;

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
