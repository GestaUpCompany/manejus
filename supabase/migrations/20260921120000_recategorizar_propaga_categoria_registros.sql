-- Fix: recategorização in-place propaga o rename para registros_movimentacao
-- e registros_morte, e recalcula quant_atual sob o novo nome.
--
-- Contexto: recategorizar_lote_categoria renomeia lote_categorias.categoria
-- in-place, mas calculate_quant_atual casa registros por nome de categoria.
-- Após o rename, os registros históricos (que seguem com o nome antigo) deixam
-- de ser contados e o próximo recálculo zera quant_atual. Caso observado em
-- 18/09/2026: apartações garrote -> TIP LOTE 28/29 na fazenda Bom Jesus
-- zeraram após recategorização manual garrote -> boi magro.
--
-- Decisão: reescrever registros com o nome novo. A categoria vigente em cada
-- época continua preservada em lote_categorias_transicoes (categoria_origem,
-- categoria_destino, data_transicao), então o histórico não se perde.
-- Alternativa mais robusta (FK lote_categoria_id + resolução temporal) fica
-- registrada como débito técnico em docs/BACKLOG.md.
--
-- Bound inferior: quando quant_inicial IS NOT NULL, só registros com
-- data >= created_at da linha são reescritos, espelhando o cutoff de
-- calculate_quant_atual e protegendo histórico de linhas encerradas que
-- reutilizaram o mesmo nome. Quando quant_inicial IS NULL (categoria
-- placeholder), o cutoff é 1900 e todos os registros do lote com o nome
-- antigo pertencem a esta linhagem, então todos são reescritos.

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

  -- 7c. Propagar o rename para registros históricos do lote
  --     Usa o valor efetivamente gravado na linha (trg_normalize_categoria_lowercase
  --     pode ter normalizado p_categoria_destino).
  SELECT categoria INTO v_categoria_final
  FROM public.lote_categorias
  WHERE id = p_lote_categoria_origem_id;

  IF v_categoria_final IS DISTINCT FROM v_origem.categoria THEN
    UPDATE public.registros_movimentacao
    SET categoria = v_categoria_final
    WHERE LOWER(categoria) = LOWER(v_origem.categoria)
      AND (lote_origem_id = v_origem.lote_id OR lote_destino_id = v_origem.lote_id)
      AND (v_origem.quant_inicial IS NULL OR data >= v_origem.created_at)
      AND deleted_at IS NULL;

    UPDATE public.registros_morte
    SET categoria = v_categoria_final
    WHERE lote_id = v_origem.lote_id
      AND LOWER(categoria) = LOWER(v_origem.categoria)
      AND (v_origem.quant_inicial IS NULL OR data >= v_origem.created_at)
      AND deleted_at IS NULL;

    -- 7d. Recalcular quant_atual já sob o novo nome, sem esperar o cron
    UPDATE public.lote_categorias
    SET quant_atual = calculate_quant_atual(v_origem.lote_id, v_categoria_final)
    WHERE id = p_lote_categoria_origem_id;
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
