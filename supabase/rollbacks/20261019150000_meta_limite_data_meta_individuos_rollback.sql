-- Rollback de 20261019150000_meta_limite_data_meta_individuos.sql
-- Remove triggers e constraints novos e restaura as funcoes como estavam em 20261019140000/130000.
-- Valores ja recalculados em lote_categorias.data_meta_projetada e individuos.peso_meta_kg permanecem.

DROP TRIGGER IF EXISTS trg_lote_categorias_recalcular_data_meta ON public.lote_categorias;
DROP TRIGGER IF EXISTS trg_lote_categorias_propagar_meta_individuos ON public.lote_categorias;
DROP FUNCTION IF EXISTS public.fn_recalcular_data_meta_categoria();
DROP FUNCTION IF EXISTS public.fn_propagar_meta_categoria_para_individuos();
ALTER TABLE public.planos_nutricionais DROP CONSTRAINT IF EXISTS chk_planos_peso_meta_maximo;
ALTER TABLE public.plano_categoria_personalizacao DROP CONSTRAINT IF EXISTS chk_pcp_peso_meta_maximo;

CREATE OR REPLACE FUNCTION public._aplicar_personalizacao_categoria(
  p_plano_id uuid, p_lote_categoria_id uuid, p_periodo_dias integer, p_peso_meta_kg numeric,
  p_registrar_historico boolean DEFAULT false
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plano RECORD;
  v_cat RECORD;
  v_pcp RECORD;
  v_entrada RECORD;
  v_periodo integer;
  v_meta numeric;
  v_meta_mudou boolean;
  v_periodo_mudou boolean;
BEGIN
  SELECT * INTO v_plano FROM public.planos_nutricionais WHERE id = p_plano_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plano nao encontrado'; END IF;
  IF NOT (v_plano.ativo = true AND v_plano.data_fim IS NULL) THEN
    RAISE EXCEPTION 'A personalizacao so vale para o plano vigente do lote';
  END IF;

  SELECT * INTO v_cat FROM public.lote_categorias
  WHERE id = p_lote_categoria_id AND lote_id = v_plano.lote_id AND ativo = true AND data_fim IS NULL
    AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerro ao pe'
    AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerra ao pe';
  IF NOT FOUND THEN RAISE EXCEPTION 'Categoria nao pertence ao lote do plano ou nao aceita plano'; END IF;

  SELECT * INTO v_pcp FROM public.plano_categoria_personalizacao
  WHERE plano_id = p_plano_id AND lote_categoria_id = p_lote_categoria_id;

  v_periodo := COALESCE(p_periodo_dias, v_pcp.periodo_dias, v_plano.periodo_dias);
  v_meta := COALESCE(p_peso_meta_kg, v_pcp.peso_meta_kg, v_plano.peso_meta_kg);
  IF v_periodo IS NULL OR v_periodo <= 0 THEN RAISE EXCEPTION 'Periodo deve ser maior que zero'; END IF;
  IF v_meta IS NULL OR v_meta <= 0 THEN RAISE EXCEPTION 'Peso meta deve ser maior que zero'; END IF;

  v_meta_mudou := v_cat.peso_vivo_meta_kg_cab IS DISTINCT FROM v_meta OR v_pcp.peso_meta_kg IS DISTINCT FROM v_meta;
  v_periodo_mudou := v_pcp.periodo_dias IS DISTINCT FROM v_periodo;

  IF p_registrar_historico AND (v_meta_mudou OR v_periodo_mudou) THEN
    SELECT s.snapshot->>'peso_vivo_meta_kg_cab' AS meta, s.metricas_derivadas->>'progresso_meta_percent' AS progresso
    INTO v_entrada
    FROM public.planos_nutricionais_snapshots s
    WHERE s.plano_nutricional_id = p_plano_id AND s.lote_categoria_id = p_lote_categoria_id AND s.tipo_snapshot = 'entrada'
    ORDER BY s.created_at DESC LIMIT 1;

    INSERT INTO public.planos_nutricionais_edicoes
      (fazenda_id, lote_id, plano_id, lote_categoria_id, origem, antes, depois, usuario_id)
    SELECT l.fazenda_id, v_plano.lote_id, p_plano_id, p_lote_categoria_id, 'edicao_categoria',
      jsonb_build_object(
        'periodo_dias', v_pcp.periodo_dias,
        'peso_meta_kg', v_pcp.peso_meta_kg,
        'peso_vivo_meta_kg_cab', v_cat.peso_vivo_meta_kg_cab,
        'snapshot_entrada_peso_meta', v_entrada.meta,
        'snapshot_entrada_progresso', v_entrada.progresso
      ),
      jsonb_build_object(
        'periodo_dias', v_periodo,
        'peso_meta_kg', v_meta,
        'peso_vivo_meta_kg_cab', v_meta
      ),
      auth.uid()
    FROM public.lotes l WHERE l.id = v_plano.lote_id;
  END IF;

  -- peso_inicio_kg_cab nao e alterado aqui: so muda quando o plano e iniciado/migrado.
  INSERT INTO public.plano_categoria_personalizacao (plano_id, lote_categoria_id, periodo_dias, peso_meta_kg, ativo)
  VALUES (p_plano_id, p_lote_categoria_id, v_periodo, v_meta, true)
  ON CONFLICT (plano_id, lote_categoria_id) DO UPDATE
  SET periodo_dias = EXCLUDED.periodo_dias,
      peso_meta_kg = EXCLUDED.peso_meta_kg,
      ativo = true;

  -- Novo valor de meta/periodo: libera o aviso de "atingido" para o valor novo.
  UPDATE public.lote_categorias
  SET peso_vivo_meta_kg_cab = v_meta,
      data_notificacao_meta = CASE WHEN v_meta_mudou THEN NULL ELSE data_notificacao_meta END,
      data_notificacao_periodo = CASE WHEN v_periodo_mudou THEN NULL ELSE data_notificacao_periodo END
  WHERE id = p_lote_categoria_id;

  UPDATE public.planos_nutricionais_snapshots
  SET snapshot = jsonb_set(snapshot, '{peso_vivo_meta_kg_cab}', to_jsonb(v_meta)),
      metricas_derivadas = jsonb_set(
        metricas_derivadas, '{progresso_meta_percent}',
        to_jsonb((COALESCE((metricas_derivadas->>'peso_vivo_medio_lote')::numeric, v_cat.peso_vivo_atual_kg_cab, 0) / v_meta) * 100)
      )
  WHERE plano_nutricional_id = p_plano_id
    AND lote_categoria_id = p_lote_categoria_id
    AND tipo_snapshot = 'entrada';
END;
$function$;

CREATE OR REPLACE FUNCTION public.editar_plano_lote(
  p_fazenda_id uuid, p_plano_id uuid, p_nome text, p_formulacao_id uuid,
  p_periodo_dias integer, p_peso_meta_kg numeric
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old RECORD;
  v_pcp RECORD;
  v_vigente boolean;
  v_nome text;
  v_form uuid;
  v_periodo integer;
  v_meta numeric;
  v_novo_periodo integer;
  v_nova_meta numeric;
BEGIN
  PERFORM public.guard_w_fazenda(p_fazenda_id);

  SELECT pn.* INTO v_old
  FROM public.planos_nutricionais pn
  JOIN public.lotes l ON l.id = pn.lote_id
  WHERE pn.id = p_plano_id AND l.fazenda_id = p_fazenda_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plano nao encontrado nesta fazenda'; END IF;
  IF v_old.data_fim IS NOT NULL THEN RAISE EXCEPTION 'Plano encerrado nao pode ser editado'; END IF;

  v_vigente := v_old.ativo = true;
  v_periodo := COALESCE(p_periodo_dias, v_old.periodo_dias);
  v_meta := COALESCE(p_peso_meta_kg, v_old.peso_meta_kg);
  IF v_periodo IS NULL OR v_periodo <= 0 THEN RAISE EXCEPTION 'Periodo deve ser maior que zero'; END IF;
  IF v_meta IS NULL OR v_meta <= 0 THEN RAISE EXCEPTION 'Peso meta deve ser maior que zero'; END IF;

  IF v_vigente THEN
    IF (p_nome IS NOT NULL AND btrim(p_nome) <> v_old.nome)
       OR (p_formulacao_id IS NOT NULL AND p_formulacao_id <> v_old.formulacao_id) THEN
      RAISE EXCEPTION 'No plano vigente so periodo e peso meta podem ser alterados';
    END IF;
    v_nome := v_old.nome;
    v_form := v_old.formulacao_id;
  ELSE
    v_nome := COALESCE(NULLIF(btrim(p_nome), ''), v_old.nome);
    v_form := COALESCE(p_formulacao_id, v_old.formulacao_id);
    IF v_form <> v_old.formulacao_id AND NOT EXISTS (
      SELECT 1 FROM public.formulacoes f
      WHERE f.id = v_form AND f.fazenda_id = p_fazenda_id AND f.ativo = true
        AND COALESCE(f.e_premix, false) = false AND COALESCE(f.e_creep, false) = false
    ) THEN
      RAISE EXCEPTION 'Formulacao invalida, inativa, creep/premix ou de outra fazenda';
    END IF;
  END IF;

  IF v_nome = v_old.nome AND v_form = v_old.formulacao_id
     AND v_periodo = v_old.periodo_dias AND v_meta = v_old.peso_meta_kg THEN
    RETURN;
  END IF;

  INSERT INTO public.planos_nutricionais_edicoes
    (fazenda_id, lote_id, plano_id, lote_categoria_id, origem, antes, depois, usuario_id)
  VALUES (
    p_fazenda_id, v_old.lote_id, p_plano_id, NULL,
    CASE WHEN v_vigente THEN 'edicao_plano_vigente' ELSE 'edicao_plano_fila' END,
    jsonb_build_object('nome', v_old.nome, 'formulacao_id', v_old.formulacao_id,
                       'periodo_dias', v_old.periodo_dias, 'peso_meta_kg', v_old.peso_meta_kg),
    jsonb_build_object('nome', v_nome, 'formulacao_id', v_form,
                       'periodo_dias', v_periodo, 'peso_meta_kg', v_meta),
    auth.uid()
  );

  UPDATE public.planos_nutricionais
  SET nome = v_nome, formulacao_id = v_form, periodo_dias = v_periodo, peso_meta_kg = v_meta
  WHERE id = p_plano_id;

  -- Plano vigente: o novo valor vai para as categorias cujo valor ainda era o do plano.
  -- Categorias personalizadas à mão (valor diferente do plano antigo) ficam como estão.
  IF v_vigente AND (v_periodo <> v_old.periodo_dias OR v_meta <> v_old.peso_meta_kg) THEN
    FOR v_pcp IN
      SELECT p.* FROM public.plano_categoria_personalizacao p
      JOIN public.lote_categorias lc ON lc.id = p.lote_categoria_id
      WHERE p.plano_id = p_plano_id AND p.ativo = true
        AND lc.ativo = true AND lc.data_fim IS NULL
        AND LOWER(unaccent(lc.categoria)) NOT ILIKE 'bezerro ao pe'
        AND LOWER(unaccent(lc.categoria)) NOT ILIKE 'bezerra ao pe'
    LOOP
      v_novo_periodo := CASE WHEN v_pcp.periodo_dias IS NOT DISTINCT FROM v_old.periodo_dias THEN v_periodo ELSE v_pcp.periodo_dias END;
      v_nova_meta := CASE WHEN v_pcp.peso_meta_kg IS NOT DISTINCT FROM v_old.peso_meta_kg THEN v_meta ELSE v_pcp.peso_meta_kg END;
      IF v_novo_periodo IS DISTINCT FROM v_pcp.periodo_dias OR v_nova_meta IS DISTINCT FROM v_pcp.peso_meta_kg THEN
        PERFORM public._aplicar_personalizacao_categoria(p_plano_id, v_pcp.lote_categoria_id, v_novo_periodo, v_nova_meta, true);
      END IF;
    END LOOP;
  END IF;
END;
$function$;

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
        -- iniciar/migrar gravam a personalização com os valores do plano; os
        -- ajustes por categoria entram depois, pelo mesmo helper do modal do lote.
        FOR v_cat IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'categorias', '[]'::jsonb))
        LOOP
          PERFORM public._aplicar_personalizacao_categoria(
            v_plano_id,
            (v_cat->>'lote_categoria_id')::uuid,
            COALESCE((v_cat->>'periodo_dias')::integer, v_periodo),
            COALESCE((v_cat->>'peso_meta_kg')::numeric, v_peso_meta)
          );
        END LOOP;
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

CREATE OR REPLACE FUNCTION public.atualizar_estrategia_nutricional_individuo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.lote_atual IS NULL OR NEW.categoria IS NULL THEN
    NEW.estrategia_nutricional_id := NULL;
    NEW.estrategia_nutricional_nome := NULL;
    NEW.estrategia_nutricional_tipo := NULL;
    NEW.gmd_kg_cab_dia := NULL;
    NEW.peso_meta_kg := NULL;
    RETURN NEW;
  END IF;

  SELECT
    f.id,
    f.nome,
    f.tipo,
    f.gmd,
    pn.peso_meta_kg
  INTO
    NEW.estrategia_nutricional_id,
    NEW.estrategia_nutricional_nome,
    NEW.estrategia_nutricional_tipo,
    NEW.gmd_kg_cab_dia,
    NEW.peso_meta_kg
  FROM public.lote_categorias lc
  JOIN public.planos_nutricionais pn ON pn.lote_categoria_id = lc.id AND pn.ativo = true
  JOIN public.formulacoes f ON f.id = pn.formulacao_id
  WHERE lc.lote_id = NEW.lote_atual
    AND LOWER(lc.categoria) = LOWER(NEW.categoria)
    AND (lc.ativo IS NULL OR lc.ativo = true)
  LIMIT 1;

  RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS public._peso_meta_maximo();
