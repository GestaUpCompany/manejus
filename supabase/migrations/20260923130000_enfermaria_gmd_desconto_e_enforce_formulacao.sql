-- ============================================================================
-- 1) Desconto de enfermaria (50%) no GMD gravado em lote_categorias
-- 2) Trigger defensiva: lotes.formulacao_id sempre igual ao plano vigente
-- ============================================================================
-- Contexto: as triggers sync_gmd_lote_categorias e repropagar_gmd_para_lotes
-- aplicam gmd * 0.5 quando lotes.destino = 'enfermaria', mas as RPCs de plano
-- gravavam o GMD cheio direto em lote_categorias (e, por rodarem depois do
-- UPDATE em planos_nutricionais que dispara a cadeia de triggers, sobrescreviam
-- o valor correto). Observado em produção: Lote 147 (Marcon, enfermaria) ficou
-- com gmd 0.700 em vez de 0.350 até o backfill de 2026-09-23.
--
-- A trigger defensiva em lotes fecha o vetor de escrita direta fora dos fluxos
-- de plano (SQL manual, dashboard, código futuro): qualquer UPDATE que tente
-- gravar formulacao_id divergente do plano vigente é revertido para o vigente.
-- Quando não há plano vigente, o valor escrito é preservado (lotes sem plano
-- podem carregar formulação informativa). Recategorização que troque a
-- formulação enquanto existir plano vigente terá a escrita no lote revertida
-- para a formulação do plano, mantendo a invariante "plano vigente é a fonte".
-- ============================================================================

-- --------------------------------------------------------------------------
-- iniciar_plano_lote: aplica desconto de enfermaria no GMD propagado
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iniciar_plano_lote(p_lote_id uuid, p_plano_id uuid DEFAULT NULL::uuid, p_retroativo boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plano RECORD;
  v_lote RECORD;
  v_fazenda_id uuid;
  v_cat RECORD;
  v_gmd numeric;
  v_form RECORD;
  v_data_inicio_plano date;
  v_peso_inicio numeric;
  v_peso_projetado numeric;
  v_dias integer;
  v_data_cat date;
BEGIN
  SELECT * INTO v_lote FROM public.lotes WHERE id = p_lote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote nao encontrado'; END IF;
  v_fazenda_id := v_lote.fazenda_id;

  IF p_plano_id IS NULL THEN
    SELECT * INTO v_plano FROM public.planos_nutricionais
      WHERE lote_id = p_lote_id AND data_fim IS NULL AND data_inicio IS NULL
      ORDER BY ordem ASC LIMIT 1;
  ELSE
    SELECT * INTO v_plano FROM public.planos_nutricionais
      WHERE id = p_plano_id AND lote_id = p_lote_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nenhum plano disponivel para iniciar'; END IF;

  IF p_retroativo THEN
    SELECT MIN(data_pesagem) INTO v_data_inicio_plano
    FROM public.lote_categorias
    WHERE lote_id = p_lote_id AND ativo = true AND data_fim IS NULL
      AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerro ao pe'
      AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerra ao pe'
      AND data_pesagem IS NOT NULL;
    v_data_inicio_plano := COALESCE(v_data_inicio_plano, CURRENT_DATE);
  ELSE
    v_data_inicio_plano := CURRENT_DATE;
  END IF;

  UPDATE public.planos_nutricionais
  SET ativo = true, data_inicio = v_data_inicio_plano, data_fim = NULL
  WHERE id = v_plano.id;

  UPDATE public.lotes SET formulacao_id = v_plano.formulacao_id WHERE id = p_lote_id;
  SELECT * INTO v_form FROM public.formulacoes WHERE id = v_plano.formulacao_id;

  FOR v_cat IN SELECT * FROM public.lote_categorias
    WHERE lote_id = p_lote_id AND ativo = true AND data_fim IS NULL
      AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerro ao pe'
      AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerra ao pe'
  LOOP
    SELECT fcg.gmd INTO v_gmd FROM public.formulacao_categorias_gmd fcg
    WHERE fcg.formulacao_id = v_plano.formulacao_id
      AND LOWER(TRIM(fcg.categoria)) = LOWER(TRIM(v_cat.categoria));
    IF NOT FOUND THEN v_gmd := NULL; END IF;

    IF v_gmd IS NOT NULL AND v_lote.destino = 'enfermaria' THEN
      v_gmd := v_gmd * 0.5;
    END IF;

    IF p_retroativo THEN
      v_data_cat := v_cat.data_pesagem;
      v_peso_inicio := v_cat.peso_entrada_kg_cab;
      IF v_gmd IS NOT NULL AND v_peso_inicio IS NOT NULL AND v_data_cat IS NOT NULL THEN
        v_dias := GREATEST((CURRENT_DATE - v_data_cat)::integer, 0);
        v_peso_projetado := v_peso_inicio + (v_gmd * v_dias);
      ELSE
        v_peso_projetado := v_cat.peso_vivo_atual_kg_cab;
        v_peso_inicio := v_cat.peso_vivo_atual_kg_cab;
      END IF;
    ELSE
      v_peso_inicio := v_cat.peso_vivo_atual_kg_cab;
      v_peso_projetado := v_cat.peso_vivo_atual_kg_cab;
    END IF;

    UPDATE public.lote_categorias
    SET formulacao_id = v_plano.formulacao_id,
        estrategia_nutricional = v_form.nome,
        peso_vivo_meta_kg_cab = v_plano.peso_meta_kg,
        gmd = CASE WHEN v_gmd IS NOT NULL THEN v_gmd::text ELSE NULL END,
        consumo_meta_porcentagem_pesovivo = v_form.consumo_ms_percent_pv,
        peso_vivo_atual_kg_cab = v_peso_projetado,
        data_ajuste_peso = CASE
          WHEN p_retroativo AND (v_cat.data_pesagem IS NULL OR v_cat.peso_entrada_kg_cab IS NULL OR v_gmd IS NULL) THEN CURRENT_DATE
          ELSE NULL
        END,
        data_notificacao_meta = NULL,
        data_notificacao_periodo = NULL
    WHERE id = v_cat.id;

    INSERT INTO public.plano_categoria_personalizacao
      (plano_id, lote_categoria_id, periodo_dias, peso_meta_kg, peso_inicio_kg_cab, ativo)
    VALUES (v_plano.id, v_cat.id, v_plano.periodo_dias, v_plano.peso_meta_kg, v_peso_inicio, true)
    ON CONFLICT (plano_id, lote_categoria_id) DO UPDATE
    SET ativo = true,
        peso_inicio_kg_cab = EXCLUDED.peso_inicio_kg_cab,
        periodo_dias = EXCLUDED.periodo_dias,
        peso_meta_kg = EXCLUDED.peso_meta_kg;

    PERFORM public.criar_snapshot_entrada(
      v_plano.id,
      v_cat.id,
      CASE WHEN p_retroativo THEN 'inicio_lote_retroativo' ELSE 'inicio_lote' END
    );
  END LOOP;
END;
$function$;

-- --------------------------------------------------------------------------
-- encerrar_plano_lote: aplica desconto de enfermaria no GMD do próximo plano
-- --------------------------------------------------------------------------
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

-- --------------------------------------------------------------------------
-- migrar_plano_lote: aplica desconto de enfermaria no GMD do plano destino
-- --------------------------------------------------------------------------
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

-- --------------------------------------------------------------------------
-- recategorizar_lote_categoria: aplica desconto de enfermaria no GMD da nova
-- categoria
-- --------------------------------------------------------------------------
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

  IF v_novo_gmd IS NOT NULL AND v_lote.destino = 'enfermaria' THEN
    v_novo_gmd := v_novo_gmd * 0.5;
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

-- --------------------------------------------------------------------------
-- migrar_plano_nutricional (nível categoria): aplica desconto de enfermaria
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.migrar_plano_nutricional(p_lote_categoria_id uuid, p_plano_destino_id uuid DEFAULT NULL::uuid, p_motivo text DEFAULT 'manual'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plano_atual RECORD;
  v_proximo_plano RECORD;
  v_snapshot jsonb;
  v_metricas jsonb;
  v_duracao integer;
  v_ganho_peso numeric;
  v_gmd_realizado numeric;
  v_gmd_planejado numeric;
  v_prod_arroba_lote numeric;
  v_mortalidade numeric;
  v_lote_id uuid;
  v_fazenda_id uuid;
  v_categoria text;
  v_destino text;
BEGIN
  SELECT * INTO v_plano_atual
  FROM public.planos_nutricionais
  WHERE lote_categoria_id = p_lote_categoria_id
    AND ativo = true
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO v_plano_atual
    FROM public.planos_nutricionais
    WHERE lote_categoria_id = p_lote_categoria_id
    ORDER BY ordem ASC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Nenhum plano nutricional encontrado para esta categoria';
    END IF;

    UPDATE public.planos_nutricionais
    SET ativo = true, data_inicio = CURRENT_DATE
    WHERE id = v_plano_atual.id;
  END IF;

  IF p_plano_destino_id IS NOT NULL THEN
    SELECT * INTO v_proximo_plano
    FROM public.planos_nutricionais
    WHERE id = p_plano_destino_id
      AND lote_categoria_id = p_lote_categoria_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Plano destino não encontrado para esta categoria';
    END IF;
  ELSE
    SELECT * INTO v_proximo_plano
    FROM public.planos_nutricionais
    WHERE lote_categoria_id = p_lote_categoria_id
      AND ordem > v_plano_atual.ordem
      AND data_inicio IS NULL
    ORDER BY ordem ASC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Não há próximo plano para migração automática';
    END IF;
  END IF;

  IF v_plano_atual.id = v_proximo_plano.id THEN
    RAISE EXCEPTION 'O plano destino é o mesmo que o plano vigente';
  END IF;

  SELECT to_jsonb(lc.*) INTO v_snapshot
  FROM public.lote_categorias lc
  WHERE lc.id = p_lote_categoria_id;

  SELECT lc.lote_id, lc.categoria INTO v_lote_id, v_categoria
  FROM public.lote_categorias lc
  WHERE lc.id = p_lote_categoria_id;

  SELECT fazenda_id, destino INTO v_fazenda_id, v_destino
  FROM public.lotes
  WHERE id = v_lote_id;

  v_duracao := COALESCE((CURRENT_DATE - v_plano_atual.data_inicio)::integer, 0);

  SELECT f.gmd INTO v_gmd_planejado
  FROM public.formulacoes f
  WHERE f.id = v_plano_atual.formulacao_id;

  SELECT
    COALESCE(lc.peso_vivo_atual_kg_cab - lc.peso_entrada_kg_cab, 0),
    CASE
      WHEN COALESCE(lc.peso_vivo_atual_kg_cab - lc.peso_entrada_kg_cab, 0) > 0 AND v_duracao > 0
        THEN (lc.peso_vivo_atual_kg_cab - lc.peso_entrada_kg_cab) / v_duracao
      ELSE 0
    END,
    CASE
      WHEN COALESCE(lc.quant_inicial, 0) > 0
        THEN (COALESCE(lc.morte, 0)::numeric / lc.quant_inicial) * 100
      ELSE 0
    END,
    CASE
      WHEN COALESCE(lc.rc_atual, 0) > 0 AND COALESCE(lc.quant_atual, 0) > 0
        THEN ((lc.peso_vivo_atual_kg_cab * (lc.rc_atual / 100)) / 15) * lc.quant_atual
      ELSE 0
    END
  INTO v_ganho_peso, v_gmd_realizado, v_mortalidade, v_prod_arroba_lote
  FROM public.lote_categorias lc
  WHERE lc.id = p_lote_categoria_id;

  SELECT jsonb_build_object(
    'custo_operacional_total_cab', COALESCE(lc.custo_operacional_reais_cab_dia, 0) * v_duracao,
    'custo_total_producao_cab', COALESCE(lc.custo_total_entrada_reais_cab, 0) + (COALESCE(lc.custo_operacional_reais_cab_dia, 0) * v_duracao),
    'progresso_meta_percent', CASE
      WHEN COALESCE(lc.peso_vivo_meta_kg_cab, 0) > 0
        THEN (lc.peso_vivo_atual_kg_cab / lc.peso_vivo_meta_kg_cab) * 100
      ELSE 0
    END,
    'ganho_arroba_cab', CASE
      WHEN COALESCE(lc.rc_atual, 0) > 0 AND COALESCE(lc.rc_inicial, 0) > 0
        THEN ((lc.peso_vivo_atual_kg_cab * (lc.rc_atual / 100)) / 15) - ((lc.peso_entrada_kg_cab * (lc.rc_inicial / 100)) / 15)
      ELSE 0
    END,
    'peso_vivo_medio_lote', lc.peso_vivo_atual_kg_cab,
    'peso_inicial_kg_cab', lc.peso_entrada_kg_cab,
    'quant_inicial', lc.quant_inicial,
    'quant_atual', lc.quant_atual,
    'morte', COALESCE(lc.morte, 0),
    'data_pesagem', lc.data_pesagem,
    'data_meta_projetada', lc.data_meta_projetada,
    'dias_restantes_meta', lc.dias_restantes_meta
  ) INTO v_metricas
  FROM public.lote_categorias lc
  WHERE lc.id = p_lote_categoria_id;

  INSERT INTO public.planos_nutricionais_snapshots (
    plano_nutricional_id,
    lote_categoria_id,
    fazenda_id,
    snapshot,
    metricas_derivadas,
    duracao_dias,
    ganho_peso_total_kg_cab,
    gmd_realizado,
    gmd_planejado,
    producao_arroba_lote,
    mortalidade_percent,
    motivo_migracao,
    plano_anterior_id,
    plano_posterior_id
  ) VALUES (
    v_plano_atual.id,
    p_lote_categoria_id,
    v_fazenda_id,
    v_snapshot,
    v_metricas,
    v_duracao,
    v_ganho_peso,
    v_gmd_realizado,
    v_gmd_planejado,
    v_prod_arroba_lote,
    v_mortalidade,
    p_motivo,
    v_plano_atual.id,
    v_proximo_plano.id
  );

  UPDATE public.planos_nutricionais
  SET ativo = false, data_fim = CURRENT_DATE
  WHERE id = v_plano_atual.id;

  UPDATE public.planos_nutricionais
  SET ativo = true, data_inicio = CURRENT_DATE
  WHERE id = v_proximo_plano.id;

  UPDATE public.lote_categorias lc
  SET
    formulacao_id = v_proximo_plano.formulacao_id,
    estrategia_nutricional = f.nome,
    peso_vivo_meta_kg_cab = v_proximo_plano.peso_meta_kg,
    gmd = CASE WHEN v_destino = 'enfermaria' THEN (f.gmd * 0.5)::text ELSE f.gmd::text END,
    consumo_meta_porcentagem_pesovivo = f.meta_consumo_ms_percent_pv
  FROM public.formulacoes f
  WHERE lc.id = p_lote_categoria_id
    AND f.id = v_proximo_plano.formulacao_id;
END;
$function$;

-- --------------------------------------------------------------------------
-- Trigger defensiva: impede formulacao_id divergente do plano vigente em
-- escritas diretas fora dos fluxos de plano
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_lote_formulacao_vigente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_vigente uuid;
BEGIN
  SELECT pn.formulacao_id INTO v_vigente
  FROM public.planos_nutricionais pn
  WHERE pn.lote_id = NEW.id
    AND pn.ativo = true
    AND pn.data_fim IS NULL
  ORDER BY pn.data_inicio DESC NULLS LAST, pn.ordem ASC
  LIMIT 1;

  -- Só força quando existe plano vigente; sem vigente, o valor escrito é
  -- preservado (lote sem plano pode carregar formulação informativa).
  IF FOUND AND NEW.formulacao_id IS DISTINCT FROM v_vigente THEN
    NEW.formulacao_id := v_vigente;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_lotes_enforce_formulacao_vigente ON public.lotes;
CREATE TRIGGER trg_lotes_enforce_formulacao_vigente
BEFORE UPDATE ON public.lotes
FOR EACH ROW
WHEN (NEW.formulacao_id IS DISTINCT FROM OLD.formulacao_id)
EXECUTE FUNCTION public.enforce_lote_formulacao_vigente();
