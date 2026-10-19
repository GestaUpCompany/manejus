-- Rollback de 20261019130000_alinhar_fluxo_individual_plano.sql
-- Restaura encerrar_plano_lote, migrar_plano_lote e atribuir_plano_em_massa
-- como estavam antes e remove os helpers novos.

CREATE OR REPLACE FUNCTION public.encerrar_plano_lote(p_lote_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plano RECORD; v_proximo_plano RECORD; v_lote RECORD; v_fazenda_id uuid; v_cat RECORD;
  v_snapshot jsonb; v_metricas jsonb; v_duracao integer; v_ganho_peso numeric;
  v_gmd_realizado numeric; v_gmd_planejado numeric; v_prod_arroba_lote numeric;
  v_mortalidade numeric; v_peso_inicio numeric; v_rc_inicio numeric;
  v_peso_atual numeric; v_rc_atual numeric; v_quant_atual integer;
  v_quant_inicial integer; v_morte integer; v_gmd_proximo numeric; v_form_proximo RECORD;
BEGIN
  PERFORM public.guard_w_lote(p_lote_id);
  SELECT * INTO v_lote FROM public.lotes WHERE id = p_lote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote nao encontrado'; END IF;
  v_fazenda_id := v_lote.fazenda_id;

  SELECT * INTO v_plano FROM public.planos_nutricionais WHERE lote_id = p_lote_id AND ativo = true AND data_fim IS NULL LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nenhum plano vigente encontrado para este lote'; END IF;

  FOR v_cat IN SELECT * FROM public.lote_categorias
    WHERE lote_id = p_lote_id AND ativo = true AND data_fim IS NULL
      AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerro ao pe'
      AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerra ao pe'
  LOOP
    SELECT to_jsonb(lc.*) INTO v_snapshot FROM public.lote_categorias lc WHERE lc.id = v_cat.id;
    SELECT COALESCE(lc.peso_vivo_atual_kg_cab, 0), COALESCE(lc.rc_final, 0), COALESCE(lc.quant_atual, 0), COALESCE(lc.quant_inicial, 0), COALESCE(lc.morte, 0)
    INTO v_peso_atual, v_rc_atual, v_quant_atual, v_quant_inicial, v_morte
    FROM public.lote_categorias lc WHERE lc.id = v_cat.id;

    v_peso_inicio := COALESCE(v_plano.peso_inicio_kg_cab, v_cat.peso_entrada_kg_cab, 0);
    v_rc_inicio := COALESCE(v_plano.rc_inicio, v_cat.rc_inicial, 0);
    v_duracao := COALESCE((CURRENT_DATE - v_plano.data_inicio)::integer, 0);

    SELECT fcg.gmd INTO v_gmd_planejado FROM public.formulacao_categorias_gmd fcg
    WHERE fcg.formulacao_id = v_plano.formulacao_id AND LOWER(TRIM(fcg.categoria)) = LOWER(TRIM(v_cat.categoria));
    IF NOT FOUND THEN v_gmd_planejado := NULL; END IF;

    v_ganho_peso := v_peso_atual - v_peso_inicio;
    IF v_ganho_peso > 0 AND v_duracao > 0 THEN v_gmd_realizado := v_ganho_peso / v_duracao; ELSE v_gmd_realizado := 0; END IF;
    IF v_quant_inicial > 0 THEN v_mortalidade := (v_morte::numeric / v_quant_inicial) * 100; ELSE v_mortalidade := 0; END IF;
    IF v_rc_atual > 0 AND v_quant_atual > 0 THEN v_prod_arroba_lote := ((v_peso_atual * (v_rc_atual / 100)) / 15) * v_quant_atual; ELSE v_prod_arroba_lote := 0; END IF;

    SELECT jsonb_build_object(
      'progresso_meta_percent', CASE WHEN COALESCE(v_plano.peso_meta_kg, 0) > 0 THEN (v_peso_atual / v_plano.peso_meta_kg) * 100 ELSE 0 END,
      'ganho_arroba_cab', CASE WHEN v_rc_atual > 0 AND v_rc_inicio > 0 THEN ((v_peso_atual * (v_rc_atual / 100)) / 15) - ((v_peso_inicio * (v_rc_inicio / 100)) / 15) ELSE 0 END,
      'peso_vivo_medio_lote', v_peso_atual, 'peso_inicial_kg_cab', v_peso_inicio,
      'rc_inicio', v_rc_inicio, 'rc_atual', v_rc_atual,
      'quant_inicial', v_quant_inicial, 'quant_atual', v_quant_atual, 'morte', v_morte
    ) INTO v_metricas FROM public.lote_categorias lc WHERE lc.id = v_cat.id;

    INSERT INTO public.planos_nutricionais_snapshots
      (plano_nutricional_id, lote_categoria_id, fazenda_id, snapshot, metricas_derivadas, duracao_dias, ganho_peso_total_kg_cab, gmd_realizado, gmd_planejado, producao_arroba_lote, mortalidade_percent, motivo_migracao, plano_anterior_id, plano_posterior_id, tipo_snapshot)
    VALUES (v_plano.id, v_cat.id, v_fazenda_id, v_snapshot, v_metricas, v_duracao, v_ganho_peso, v_gmd_realizado, v_gmd_planejado, v_prod_arroba_lote, v_mortalidade, 'encerramento_lote', v_plano.id, NULL, 'saida');

    UPDATE public.lote_categorias SET formulacao_id = NULL, estrategia_nutricional = NULL, peso_vivo_meta_kg_cab = NULL, gmd = NULL, consumo_meta_porcentagem_pesovivo = NULL WHERE id = v_cat.id;
  END LOOP;

  UPDATE public.planos_nutricionais SET ativo = false, data_fim = CURRENT_DATE WHERE id = v_plano.id;
  UPDATE public.plano_categoria_personalizacao SET ativo = false WHERE plano_id = v_plano.id;

  SELECT * INTO v_proximo_plano FROM public.planos_nutricionais
  WHERE lote_id = p_lote_id AND ordem > v_plano.ordem AND data_inicio IS NULL AND data_fim IS NULL ORDER BY ordem ASC LIMIT 1;

  IF FOUND THEN
    UPDATE public.planos_nutricionais SET ativo = true, data_inicio = CURRENT_DATE, data_fim = NULL WHERE id = v_proximo_plano.id;
    UPDATE public.lotes SET formulacao_id = v_proximo_plano.formulacao_id WHERE id = p_lote_id;
    SELECT * INTO v_form_proximo FROM public.formulacoes WHERE id = v_proximo_plano.formulacao_id;

    FOR v_cat IN SELECT * FROM public.lote_categorias
      WHERE lote_id = p_lote_id AND ativo = true AND data_fim IS NULL
        AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerro ao pe'
        AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerra ao pe'
    LOOP
      SELECT fcg.gmd INTO v_gmd_proximo FROM public.formulacao_categorias_gmd fcg
      WHERE fcg.formulacao_id = v_proximo_plano.formulacao_id AND LOWER(TRIM(fcg.categoria)) = LOWER(TRIM(v_cat.categoria));
      IF NOT FOUND THEN v_gmd_proximo := NULL; END IF;

      IF v_gmd_proximo IS NOT NULL AND v_lote.destino = 'enfermaria' THEN
        v_gmd_proximo := v_gmd_proximo * 0.5;
      END IF;

      UPDATE public.lote_categorias
      SET formulacao_id = v_proximo_plano.formulacao_id, estrategia_nutricional = v_form_proximo.nome,
          peso_vivo_meta_kg_cab = v_proximo_plano.peso_meta_kg,
          gmd = CASE WHEN v_gmd_proximo IS NOT NULL THEN v_gmd_proximo::text ELSE NULL END,
          consumo_meta_porcentagem_pesovivo = v_form_proximo.consumo_ms_percent_pv
      WHERE id = v_cat.id;

      INSERT INTO public.plano_categoria_personalizacao (plano_id, lote_categoria_id, periodo_dias, peso_meta_kg, ativo)
      VALUES (v_proximo_plano.id, v_cat.id, v_proximo_plano.periodo_dias, v_proximo_plano.peso_meta_kg, true)
      ON CONFLICT (plano_id, lote_categoria_id) DO UPDATE SET ativo = true;

      PERFORM public.criar_snapshot_entrada(v_proximo_plano.id, v_cat.id, 'migracao_lote');
    END LOOP;
  ELSE
    UPDATE public.lotes SET formulacao_id = NULL WHERE id = p_lote_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.migrar_plano_lote(p_lote_id uuid, p_plano_destino_id uuid, p_motivo text DEFAULT 'manual'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plano_atual RECORD;
  v_plano_destino RECORD;
  v_lote RECORD;
  v_fazenda_id uuid;
  v_cat RECORD;
  v_gmd_proximo numeric;
  v_form_proximo RECORD;
BEGIN
  PERFORM public.guard_w_lote(p_lote_id);
  SELECT * INTO v_lote FROM public.lotes WHERE id = p_lote_id;
  v_fazenda_id := v_lote.fazenda_id;

  SELECT * INTO v_plano_atual FROM public.planos_nutricionais
  WHERE lote_id = p_lote_id AND ativo = true AND data_fim IS NULL LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nenhum plano vigente encontrado para este lote'; END IF;

  SELECT * INTO v_plano_destino FROM public.planos_nutricionais
  WHERE id = p_plano_destino_id AND lote_id = p_lote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plano destino nao encontrado para este lote'; END IF;
  IF v_plano_destino.data_fim IS NOT NULL THEN RAISE EXCEPTION 'Nao e possivel migrar para um plano ja encerrado'; END IF;

  PERFORM public.encerrar_plano_lote(p_lote_id);

  IF v_plano_destino.id != (SELECT id FROM public.planos_nutricionais WHERE lote_id = p_lote_id AND ativo = true AND data_fim IS NULL LIMIT 1) THEN
    UPDATE public.planos_nutricionais SET ativo = false, data_inicio = NULL WHERE lote_id = p_lote_id AND ativo = true AND id != v_plano_destino.id;
    UPDATE public.planos_nutricionais SET ativo = true, data_inicio = CURRENT_DATE, data_fim = NULL WHERE id = v_plano_destino.id;
    UPDATE public.lotes SET formulacao_id = v_plano_destino.formulacao_id WHERE id = p_lote_id;
    SELECT * INTO v_form_proximo FROM public.formulacoes WHERE id = v_plano_destino.formulacao_id;

    FOR v_cat IN SELECT * FROM public.lote_categorias
      WHERE lote_id = p_lote_id AND ativo = true AND data_fim IS NULL
        AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerro ao pe'
        AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerra ao pe'
    LOOP
      SELECT fcg.gmd INTO v_gmd_proximo FROM public.formulacao_categorias_gmd fcg
      WHERE fcg.formulacao_id = v_plano_destino.formulacao_id AND LOWER(TRIM(fcg.categoria)) = LOWER(TRIM(v_cat.categoria));
      IF NOT FOUND THEN v_gmd_proximo := NULL; END IF;

      IF v_gmd_proximo IS NOT NULL AND v_lote.destino = 'enfermaria' THEN
        v_gmd_proximo := v_gmd_proximo * 0.5;
      END IF;

      UPDATE public.lote_categorias
      SET formulacao_id = v_plano_destino.formulacao_id,
          estrategia_nutricional = v_form_proximo.nome,
          peso_vivo_meta_kg_cab = v_plano_destino.peso_meta_kg,
          gmd = CASE WHEN v_gmd_proximo IS NOT NULL THEN v_gmd_proximo::text ELSE NULL END,
          consumo_meta_porcentagem_pesovivo = v_form_proximo.consumo_ms_percent_pv
      WHERE id = v_cat.id;

      INSERT INTO public.plano_categoria_personalizacao (plano_id, lote_categoria_id, periodo_dias, peso_meta_kg, ativo)
      VALUES (v_plano_destino.id, v_cat.id, v_plano_destino.periodo_dias, v_plano_destino.peso_meta_kg, true)
      ON CONFLICT (plano_id, lote_categoria_id) DO UPDATE SET ativo = true;
    END LOOP;
  END IF;
END;
$function$;

-- Versao anterior de atribuir_plano_em_massa (20261019120000)
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

-- Remove as funcoes novas (depois de restaurar as antigas acima)
DROP FUNCTION IF EXISTS public.salvar_personalizacao_categoria(uuid, uuid, uuid, integer, numeric);
DROP FUNCTION IF EXISTS public._aplicar_personalizacao_categoria(uuid, uuid, integer, numeric);
DROP FUNCTION IF EXISTS public._encerrar_plano_lote(uuid, uuid);
DROP FUNCTION IF EXISTS public._ativar_plano_nas_categorias(uuid, uuid, text);
