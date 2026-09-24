-- Ocupacao de currais por lote (historico) + separacao cronograma x participacao
--
-- Modelo anterior: cada vigencia de programacao_tratos carregava um snapshot de
-- currais + kg_mn_dia (programacao_tratos_currais), acoplando "quem participa" ao
-- cronograma. Novo modelo: a participacao e derivada da ocupacao fisica do curral
-- (lote_curral_historico) e programacao_tratos vira so cronograma (tratos,
-- percentuais, horarios). kg_mn_dia_dia1 e o "feed target" do dia 1 da ocupacao.
--
-- Conteudo:
-- 1. Tabela lote_curral_historico + indices + RLS + grants
-- 2. Trigger em currais.lote_id abrindo/fechando ocupacoes
-- 3. Trigger de compatibilidade: espelha ocupacoes atuais em
--    programacao_tratos_currais (vigencias presentes/futuras) para clientes
--    antigos (PWA) ate a janela de transicao
-- 4. RPC alocar_lote_curral (alocacao atomica com data de entrada + feed target)
-- 5. aprovar_solicitacao_novo_lote: curral para Confinamento/TIP/Sequestro

-- ============================================================================
-- 1. Tabela de historico de ocupacao
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lote_curral_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  lote_id uuid NOT NULL REFERENCES public.lotes(id) ON DELETE CASCADE,
  curral_id uuid NOT NULL REFERENCES public.currais(id) ON DELETE CASCADE,
  data_inicial date NOT NULL,
  data_final date,
  kg_mn_dia_dia1 numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lote_curral_historico_fazenda
  ON public.lote_curral_historico (fazenda_id);
CREATE INDEX IF NOT EXISTS idx_lote_curral_historico_curral
  ON public.lote_curral_historico (curral_id);
CREATE INDEX IF NOT EXISTS idx_lote_curral_historico_lote
  ON public.lote_curral_historico (lote_id);
CREATE INDEX IF NOT EXISTS idx_lote_curral_historico_janela
  ON public.lote_curral_historico (curral_id, data_inicial, data_final);

-- Uma ocupacao aberta por curral. Intervalos fechados podem se sobrepor no dia
-- da troca (saida+entrada no mesmo dia e legitimo); a resolucao para um dia D
-- usa a ocupacao de maior data_inicial que cobre D.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lote_curral_historico_aberta
  ON public.lote_curral_historico (curral_id) WHERE data_final IS NULL;

ALTER TABLE public.lote_curral_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lch_select ON public.lote_curral_historico;
DROP POLICY IF EXISTS lch_insert ON public.lote_curral_historico;
DROP POLICY IF EXISTS lch_update ON public.lote_curral_historico;
DROP POLICY IF EXISTS lch_delete ON public.lote_curral_historico;

CREATE POLICY lch_select ON public.lote_curral_historico
  FOR SELECT TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.usuario_fazenda uf
      WHERE uf.fazenda_id = lote_curral_historico.fazenda_id
        AND uf.usuario_id = auth.uid()
        AND uf.ativo = true
    )
  );

CREATE POLICY lch_insert ON public.lote_curral_historico
  FOR INSERT TO authenticated, anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuario_fazenda uf
      WHERE uf.fazenda_id = lote_curral_historico.fazenda_id
        AND uf.usuario_id = auth.uid()
        AND uf.ativo = true
    )
  );

CREATE POLICY lch_update ON public.lote_curral_historico
  FOR UPDATE TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.usuario_fazenda uf
      WHERE uf.fazenda_id = lote_curral_historico.fazenda_id
        AND uf.usuario_id = auth.uid()
        AND uf.ativo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuario_fazenda uf
      WHERE uf.fazenda_id = lote_curral_historico.fazenda_id
        AND uf.usuario_id = auth.uid()
        AND uf.ativo = true
    )
  );

CREATE POLICY lch_delete ON public.lote_curral_historico
  FOR DELETE TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.usuario_fazenda uf
      WHERE uf.fazenda_id = lote_curral_historico.fazenda_id
        AND uf.usuario_id = auth.uid()
        AND uf.ativo = true
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lote_curral_historico TO anon, authenticated;

CREATE OR REPLACE TRIGGER update_lote_curral_historico_updated_at
  BEFORE UPDATE ON public.lote_curral_historico
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 2. Trigger de historico em currais.lote_id
-- ============================================================================
-- Todo escritor de currais.lote_id (forms do painel, RPC solicitacoes_novo_lote,
-- desativacao/exclusao de lote, exclusao de curral/linha) gera ocupacao
-- automaticamente: limpar lote_id fecha a ocupacao aberta; setar lote_id fecha a
-- anterior (se houver) e abre uma nova com data_inicial = hoje no fuso da fazenda.

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

  -- Fecha ocupacao anterior quando lote_id muda (inclui troca direta e limpeza)
  IF TG_OP = 'UPDATE' AND OLD.lote_id IS DISTINCT FROM NEW.lote_id THEN
    UPDATE public.lote_curral_historico
       SET data_final = v_hoje, updated_at = now()
     WHERE curral_id = NEW.id
       AND data_final IS NULL;
  END IF;

  -- Abre nova ocupacao quando lote_id passa a estar preenchido
  IF NEW.lote_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.lote_id IS DISTINCT FROM NEW.lote_id) THEN
    INSERT INTO public.lote_curral_historico (fazenda_id, lote_id, curral_id, data_inicial)
    VALUES (NEW.fazenda_id, NEW.lote_id, NEW.id, v_hoje);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_currais_lote_historico ON public.currais;
CREATE TRIGGER trg_currais_lote_historico
  AFTER INSERT OR UPDATE OF lote_id ON public.currais
  FOR EACH ROW EXECUTE FUNCTION public.trg_currais_lote_historico();

-- ============================================================================
-- 3. Trigger de compatibilidade (espelho em programacao_tratos_currais)
-- ============================================================================
-- Mantem programacao_tratos_currais das vigencias presentes/futuras de cada tipo
-- sincronizada com as ocupacoes correntes, para que versoes antigas do PWA
-- continuem resolvendo a whitelist de currais ate serem atualizadas.
-- Remover este trigger na fase de limpeza pos-janela de transicao.

CREATE OR REPLACE FUNCTION public.trg_lch_sync_programacao_currais()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_sistema text;
  v_tipo text;
  v_n_cabecas integer;
  v_peso numeric;
BEGIN
  -- Tipo de programacao a partir do sistema do lote afetado
  SELECT l.sistema_producao, l.n_cabecas, l.peso_vivo_kg
    INTO v_sistema, v_n_cabecas, v_peso
    FROM public.lotes l
   WHERE l.id = COALESCE(NEW.lote_id, OLD.lote_id);

  v_tipo := CASE v_sistema
    WHEN 'Confinamento' THEN 'confinamento'
    WHEN 'Sequestro' THEN 'sequestro'
    WHEN 'TIP' THEN 'tip'
    ELSE NULL END;

  IF v_tipo IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Ocupacao fechada (ou removida): tira o curral das vigencias presentes/futuras
  IF (TG_OP = 'DELETE')
     OR (TG_OP = 'UPDATE' AND OLD.data_final IS NULL AND NEW.data_final IS NOT NULL) THEN
    DELETE FROM public.programacao_tratos_currais ptc
     USING public.programacao_tratos pt
     WHERE ptc.programacao_id = pt.id
       AND ptc.curral_id = OLD.curral_id
       AND pt.fazenda_id = OLD.fazenda_id
       AND pt.tipo = v_tipo
       AND pt.ativo = true
       AND pt.data_fim >= v_hoje;
  END IF;

  -- Ocupacao aberta (insert) ou kg da ocupacao vigente alterado: espelha
  IF TG_OP = 'INSERT'
     OR (TG_OP = 'UPDATE' AND NEW.data_final IS NULL
         AND (NEW.kg_mn_dia_dia1 IS DISTINCT FROM OLD.kg_mn_dia_dia1
              OR NEW.lote_id IS DISTINCT FROM OLD.lote_id)) THEN
    INSERT INTO public.programacao_tratos_currais
      (programacao_id, curral_id, lote_id, kg_mn_dia, n_cabecas_snapshot, peso_vivo_medio_snapshot)
    SELECT pt.id, NEW.curral_id, NEW.lote_id,
           COALESCE(NEW.kg_mn_dia_dia1, 0), v_n_cabecas, v_peso
      FROM public.programacao_tratos pt
     WHERE pt.fazenda_id = NEW.fazenda_id
       AND pt.tipo = v_tipo
       AND pt.ativo = true
       AND pt.data_fim >= v_hoje
    ON CONFLICT (programacao_id, curral_id) DO UPDATE
       SET lote_id = EXCLUDED.lote_id,
           kg_mn_dia = EXCLUDED.kg_mn_dia,
           n_cabecas_snapshot = EXCLUDED.n_cabecas_snapshot,
           peso_vivo_medio_snapshot = EXCLUDED.peso_vivo_medio_snapshot,
           updated_at = now();
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_lch_sync_programacao_currais ON public.lote_curral_historico;
CREATE TRIGGER trg_lch_sync_programacao_currais
  AFTER INSERT OR UPDATE OR DELETE ON public.lote_curral_historico
  FOR EACH ROW EXECUTE FUNCTION public.trg_lch_sync_programacao_currais();

-- ============================================================================
-- 4. RPC alocar_lote_curral
-- ============================================================================
-- Alocacao atomica: valida sistema do lote e disponibilidade do curral, seta
-- currais.lote_id (o trigger abre a ocupacao) e ajusta data de entrada e feed
-- target na ocupacao recem-aberta.

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
  v_curral record;
  v_lote record;
  v_ocupacao_id uuid;
BEGIN
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

  IF v_curral.lote_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Curral já está ocupado por outro lote');
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

  IF EXISTS (SELECT 1 FROM public.currais WHERE lote_id = p_lote_id AND id <> p_curral_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lote já está alocado em outro curral');
  END IF;

  UPDATE public.currais
     SET lote_id = p_lote_id, updated_at = now()
   WHERE id = p_curral_id;

  UPDATE public.lote_curral_historico
     SET data_inicial = COALESCE(p_data_entrada, data_inicial),
         kg_mn_dia_dia1 = p_kg_mn_dia_dia1,
         updated_at = now()
   WHERE curral_id = p_curral_id
     AND data_final IS NULL
  RETURNING id INTO v_ocupacao_id;

  RETURN jsonb_build_object('success', true, 'ocupacao_id', v_ocupacao_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.alocar_lote_curral(uuid, uuid, date, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.alocar_lote_curral(uuid, uuid, date, numeric) TO anon;

-- ============================================================================
-- 5. aprovar_solicitacao_novo_lote: curral para Confinamento/TIP/Sequestro
-- ============================================================================
-- Copia integral da versao 20260921150000 com a condicao de vinculo de curral
-- (e o NULL de pasto_id) ampliada de 'Confinamento' para os sistemas que usam
-- curral (paridade com usaCurral do painel).

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
