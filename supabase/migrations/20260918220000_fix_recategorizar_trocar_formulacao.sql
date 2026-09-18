-- ============================================================================
-- FIX: recategorizar_lote_categoria ignorava p_manter_formulacao e
-- p_nova_formulacao_id
-- ============================================================================
-- Problema: a Migration G manteve os parâmetros na assinatura mas o corpo da
-- função sempre usava lotes.formulacao_id para buscar o GMD e nunca
-- atualizava a formulação do lote. A opção "Trocar formulação" da UI era
-- ignorada silenciosamente (demonstrado em teste na fazenda Gesta'Up).
--
-- Correção:
-- - Se p_manter_formulacao = false e p_nova_formulacao_id informado:
--   * valida que a formulação existe, está ativa e pertence à mesma fazenda
--   * usa essa formulação no lookup do GMD da categoria destino
--   * atualiza lotes.formulacao_id
-- - Snapshot passa a registrar manter_formulacao, nova_formulacao_id e
--   formulacao_anterior_id.
-- - Se p_manter_formulacao = true, p_nova_formulacao_id é ignorado
--   (comportamento anterior preservado).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recategorizar_lote_categoria(
  p_lote_categoria_origem_id uuid,
  p_categoria_destino text,
  p_manter_formulacao boolean DEFAULT true,
  p_nova_formulacao_id uuid DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_motivo text DEFAULT 'manual'
)
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
    -- Validar que a nova formulação existe, está ativa e é da mesma fazenda
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
  --    Se GMD não encontrado, gmd fica NULL (categoria para de evoluir)
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

  -- 8. Registrar auditoria da transição
  --    lote_categoria_origem_id = lote_categoria_destino_id (mesma linha,
  --    pois não criamos nova lote_categorias)
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

  -- 9. Retornar o mesmo ID (não criamos nova linha)
  RETURN p_lote_categoria_origem_id;
END;
$function$;
