-- ============================================================================
-- Atribuição de dieta (plano nutricional) em massa a vários lotes
-- ============================================================================
-- Uma chamada cria o plano na fila de cada lote e, conforme o modo escolhido
-- por lote, inicia ou migra (reaproveitando iniciar_plano_lote e
-- migrar_plano_lote, que já tratam GMD, desconto de enfermaria e snapshots).
-- Depois grava a personalização por categoria (período e peso meta) em:
--   1) plano_categoria_personalizacao (lida por cron, notificações e PWA);
--   2) lote_categorias.peso_vivo_meta_kg_cab (lida pelo relatório zootécnico);
--   3) snapshot de entrada recém-criado (lido pelo PDF de planos).
-- iniciar_plano_lote sobrescreve a personalização com os valores do plano, por
-- isso a personalização é gravada DEPOIS dele.
-- peso_inicio_kg_cab: migrar_plano_lote cria a personalização sem esse campo;
-- aqui ele é preenchido com o peso atual da categoria quando estiver nulo.
-- Cada lote roda em sub-bloco próprio: falha de um não desfaz os demais.
-- Modo 'enfileirar' não aceita personalização por categoria (a personalização
-- nasce quando o plano é iniciado/migrado).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.atribuir_plano_em_massa(
  p_fazenda_id uuid,
  p_formulacao_id uuid,
  p_itens jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item jsonb;
  v_cat jsonb;
  v_resultados jsonb := '[]'::jsonb;
  v_lote_id uuid;
  v_modo text;
  v_nome text;
  v_periodo integer;
  v_peso_meta numeric;
  v_retroativo boolean;
  v_plano_id uuid;
  v_ordem integer;
  v_lote RECORD;
  v_vigente_id uuid;
  v_sem_peso text;
  v_cat_id uuid;
  v_cat_periodo integer;
  v_cat_meta numeric;
  v_peso_atual numeric;
BEGIN
  PERFORM public.guard_w_fazenda(p_fazenda_id);

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'Nenhum lote informado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.formulacoes f
    WHERE f.id = p_formulacao_id
      AND f.fazenda_id = p_fazenda_id
      AND f.ativo = true
      AND COALESCE(f.e_premix, false) = false
      AND COALESCE(f.e_creep, false) = false
  ) THEN
    RAISE EXCEPTION 'Formulação inválida, inativa, creep/premix ou de outra fazenda';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_lote_id := NULL;
    BEGIN
      v_lote_id := (v_item->>'lote_id')::uuid;
      v_modo := v_item->>'modo';
      v_nome := NULLIF(btrim(v_item->>'nome'), '');
      v_periodo := (v_item->>'periodo_dias')::integer;
      v_peso_meta := (v_item->>'peso_meta_kg')::numeric;
      v_retroativo := COALESCE((v_item->>'retroativo')::boolean, false);

      IF v_modo NOT IN ('iniciar', 'migrar', 'enfileirar') THEN
        RAISE EXCEPTION 'Modo inválido: %', v_modo;
      END IF;
      IF v_nome IS NULL THEN RAISE EXCEPTION 'Nome do plano é obrigatório'; END IF;
      IF v_periodo IS NULL OR v_periodo <= 0 THEN RAISE EXCEPTION 'Período deve ser maior que zero'; END IF;
      IF v_peso_meta IS NULL OR v_peso_meta <= 0 THEN RAISE EXCEPTION 'Peso meta deve ser maior que zero'; END IF;
      IF v_modo = 'enfileirar' AND jsonb_array_length(COALESCE(v_item->'categorias', '[]'::jsonb)) > 0 THEN
        RAISE EXCEPTION 'Personalização por categoria só vale ao iniciar ou migrar o plano';
      END IF;

      SELECT * INTO v_lote FROM public.lotes WHERE id = v_lote_id AND fazenda_id = p_fazenda_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Lote não encontrado nesta fazenda'; END IF;
      PERFORM public.guard_w_lote(v_lote_id);

      SELECT id INTO v_vigente_id FROM public.planos_nutricionais
      WHERE lote_id = v_lote_id AND ativo = true AND data_fim IS NULL
      LIMIT 1;

      IF v_modo = 'migrar' AND v_vigente_id IS NULL THEN
        RAISE EXCEPTION 'Lote sem plano vigente para migrar';
      END IF;
      IF v_modo = 'iniciar' AND v_vigente_id IS NOT NULL THEN
        RAISE EXCEPTION 'Lote já tem plano vigente; use migrar';
      END IF;

      IF v_modo IN ('iniciar', 'migrar') THEN
        SELECT string_agg(lc.categoria, ', ') INTO v_sem_peso
        FROM public.lote_categorias lc
        WHERE lc.lote_id = v_lote_id AND lc.ativo = true AND lc.data_fim IS NULL
          AND LOWER(unaccent(lc.categoria)) NOT ILIKE 'bezerro ao pe'
          AND LOWER(unaccent(lc.categoria)) NOT ILIKE 'bezerra ao pe'
          AND (lc.peso_vivo_atual_kg_cab IS NULL OR lc.peso_vivo_atual_kg_cab <= 0);
        IF v_sem_peso IS NOT NULL THEN
          RAISE EXCEPTION 'Categorias sem peso vivo atual: %', v_sem_peso;
        END IF;
      END IF;

      SELECT COALESCE(MAX(ordem), -1) + 1 INTO v_ordem
      FROM public.planos_nutricionais WHERE lote_id = v_lote_id;

      INSERT INTO public.planos_nutricionais
        (lote_id, fazenda_id, nome, formulacao_id, periodo_dias, peso_meta_kg, ordem, ativo, data_inicio)
      VALUES
        (v_lote_id, p_fazenda_id, v_nome, p_formulacao_id, v_periodo, v_peso_meta, v_ordem, false, NULL)
      RETURNING id INTO v_plano_id;

      IF v_modo = 'iniciar' THEN
        PERFORM public.iniciar_plano_lote(v_lote_id, v_plano_id, v_retroativo);
      ELSIF v_modo = 'migrar' THEN
        PERFORM public.migrar_plano_lote(v_lote_id, v_plano_id, 'atribuicao_em_massa');
      END IF;

      IF v_modo IN ('iniciar', 'migrar') THEN
        -- Personalização por categoria (depois de iniciar/migrar, que a sobrescrevem)
        FOR v_cat IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'categorias', '[]'::jsonb))
        LOOP
          v_cat_id := (v_cat->>'lote_categoria_id')::uuid;
          v_cat_periodo := COALESCE((v_cat->>'periodo_dias')::integer, v_periodo);
          v_cat_meta := COALESCE((v_cat->>'peso_meta_kg')::numeric, v_peso_meta);
          IF v_cat_periodo <= 0 OR v_cat_meta <= 0 THEN
            RAISE EXCEPTION 'Período e peso meta da categoria devem ser maiores que zero';
          END IF;

          SELECT lc.peso_vivo_atual_kg_cab INTO v_peso_atual
          FROM public.lote_categorias lc
          WHERE lc.id = v_cat_id AND lc.lote_id = v_lote_id
            AND lc.ativo = true AND lc.data_fim IS NULL
            AND LOWER(unaccent(lc.categoria)) NOT ILIKE 'bezerro ao pe'
            AND LOWER(unaccent(lc.categoria)) NOT ILIKE 'bezerra ao pe';
          IF NOT FOUND THEN
            RAISE EXCEPTION 'Categoria % não pertence ao lote ou não aceita plano', v_cat_id;
          END IF;

          INSERT INTO public.plano_categoria_personalizacao
            (plano_id, lote_categoria_id, periodo_dias, peso_meta_kg, peso_inicio_kg_cab, ativo)
          VALUES (v_plano_id, v_cat_id, v_cat_periodo, v_cat_meta, v_peso_atual, true)
          ON CONFLICT (plano_id, lote_categoria_id) DO UPDATE
          SET periodo_dias = EXCLUDED.periodo_dias,
              peso_meta_kg = EXCLUDED.peso_meta_kg,
              peso_inicio_kg_cab = COALESCE(public.plano_categoria_personalizacao.peso_inicio_kg_cab, EXCLUDED.peso_inicio_kg_cab),
              ativo = true;

          UPDATE public.lote_categorias
          SET peso_vivo_meta_kg_cab = v_cat_meta
          WHERE id = v_cat_id;

          UPDATE public.planos_nutricionais_snapshots
          SET snapshot = jsonb_set(snapshot, '{peso_vivo_meta_kg_cab}', to_jsonb(v_cat_meta)),
              metricas_derivadas = jsonb_set(
                metricas_derivadas, '{progresso_meta_percent}',
                to_jsonb((COALESCE(v_peso_atual, 0) / v_cat_meta) * 100)
              )
          WHERE plano_nutricional_id = v_plano_id
            AND lote_categoria_id = v_cat_id
            AND tipo_snapshot = 'entrada';
        END LOOP;

        -- peso_inicio_kg_cab nulo (migrar_plano_lote não preenche) nas demais categorias
        UPDATE public.plano_categoria_personalizacao pcp
        SET peso_inicio_kg_cab = lc.peso_vivo_atual_kg_cab
        FROM public.lote_categorias lc
        WHERE pcp.plano_id = v_plano_id
          AND pcp.lote_categoria_id = lc.id
          AND pcp.peso_inicio_kg_cab IS NULL;
      END IF;

      v_resultados := v_resultados || jsonb_build_object(
        'lote_id', v_lote_id, 'ok', true, 'plano_id', v_plano_id, 'erro', NULL);
    EXCEPTION WHEN OTHERS THEN
      v_resultados := v_resultados || jsonb_build_object(
        'lote_id', v_lote_id, 'ok', false, 'plano_id', NULL, 'erro', SQLERRM);
    END;
  END LOOP;

  RETURN v_resultados;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.atribuir_plano_em_massa(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atribuir_plano_em_massa(uuid, uuid, jsonb) TO authenticated;
