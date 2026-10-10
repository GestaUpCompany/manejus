-- Curral x lote 1:1, parte 1: funcoes (convencao de datas, troca atomica, aprovacao de novo lote)
--
-- Regra de negocio: um curral tem no maximo um lote por vez e um lote ocupa no
-- maximo um curral por vez, em qualquer data. Esta migration adapta as funcoes
-- ANTES das constraints (20261010101000), para que nenhuma operacao do painel
-- gere sobreposicao.
--
-- Convencao de datas em lote_curral_historico (data_final INCLUSIVA):
--   * o dia da troca pertence ao lote que ENTRA; o lote que sai termina em D-1;
--   * liberar um curral sem substituto termina a ocupacao em hoje (o dia ainda e
--     do lote que saiu);
--   * ao ocupar o curral, ocupacoes do curral ou do lote que ainda cobrem hoje
--     "cedem o dia": terminam ontem, ou sao removidas se comecaram hoje (nunca
--     tiveram um dia completo).
--
-- Conteudo:
-- 1. trg_currais_lote_historico: aplica a convencao
-- 2. trocar_lote_curral: troca/alocacao atomica com data, locks e validacoes
-- 3. alocar_lote_curral: mesma semantica de antes (curral e lote livres), agora
--    delegando para trocar_lote_curral
-- 4. aprovar_solicitacao_novo_lote: exige curral livre (copia integral da versao
--    20261003110000 com a validacao 4b)
--
-- Rollback: supabase/rollbacks/20261010100000_curral_lote_1a1_funcoes_rollback.sql

-- ============================================================================
-- 1. Trigger de historico em currais.lote_id
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_currais_lote_historico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_hoje date;
  v_tz text;
BEGIN
  SELECT COALESCE(f.timezone, 'America/Cuiaba') INTO v_tz
    FROM public.fazendas f
   WHERE f.id = COALESCE(NEW.fazenda_id, OLD.fazenda_id);
  v_hoje := (now() AT TIME ZONE COALESCE(v_tz, 'America/Cuiaba'))::date;

  -- Encerra a ocupacao aberta quando lote_id muda (troca direta ou limpeza).
  IF TG_OP = 'UPDATE' AND OLD.lote_id IS DISTINCT FROM NEW.lote_id THEN
    -- Entrada futura nunca aconteceu: remove em vez de fechar com data_final < data_inicial.
    DELETE FROM public.lote_curral_historico
     WHERE curral_id = NEW.id
       AND data_final IS NULL
       AND data_inicial > v_hoje;

    UPDATE public.lote_curral_historico
       SET data_final = v_hoje, updated_at = now()
     WHERE curral_id = NEW.id
       AND data_final IS NULL;
  END IF;

  -- Abre nova ocupacao quando lote_id passa a estar preenchido.
  IF NEW.lote_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.lote_id IS DISTINCT FROM NEW.lote_id) THEN
    -- O dia de hoje passa a ser do lote que entra: ocupacoes do curral ou do lote
    -- que ainda cobrem hoje cedem o dia (somem se comecaram hoje; senao terminam ontem).
    DELETE FROM public.lote_curral_historico
     WHERE (curral_id = NEW.id OR lote_id = NEW.lote_id)
       AND data_final >= v_hoje
       AND data_inicial >= v_hoje;

    UPDATE public.lote_curral_historico
       SET data_final = v_hoje - 1, updated_at = now()
     WHERE (curral_id = NEW.id OR lote_id = NEW.lote_id)
       AND data_final >= v_hoje;

    INSERT INTO public.lote_curral_historico (fazenda_id, lote_id, curral_id, data_inicial)
    VALUES (NEW.fazenda_id, NEW.lote_id, NEW.id, v_hoje);
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. trocar_lote_curral: troca/alocacao atomica
-- ============================================================================
-- Coloca p_lote_id em p_curral_id. Se o curral tem outro lote, ele sai; se o lote
-- esta em outro curral, esse curral e liberado. Tudo na mesma transacao: uma falha
-- nao deixa lote sem curral. p_data_entrada e o primeiro dia do lote no curral
-- (default hoje; nao pode ser futura). O lote/curral anterior termina em D-1.

CREATE OR REPLACE FUNCTION public.trocar_lote_curral(
  p_curral_id uuid,
  p_lote_id uuid,
  p_data_entrada date DEFAULT NULL,
  p_kg_mn_dia_dia1 numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_curral record;
  v_lote record;
  v_tz text;
  v_hoje date;
  v_data date;
  v_antigas uuid[];
  v_conflito record;
  v_ocupacao_id uuid;
BEGIN
  -- Travas por curral e por lote, sempre em ordem crescente (evita deadlock entre chamadas cruzadas).
  PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(p_curral_id::text, p_lote_id::text), 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(GREATEST(p_curral_id::text, p_lote_id::text), 0));

  SELECT c.id, c.fazenda_id, c.lote_id, c.ativo, c.deleted_at
    INTO v_curral
    FROM public.currais c
   WHERE c.id = p_curral_id;

  IF NOT FOUND OR v_curral.ativo IS DISTINCT FROM true OR v_curral.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Curral não encontrado ou inativo');
  END IF;

  IF NOT public.user_has_fazenda_access(v_curral.fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda do curral');
  END IF;

  SELECT l.id, l.fazenda_id, l.sistema_producao
    INTO v_lote
    FROM public.lotes l
   WHERE l.id = p_lote_id
     AND l.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lote não encontrado');
  END IF;

  IF v_lote.fazenda_id <> v_curral.fazenda_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lote e curral pertencem a fazendas diferentes');
  END IF;

  IF v_lote.sistema_producao NOT IN ('Confinamento', 'TIP', 'Sequestro') THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Sistema de produção do lote (' || COALESCE(v_lote.sistema_producao, 'indefinido') || ') não utiliza curral');
  END IF;

  SELECT COALESCE(f.timezone, 'America/Cuiaba') INTO v_tz FROM public.fazendas f WHERE f.id = v_curral.fazenda_id;
  v_hoje := (now() AT TIME ZONE COALESCE(v_tz, 'America/Cuiaba'))::date;
  v_data := COALESCE(p_data_entrada, v_hoje);

  IF v_data > v_hoje THEN
    RETURN jsonb_build_object('success', false, 'error', 'A data de entrada não pode ser futura');
  END IF;

  -- Lote ja esta neste curral: nada a trocar; so atualiza o feed target se informado.
  IF v_curral.lote_id = p_lote_id THEN
    UPDATE public.lote_curral_historico
       SET kg_mn_dia_dia1 = COALESCE(p_kg_mn_dia_dia1, kg_mn_dia_dia1), updated_at = now()
     WHERE curral_id = p_curral_id AND data_final IS NULL
    RETURNING id INTO v_ocupacao_id;
    RETURN jsonb_build_object('success', true, 'ocupacao_id', v_ocupacao_id, 'sem_alteracao', true);
  END IF;

  SELECT array_agg(h.id) INTO v_antigas
    FROM public.lote_curral_historico h
   WHERE h.data_final IS NULL
     AND (h.curral_id = p_curral_id OR h.lote_id = p_lote_id);

  IF v_data < v_hoje THEN
    -- Entrada retroativa: nao pode atropelar o historico existente.
    SELECT h.data_inicial INTO v_conflito
      FROM public.lote_curral_historico h
     WHERE h.id = ANY(COALESCE(v_antigas, '{}'::uuid[]))
       AND h.data_inicial >= v_data
     ORDER BY h.data_inicial DESC
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('success', false, 'error',
        'A data de entrada deve ser posterior à entrada da ocupação atual (' || to_char(v_conflito.data_inicial, 'DD/MM/YYYY') || ')');
    END IF;

    SELECT h.data_final INTO v_conflito
      FROM public.lote_curral_historico h
     WHERE (h.curral_id = p_curral_id OR h.lote_id = p_lote_id)
       AND h.data_final IS NOT NULL
       AND h.data_final >= v_data
     ORDER BY h.data_final DESC
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Já existe ocupação deste curral ou lote até ' || to_char(v_conflito.data_final, 'DD/MM/YYYY') || '; informe uma data posterior');
    END IF;
  END IF;

  BEGIN
    -- Libera o curral onde o lote estava (se outro).
    UPDATE public.currais
       SET lote_id = NULL, updated_at = now()
     WHERE lote_id = p_lote_id
       AND id <> p_curral_id
       AND deleted_at IS NULL;

    -- Ocupa o curral (o trigger encerra a ocupacao anterior e abre a nova em hoje).
    UPDATE public.currais
       SET lote_id = p_lote_id, updated_at = now()
     WHERE id = p_curral_id;

    -- Entrada retroativa: ajusta as datas (primeiro encerra as antigas em D-1, depois recua a nova).
    IF v_data < v_hoje THEN
      UPDATE public.lote_curral_historico
         SET data_final = v_data - 1, updated_at = now()
       WHERE id = ANY(COALESCE(v_antigas, '{}'::uuid[]));

      UPDATE public.lote_curral_historico
         SET data_inicial = v_data, updated_at = now()
       WHERE curral_id = p_curral_id
         AND lote_id = p_lote_id
         AND data_final IS NULL;
    END IF;

    UPDATE public.lote_curral_historico
       SET kg_mn_dia_dia1 = p_kg_mn_dia_dia1, updated_at = now()
     WHERE curral_id = p_curral_id
       AND data_final IS NULL
    RETURNING id INTO v_ocupacao_id;
  EXCEPTION
    WHEN exclusion_violation OR unique_violation THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Conflito de ocupação: o curral ou o lote já está ocupado nesse período');
  END;

  RETURN jsonb_build_object('success', true, 'ocupacao_id', v_ocupacao_id);
END;
$$;

REVOKE ALL ON FUNCTION public.trocar_lote_curral(uuid, uuid, date, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trocar_lote_curral(uuid, uuid, date, numeric) TO authenticated;

-- ============================================================================
-- 3. alocar_lote_curral: curral e lote precisam estar livres (como antes)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.alocar_lote_curral(
  p_curral_id uuid,
  p_lote_id uuid,
  p_data_entrada date DEFAULT NULL,
  p_kg_mn_dia_dia1 numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_ocupante uuid;
BEGIN
  -- Mesmas travas de trocar_lote_curral (reentrantes na transacao): a checagem de
  -- disponibilidade e a alocacao ficam atomicas contra chamadas concorrentes.
  PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(p_curral_id::text, p_lote_id::text), 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(GREATEST(p_curral_id::text, p_lote_id::text), 0));

  SELECT c.lote_id INTO v_ocupante FROM public.currais c WHERE c.id = p_curral_id;
  IF v_ocupante IS NOT NULL AND v_ocupante IS DISTINCT FROM p_lote_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Curral já está ocupado por outro lote');
  END IF;

  IF EXISTS (SELECT 1 FROM public.currais WHERE lote_id = p_lote_id AND id <> p_curral_id AND deleted_at IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lote já está alocado em outro curral');
  END IF;

  RETURN public.trocar_lote_curral(p_curral_id, p_lote_id, p_data_entrada, p_kg_mn_dia_dia1);
END;
$$;

-- ============================================================================
-- 4. aprovar_solicitacao_novo_lote: curral de destino precisa estar livre
-- ============================================================================
-- Copia integral da versao 20261003110000 com a validacao 4b (curral de destino):
-- antes, o UPDATE currais SET lote_id sobrescrevia em silencio um curral ocupado.
-- Excecao: transferencia total a partir do proprio curral do lote de origem (o lote
-- de origem sai do curral, o novo entra).

CREATE OR REPLACE FUNCTION public.aprovar_solicitacao_novo_lote(
  p_solicitacao_id uuid,
  p_dados_lote_editado jsonb,
  p_categorias_editadas jsonb,
  p_usuario_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_sol RECORD;
  v_lote_origem RECORD;
  v_fazenda_id uuid;
  v_dados_lote jsonb;
  v_nome_lote text;
  v_pasto_id uuid;
  v_curral_id uuid;
  v_curral RECORD;
  v_sistema_producao text;
  v_destino text;
  v_novo_lote_id uuid;
  v_novo_lote_nome text;
  v_nome_base text;
  v_sufixo_num int := 0;
  v_total_transferir int := 0;
  v_total_origem int := 0;
  v_is_total boolean;
  v_cat_item jsonb;
  v_categoria text;
  v_cabecas int;
  v_cat_origem RECORD;
  v_mov_ids uuid[] := '{}';
  v_mov_id uuid;
  v_data_mov timestamptz;
  v_lote_created_at timestamptz;
  v_controller RECORD;
  v_result jsonb;
  v_cat_count int;
  v_i int;
BEGIN
  -- 1. Carregar solicitação
  SELECT * INTO v_sol FROM solicitacoes_novo_lote WHERE id = p_solicitacao_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitação não encontrada');
  END IF;
  IF v_sol.status <> 'pendente' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitação não está pendente (status: ' || v_sol.status || ')');
  END IF;

  v_fazenda_id := v_sol.fazenda_id;

  -- 2. Determinar dados do lote (editado ou proposto)
  v_dados_lote := COALESCE(p_dados_lote_editado, v_sol.dados_lote_proposto);
  v_nome_lote := v_dados_lote->>'nome';
  v_pasto_id := NULLIF(v_dados_lote->>'pasto_id', '')::uuid;
  v_curral_id := NULLIF(v_dados_lote->>'curral_id', '')::uuid;
  v_sistema_producao := v_dados_lote->>'sistema_producao';
  v_destino := v_dados_lote->>'destino';

  IF v_nome_lote IS NULL OR v_nome_lote = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nome do lote é obrigatório');
  END IF;

  -- 3. Carregar lote origem
  SELECT * INTO v_lote_origem FROM lotes WHERE id = v_sol.lote_origem_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lote origem não encontrado');
  END IF;

  -- 4. Calcular totais
  v_cat_count := jsonb_array_length(COALESCE(p_categorias_editadas, v_sol.categorias));
  IF v_cat_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nenhuma categoria informada');
  END IF;

  FOR v_i IN 0..v_cat_count-1 LOOP
    v_cat_item := COALESCE(p_categorias_editadas, v_sol.categorias)->v_i;
    v_cabecas := (v_cat_item->>'numero_cabecas')::int;
    IF v_cabecas IS NULL OR v_cabecas <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cabeças inválidas para categoria: ' || (v_cat_item->>'categoria'));
    END IF;
    v_total_transferir := v_total_transferir + v_cabecas;
  END LOOP;

  SELECT COALESCE(SUM(quant_atual), 0) INTO v_total_origem
  FROM lote_categorias
  WHERE lote_id = v_sol.lote_origem_id AND ativo = true;

  v_is_total := (v_total_transferir >= v_total_origem);

  -- 4b. Curral de destino (1:1): precisa ser da fazenda, estar ativo e livre. Unica
  -- excecao: transferencia total a partir do proprio curral do lote de origem.
  IF v_sistema_producao IN ('Confinamento', 'TIP', 'Sequestro') AND v_curral_id IS NOT NULL THEN
    SELECT c.id, c.nome, c.fazenda_id, c.lote_id, c.ativo, c.deleted_at
      INTO v_curral
      FROM currais c
     WHERE c.id = v_curral_id
     FOR UPDATE;

    IF NOT FOUND OR v_curral.fazenda_id <> v_fazenda_id
       OR v_curral.ativo IS DISTINCT FROM true OR v_curral.deleted_at IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Curral de destino não encontrado ou inativo');
    END IF;

    IF v_curral.lote_id IS NOT NULL
       AND NOT (v_is_total AND v_curral.lote_id = v_sol.lote_origem_id) THEN
      RETURN jsonb_build_object('success', false, 'error',
        'O curral "' || v_curral.nome || '" já está ocupado por outro lote. Escolha um curral livre.');
    END IF;
  END IF;

  -- 5. Gerar nome do novo lote (sufixar se colidir)
  v_nome_base := v_nome_lote;
  v_novo_lote_nome := v_nome_base;
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM lotes
      WHERE fazenda_id = v_fazenda_id AND nome = v_novo_lote_nome AND deleted_at IS NULL
    ) THEN
      EXIT;
    END IF;
    v_sufixo_num := v_sufixo_num + 1;
    v_novo_lote_nome := v_nome_base || ' (' || v_sufixo_num::text || ')';
    IF v_sufixo_num > 99 THEN
      v_novo_lote_nome := v_nome_base || ' (' || to_char(now(), 'YYYYMMDDHH24MI') || ')';
      EXIT;
    END IF;
  END LOOP;

  -- 6. Criar lote
  INSERT INTO lotes (
    fazenda_id, nome, n_cabecas, ativo,
    numero_cabecas,
    pasto_id,
    sistema_producao, destino,
    raca, sexo, idade_meses, rc_inicial, preco_kg, preco_cab,
    custo_operacional_reais_cab_dia, estrategia_nutricional,
    produtor_rural, propriedade_origem, numero_contrato, mes_competencia,
    data_liberacao_sisbov, periodo_liberacao_sisbov, data_embarque_previsto,
    quant_inicial, peso_entrada_kg, data_pesagem, data_meta,
    peso_vivo_meta_kg, peso_vivo_kg, peso_entrada_kg_cab, periodo,
    preco_animal_kg, preco_animal_cab, idade,
    dias_restantes_meta, data_embarque_prevista, meta_intervalo_rodeio_dias,
    data_proximo_rodeio, qtd_bezerros, quantidade_bezerros
  ) VALUES (
    v_fazenda_id, v_novo_lote_nome, v_total_transferir, true,
    v_total_transferir,
    CASE WHEN v_sistema_producao IN ('Confinamento', 'TIP', 'Sequestro') THEN NULL ELSE v_pasto_id END,
    v_sistema_producao, v_destino,
    v_lote_origem.raca, v_lote_origem.sexo, v_lote_origem.idade_meses,
    v_lote_origem.rc_inicial, v_lote_origem.preco_kg, v_lote_origem.preco_cab,
    v_lote_origem.custo_operacional_reais_cab_dia, v_lote_origem.estrategia_nutricional,
    v_lote_origem.produtor_rural, v_lote_origem.propriedade_origem,
    v_lote_origem.numero_contrato, v_lote_origem.mes_competencia,
    v_lote_origem.data_liberacao_sisbov, v_lote_origem.periodo_liberacao_sisbov,
    v_lote_origem.data_embarque_previsto,
    v_total_transferir, v_lote_origem.peso_entrada_kg,
    v_lote_origem.data_pesagem, v_lote_origem.data_meta,
    v_lote_origem.peso_vivo_meta_kg, v_lote_origem.peso_vivo_kg, v_lote_origem.peso_entrada_kg_cab, v_lote_origem.periodo,
    v_lote_origem.preco_animal_kg, v_lote_origem.preco_animal_cab, v_lote_origem.idade,
    v_lote_origem.dias_restantes_meta, v_lote_origem.data_embarque_prevista,
    v_lote_origem.meta_intervalo_rodeio_dias, v_lote_origem.data_proximo_rodeio,
    v_lote_origem.qtd_bezerros, v_lote_origem.quantidade_bezerros
  )
  RETURNING id, created_at INTO v_novo_lote_id, v_lote_created_at;

  -- 7. Vincular curral para sistemas que usam curral (Confinamento/TIP/Sequestro)
  IF v_sistema_producao IN ('Confinamento', 'TIP', 'Sequestro') AND v_curral_id IS NOT NULL THEN
    UPDATE currais SET lote_id = v_novo_lote_id WHERE id = v_curral_id;
  END IF;

  -- 8. Criar lote_categorias (snapshot completo da origem, sem gmd)
  FOR v_i IN 0..v_cat_count-1 LOOP
    v_cat_item := COALESCE(p_categorias_editadas, v_sol.categorias)->v_i;
    v_categoria := v_cat_item->>'categoria';
    v_cabecas := (v_cat_item->>'numero_cabecas')::int;

    SELECT * INTO v_cat_origem
    FROM lote_categorias
    WHERE lote_id = v_sol.lote_origem_id
      AND LOWER(categoria) = LOWER(v_categoria)
      AND ativo = true;

    INSERT INTO lote_categorias (
      lote_id, categoria, quant_inicial, quant_atual,
      data_pesagem, peso_entrada_kg_cab, peso_entrada_arrobas,
      periodo, rc_inicial,
      peso_vivo_atual_kg_cab, peso_vivo_meta_kg_cab, dias_restantes_meta,
      data_meta_projetada, estrategia_nutricional, raca, sexo, idade, ativo,
      morte, consumo, abate, transf_entrada, transf_saida, qtd_bezerros,
      consumo_meta_porcentagem_pesovivo, rc_final, peso_venda_meta_arroba,
      margem_lucro_percent, preco_custo_reais_arroba, preco_custo_cab,
      preco_venda_projetado_reais_arroba, preco_venda_sugerido_cab, rc_atual,
      peso_vivo_atual_arroba_cab, producao_atual_arroba_cab, producao_projetada_arroba_cab,
      preco_entrada_reais_arroba, faturamento_projetado_reais_lote_categoria,
      venda_total_arroba_lote_categoria, agio_percent, custo_frete_reais_cab,
      custo_comissao_reais_cab, custo_sanidade_reais_cab,
      custo_identificacao_rastreabilidade_reais_cab, custo_total_entrada_reais_cab,
      custo_total_entrada_reais_lote, preco_entrada_reais_kg, preco_entrada_reais_cab,
      custo_operacional_reais_cab_dia
    ) VALUES (
      v_novo_lote_id, v_categoria, v_cabecas, v_cabecas,
      NULLIF(v_cat_item->>'data_pesagem', '')::date,
      NULLIF(v_cat_item->>'peso_entrada_kg_cab', '')::numeric,
      NULLIF(v_cat_item->>'peso_entrada_arrobas', '')::numeric,
      NULLIF(v_cat_item->>'periodo', '')::int,
      NULLIF(v_cat_item->>'rc_inicial', '')::numeric,
      NULLIF(v_cat_item->>'peso_vivo_atual_kg_cab', '')::numeric,
      NULLIF(v_cat_item->>'peso_vivo_meta_kg_cab', '')::numeric,
      NULLIF(v_cat_item->>'dias_restantes_meta', '')::int,
      NULLIF(v_cat_item->>'data_meta_projetada', '')::date,
      NULLIF(v_cat_item->>'estrategia_nutricional', ''),
      NULLIF(v_cat_item->>'raca', ''),
      NULLIF(v_cat_item->>'sexo', ''),
      NULLIF(v_cat_item->>'idade', '')::int,
      true,
      0, 0, 0, 0, 0,
      NULLIF(v_cat_item->>'qtd_bezerros', '')::int,
      NULLIF(v_cat_item->>'consumo_meta_porcentagem_pesovivo', '')::numeric,
      NULLIF(v_cat_item->>'rc_final', '')::numeric,
      NULLIF(v_cat_item->>'peso_venda_meta_arroba', '')::numeric,
      NULLIF(v_cat_item->>'margem_lucro_percent', '')::numeric,
      NULLIF(v_cat_item->>'preco_custo_reais_arroba', '')::numeric,
      NULLIF(v_cat_item->>'preco_custo_cab', '')::numeric,
      NULLIF(v_cat_item->>'preco_venda_projetado_reais_arroba', '')::numeric,
      NULLIF(v_cat_item->>'preco_venda_sugerido_cab', '')::numeric,
      NULLIF(v_cat_item->>'rc_atual', '')::numeric,
      NULLIF(v_cat_item->>'peso_vivo_atual_arroba_cab', '')::numeric,
      NULLIF(v_cat_item->>'producao_atual_arroba_cab', '')::numeric,
      NULLIF(v_cat_item->>'producao_projetada_arroba_cab', '')::numeric,
      NULLIF(v_cat_item->>'preco_entrada_reais_arroba', '')::numeric,
      NULLIF(v_cat_item->>'faturamento_projetado_reais_lote_categoria', '')::numeric,
      NULLIF(v_cat_item->>'venda_total_arroba_lote_categoria', '')::numeric,
      NULLIF(v_cat_item->>'agio_percent', '')::numeric,
      NULLIF(v_cat_item->>'custo_frete_reais_cab', '')::numeric,
      NULLIF(v_cat_item->>'custo_comissao_reais_cab', '')::numeric,
      NULLIF(v_cat_item->>'custo_sanidade_reais_cab', '')::numeric,
      NULLIF(v_cat_item->>'custo_identificacao_rastreabilidade_reais_cab', '')::numeric,
      NULLIF(v_cat_item->>'custo_total_entrada_reais_cab', '')::numeric,
      NULLIF(v_cat_item->>'custo_total_entrada_reais_lote', '')::numeric,
      NULLIF(v_cat_item->>'preco_entrada_reais_kg', '')::numeric,
      NULLIF(v_cat_item->>'preco_entrada_reais_cab', '')::numeric,
      NULLIF(v_cat_item->>'custo_operacional_reais_cab_dia', '')::numeric
    );
  END LOOP;

  -- 9. Criar registros_movimentacao (1s após criação do lote)
  v_data_mov := v_lote_created_at + interval '1 second';

  FOR v_i IN 0..v_cat_count-1 LOOP
    v_cat_item := COALESCE(p_categorias_editadas, v_sol.categorias)->v_i;
    v_categoria := v_cat_item->>'categoria';
    v_cabecas := (v_cat_item->>'numero_cabecas')::int;

    INSERT INTO registros_movimentacao (
      fazenda_id, data, lote_origem, lote_origem_id,
      destino, lote_destino_id, numero_cabecas, categoria,
      motivo_movimentacao, subtipo, observacao,
      responsavel, nome_usuario, sync_status, version,
      created_at, updated_at
    ) VALUES (
      v_fazenda_id,
      v_data_mov,
      v_sol.lote_origem_nome,
      v_sol.lote_origem_id,
      v_novo_lote_nome,
      v_novo_lote_id,
      v_cabecas,
      v_categoria,
      'Saída'::tipo_movimentacao_motivo,
      'Novo Lote'::tipo_movimentacao_subtipo,
      COALESCE(v_sol.dados_movimentacao->>'observacao', v_sol.dados_movimentacao->>'causa_observacao'),
      v_sol.dados_movimentacao->>'usuario',
      v_sol.dados_movimentacao->>'usuario',
      'synced',
      1,
      v_data_mov,
      v_data_mov
    )
    RETURNING id INTO v_mov_id;

    v_mov_ids := array_append(v_mov_ids, v_mov_id);
  END LOOP;

  -- 10. Ajustar lote origem
  IF v_is_total THEN
    UPDATE lotes SET ativo = false, n_cabecas = 0, numero_cabecas = 0, updated_at = now()
    WHERE id = v_sol.lote_origem_id;
    UPDATE lote_categorias SET ativo = false, quant_atual = 0, updated_at = now()
    WHERE lote_id = v_sol.lote_origem_id AND ativo = true;
  ELSE
    FOR v_i IN 0..v_cat_count-1 LOOP
      v_cat_item := COALESCE(p_categorias_editadas, v_sol.categorias)->v_i;
      v_categoria := v_cat_item->>'categoria';
      v_cabecas := (v_cat_item->>'numero_cabecas')::int;
      UPDATE lote_categorias
      SET transf_saida = transf_saida + v_cabecas,
          updated_at = now()
      WHERE lote_id = v_sol.lote_origem_id
        AND LOWER(categoria) = LOWER(v_categoria)
        AND ativo = true;
    END LOOP;
    UPDATE lotes
    SET n_cabecas = GREATEST(COALESCE(n_cabecas, 0) - v_total_transferir, 0),
        numero_cabecas = GREATEST(COALESCE(numero_cabecas, 0) - v_total_transferir, 0),
        updated_at = now()
    WHERE id = v_sol.lote_origem_id;
  END IF;

  -- 11. Atualizar solicitação
  UPDATE solicitacoes_novo_lote
  SET status = 'aprovada',
      aprovada_at = now(),
      aprovada_by = p_usuario_id,
      lote_criado_id = v_novo_lote_id,
      movimentacao_criada_ids = v_mov_ids,
      dados_lote_editado = p_dados_lote_editado,
      categorias_editadas = p_categorias_editadas,
      updated_at = now()
  WHERE id = p_solicitacao_id;

  -- 12. Notificar controllers
  FOR v_controller IN
    SELECT u.id FROM usuarios u
    JOIN usuario_fazenda uf ON u.id = uf.usuario_id
    WHERE uf.fazenda_id = v_fazenda_id
      AND uf.ativo = true
      AND uf.papel IN ('admin', 'controller')
      AND (u.id)::text NOT LIKE '%@gestaup.internal'
      AND u.ativo = true
  LOOP
    INSERT INTO notificacoes (usuario_id, fazenda_id, tipo, titulo, mensagem, acao_url, acao_label, dados_jsonb)
    VALUES (
      v_controller.id,
      v_fazenda_id,
      'success',
      'Lote criado por aprovação: ' || v_novo_lote_nome,
      'Lote "' || v_novo_lote_nome || '" criado a partir do lote "' || v_sol.lote_origem_nome || '". Total: ' || v_total_transferir || ' cabeças.',
      '/controller/lotes',
      'Ver lotes',
      jsonb_build_object(
        'tipo_solicitacao', 'novo_lote_aprovado',
        'solicitacao_id', p_solicitacao_id,
        'lote_criado_id', v_novo_lote_id,
        'lote_nome', v_novo_lote_nome
      )
    );
  END LOOP;

  v_result := jsonb_build_object(
    'success', true,
    'lote_criado_id', v_novo_lote_id,
    'lote_criado_nome', v_novo_lote_nome,
    'movimentacao_ids', v_mov_ids,
    'total_cabecas', v_total_transferir,
    'transferencia_total', v_is_total
  );

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.aprovar_solicitacao_novo_lote(uuid, jsonb, jsonb, uuid) TO authenticated;
