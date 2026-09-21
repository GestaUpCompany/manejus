-- Recategorização in-place: congelar saldo em quant_base em vez de reescrever registros
--
-- Substitui a abordagem da migration 20260921120000 (reescrever
-- registros_movimentacao/registros_morte com o nome novo). A reescrita tinha
-- um defeito estrutural: um registro com lote_destino_id pertence a dois
-- lotes, e renomear categoria só pode estar certo para um deles quando os
-- nomes divergem. No caso observado (apartação LOTE 08P -> TIP LOTE 28/29
-- seguida de recategorização garrote -> boi magro no destino), a reescrita
-- fazia a saída deixar de casar com a linha 'garrote' de LOTE 08P, e o próximo
-- recálculo inflaria a origem de 260 para 680.
--
-- Nova abordagem: nenhum registro é tocado. Na recategorização in-place, o
-- saldo atual é congelado em lote_categorias.quant_base, que passa a ser a
-- base de contagem da categoria vigente (calculate_quant_atual usa
-- COALESCE(quant_base, quant_inicial)). Registros históricos ficam absorvidos
-- na base; registros futuros com o nome novo somam normalmente. O histórico
-- por nome fica integralmente preservado, e a linhagem categoria->categoria
-- continua em lote_categorias_transicoes.
--
-- Fórmula da base: quant_base = quant_atual - S, onde S é o que ainda seria
-- contado após o rename (registros com o NOVO nome e data >= created_at).
-- Normalmente S = 0 e quant_base = quant_atual; a subtração cobre o caso raro
-- de já existir registro com o nome de destino dentro da janela de contagem.

ALTER TABLE public.lote_categorias
  ADD COLUMN IF NOT EXISTS quant_base integer;

COMMENT ON COLUMN public.lote_categorias.quant_base IS
  'Base de contagem congelada na última recategorização in-place. Quando preenchida, substitui quant_inicial como termo base de calculate_quant_atual. Preserva o saldo sem reescrever o nome da categoria nos registros históricos.';

-- =============================================================================
-- calculate_quant_atual: base passa a ser COALESCE(quant_base, quant_inicial)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.calculate_quant_atual(p_lote_id uuid, p_categoria text)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_quant_inicial_raw INTEGER;
  v_quant_base_raw INTEGER;
  v_quant_inicial INTEGER;
  v_created_at timestamptz;
  v_date_cutoff timestamptz;
  v_sum_entradas INTEGER;
  v_sum_saidas INTEGER;
  v_sum_transf_saida INTEGER;
  v_sum_transf_entrada INTEGER;
  v_maternidade_count INTEGER;
  v_morte_count INTEGER;
  v_quant_atual INTEGER;
BEGIN
  SELECT quant_inicial, quant_base, created_at
  INTO v_quant_inicial_raw, v_quant_base_raw, v_created_at
  FROM lote_categorias
  WHERE lote_id = p_lote_id AND LOWER(categoria) = LOWER(p_categoria)
    AND ativo = true
  LIMIT 1;

  IF v_created_at IS NULL THEN
    RETURN 0;
  END IF;

  -- quant_base (saldo congelado em recategorização in-place) tem precedência
  -- sobre quant_inicial como base de contagem.
  v_quant_inicial_raw := COALESCE(v_quant_base_raw, v_quant_inicial_raw);
  v_quant_inicial := COALESCE(v_quant_inicial_raw, 0);

  IF v_quant_inicial_raw IS NULL THEN
    v_date_cutoff := '1900-01-01'::timestamptz;
  ELSE
    v_date_cutoff := v_created_at;
  END IF;

  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_sum_entradas
  FROM registros_movimentacao
  WHERE lote_origem_id = p_lote_id
    AND LOWER(categoria) = LOWER(p_categoria)
    AND motivo_movimentacao = 'Entrada'
    AND data >= v_date_cutoff
    AND deleted_at IS NULL;

  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_sum_saidas
  FROM registros_movimentacao
  WHERE lote_origem_id = p_lote_id
    AND LOWER(categoria) = LOWER(p_categoria)
    AND (motivo_movimentacao IN ('Consumo', 'Saída') OR (motivo_movimentacao = 'Entrevero' AND lote_destino_id IS NULL))
    AND tipo_saida IS NULL
    AND data >= v_date_cutoff
    AND deleted_at IS NULL;

  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_sum_transf_saida
  FROM registros_movimentacao
  WHERE lote_origem_id = p_lote_id
    AND LOWER(categoria) = LOWER(p_categoria)
    AND (tipo_saida IN ('Transferência', 'Apartação') OR (motivo_movimentacao = 'Entrevero' AND lote_destino_id IS NOT NULL))
    AND data >= v_date_cutoff
    AND deleted_at IS NULL;

  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_sum_transf_entrada
  FROM registros_movimentacao
  WHERE lote_destino_id = p_lote_id
    AND LOWER(categoria) = LOWER(p_categoria)
    AND (tipo_entrada IN ('Transferência', 'Apartação') OR motivo_movimentacao = 'Entrevero' OR (tipo_entrada IS NULL AND lote_destino_id IS NOT NULL))
    AND (subtipo IS NULL OR subtipo <> 'Novo Lote')
    AND data >= v_date_cutoff
    AND deleted_at IS NULL;

  IF LOWER(unaccent(p_categoria)) ILIKE 'bezerro ao pe' THEN
    SELECT COUNT(*) INTO v_maternidade_count
    FROM registros_maternidade
    WHERE lote_id = p_lote_id AND sexo = 'Macho' AND data >= v_date_cutoff AND deleted_at IS NULL;
  ELSIF LOWER(unaccent(p_categoria)) ILIKE 'bezerra ao pe' THEN
    SELECT COUNT(*) INTO v_maternidade_count
    FROM registros_maternidade
    WHERE lote_id = p_lote_id AND sexo = 'Fêmea' AND data >= v_date_cutoff AND deleted_at IS NULL;
  ELSE
    v_maternidade_count := 0;
  END IF;

  SELECT COUNT(*) INTO v_morte_count
  FROM registros_morte
  WHERE lote_id = p_lote_id
    AND LOWER(categoria) = LOWER(p_categoria)
    AND data >= v_date_cutoff
    AND deleted_at IS NULL;

  v_quant_atual := v_quant_inicial + v_sum_entradas - v_sum_saidas - v_sum_transf_saida + v_sum_transf_entrada + v_maternidade_count - v_morte_count;

  IF v_quant_atual < 0 THEN
    v_quant_atual := 0;
  END IF;

  RETURN v_quant_atual;
END;
$function$;

-- =============================================================================
-- recategorizar_lote_categoria: sem reescrita de registros; congela saldo em
-- quant_base = quant_atual - contribuições futuras-contáveis do nome novo
-- =============================================================================

CREATE OR REPLACE FUNCTION public.recategorizar_lote_categoria(p_lote_categoria_origem_id uuid, p_categoria_destino text, p_manter_formulacao boolean DEFAULT true, p_nova_formulacao_id uuid DEFAULT NULL::uuid, p_usuario_id uuid DEFAULT NULL::uuid, p_motivo text DEFAULT 'manual'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_origem RECORD;
  v_lote RECORD;
  v_fazenda_id uuid;
  v_formulacao_anterior_id uuid;
  v_formulacao_id uuid;
  v_novo_gmd numeric;
  v_peso_transicao numeric;
  v_snapshot jsonb;
  v_lote_snapshot jsonb;
  v_gmd_encontrado boolean := false;
  v_categoria_final text;
  v_resid integer;
BEGIN
  -- 1. Carregar lote_categoria atual (deve estar ativa)
  SELECT lc.* INTO v_origem
  FROM public.lote_categorias lc
  WHERE lc.id = p_lote_categoria_origem_id
    AND lc.ativo = true
    AND lc.data_fim IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote_categoria não encontrada ou já encerrada.';
  END IF;

  -- 2. Carregar lote + fazenda
  SELECT l.* INTO v_lote FROM public.lotes l WHERE l.id = v_origem.lote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado.';
  END IF;
  v_fazenda_id := v_lote.fazenda_id;

  -- 3. Peso na transição
  v_peso_transicao := COALESCE(v_origem.peso_vivo_atual_kg_cab, v_origem.peso_entrada_kg_cab);

  -- 4. Snapshot da lote_categoria origem (antes da mudança)
  SELECT to_jsonb(lc.*) INTO v_snapshot
  FROM public.lote_categorias lc
  WHERE lc.id = p_lote_categoria_origem_id;

  -- 4b. Snapshot do lote
  SELECT to_jsonb(l.*) INTO v_lote_snapshot
  FROM public.lotes l
  WHERE l.id = v_origem.lote_id;

  -- 5. Resolver formulação efetiva
  v_formulacao_anterior_id := v_lote.formulacao_id;

  IF p_manter_formulacao OR p_nova_formulacao_id IS NULL THEN
    v_formulacao_id := v_formulacao_anterior_id;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.formulacoes f
      WHERE f.id = p_nova_formulacao_id
        AND f.fazenda_id = v_fazenda_id
        AND f.ativo = true
    ) THEN
      RAISE EXCEPTION 'Formulação de destino inválida, inativa ou de outra fazenda.';
    END IF;
    v_formulacao_id := p_nova_formulacao_id;
  END IF;

  -- 6. Match do GMD da nova categoria na formulação efetiva
  IF v_formulacao_id IS NOT NULL THEN
    SELECT fcg.gmd INTO v_novo_gmd
    FROM public.formulacao_categorias_gmd fcg
    WHERE fcg.formulacao_id = v_formulacao_id
      AND LOWER(TRIM(fcg.categoria)) = LOWER(TRIM(p_categoria_destino))
    LIMIT 1;

    v_gmd_encontrado := FOUND;
  END IF;

  -- 7. Atualizar a categoria in-place
  UPDATE public.lote_categorias
  SET categoria = p_categoria_destino,
      gmd = CASE WHEN v_novo_gmd IS NOT NULL THEN v_novo_gmd::text ELSE NULL END
  WHERE id = p_lote_categoria_origem_id;

  -- 7b. Se trocando formulação, atualizar o lote
  IF v_formulacao_id IS DISTINCT FROM v_formulacao_anterior_id THEN
    UPDATE public.lotes
    SET formulacao_id = v_formulacao_id
    WHERE id = v_origem.lote_id;
  END IF;

  -- 7c. Congelar o saldo como base da categoria vigente.
  --     Registros históricos NÃO são reescritos (compartilham o campo
  --     categoria entre lote origem e destino; renomear corromperia a contagem
  --     do outro lado). quant_base absorve tudo que foi contado sob nomes
  --     antigos; o que já existe sob o nome novo continua contando por cima.
  SELECT categoria INTO v_categoria_final
  FROM public.lote_categorias
  WHERE id = p_lote_categoria_origem_id;

  IF v_categoria_final IS DISTINCT FROM v_origem.categoria THEN
    -- quant_base = 0 torna a base não-NULL e ativa o cutoff created_at;
    -- o recálculo então mede só o que o nome novo ainda vai capturar.
    UPDATE public.lote_categorias
    SET quant_base = 0
    WHERE id = p_lote_categoria_origem_id;

    v_resid := calculate_quant_atual(v_origem.lote_id, v_categoria_final);

    UPDATE public.lote_categorias
    SET quant_base = COALESCE(v_origem.quant_atual, 0) - v_resid,
        quant_atual = COALESCE(v_origem.quant_atual, 0)
    WHERE id = p_lote_categoria_origem_id;
  END IF;

  -- 8. Registrar auditoria da transição
  INSERT INTO public.lote_categorias_transicoes (
    fazenda_id, lote_id, lote_categoria_origem_id, lote_categoria_destino_id,
    categoria_origem, categoria_destino, peso_na_transicao_kg,
    data_transicao, motivo, usuario_id, snapshot_jsonb
  ) VALUES (
    v_fazenda_id,
    v_origem.lote_id,
    p_lote_categoria_origem_id,
    p_lote_categoria_origem_id,
    v_origem.categoria,
    p_categoria_destino,
    v_peso_transicao,
    now(),
    p_motivo,
    p_usuario_id,
    jsonb_build_object(
      'lote_categoria_origem', v_snapshot,
      'lote_origem', v_lote_snapshot,
      'categoria_origem', v_origem.categoria,
      'categoria_destino', p_categoria_destino,
      'formulacao_id', v_formulacao_id,
      'formulacao_anterior_id', v_formulacao_anterior_id,
      'manter_formulacao', p_manter_formulacao,
      'nova_formulacao_id', CASE WHEN p_manter_formulacao THEN NULL ELSE p_nova_formulacao_id END,
      'gmd_novo', v_novo_gmd,
      'gmd_encontrado', v_gmd_encontrado,
      'recategorizacao_inplace', true
    )
  );

  RETURN p_lote_categoria_origem_id;
END;
$function$;
