-- ROLLBACK da Fase 5.3 (migration 20261007263000_fase5_3_rpcs_escrita_authz.sql)
-- NÃO fica em supabase/migrations/ de propósito. ATENÇÃO: reabre as 18 RPCs de escrita para anon.
-- Restaura os corpos originais (capturados antes da migration), reabre EXECUTE e remove os guards.

CREATE OR REPLACE FUNCTION public.update_quant_atual_with_data(p_lote_id uuid, p_categoria character varying, p_raca character varying DEFAULT NULL::character varying, p_sexo character varying DEFAULT NULL::character varying)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
    v_quant_atual INTEGER;
    v_sexo_normalizado VARCHAR;
BEGIN
    -- Normalizar sexo para maiúscula
    v_sexo_normalizado := CASE 
        WHEN p_sexo IS NOT NULL THEN INITCAP(p_sexo)
        ELSE NULL
    END;
    
    -- Calcular a quantidade atual para o lote e categoria
    SELECT COALESCE(SUM(CASE 
        WHEN i.categoria = p_categoria THEN 1 
        ELSE 0 
    END), 0)
    INTO v_quant_atual
    FROM public.lotes l
    LEFT JOIN public.individuos i ON l.id = i.lote_atual AND i.deleted_at IS NULL
    WHERE l.id = p_lote_id AND l.deleted_at IS NULL;

    -- Atualizar ou inserir na lote_categorias com raça e sexo normalizados
    INSERT INTO public.lote_categorias (
        lote_id, 
        categoria, 
        quant_atual, 
        raca, 
        sexo, 
        ativo
    )
    VALUES (
        p_lote_id, 
        p_categoria, 
        v_quant_atual, 
        p_raca, 
        v_sexo_normalizado, 
        true
    )
    ON CONFLICT (lote_id, categoria) 
    DO UPDATE SET 
        quant_atual = EXCLUDED.quant_atual,
        raca = COALESCE(EXCLUDED.raca, lote_categorias.raca),
        sexo = COALESCE(EXCLUDED.sexo, lote_categorias.sexo),
        updated_at = NOW();
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.criar_snapshot_entrada(p_plano_id uuid, p_lote_categoria_id uuid, p_motivo text DEFAULT 'inicio'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_plano RECORD;
  v_snapshot jsonb;
  v_metricas jsonb;
  v_lote_id uuid;
  v_fazenda_id uuid;
  v_peso_atual numeric;
  v_rc_atual numeric;
  v_quant_atual integer;
  v_quant_inicial integer;
  v_morte integer;
  v_gmd_planejado numeric;
  v_categoria text;
  v_prod_arroba numeric;
BEGIN
  SELECT * INTO v_plano
  FROM public.planos_nutricionais
  WHERE id = p_plano_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plano nao encontrado';
  END IF;

  -- Buscar lote_id e categoria da lote_categoria informada
  SELECT lc.lote_id, lc.categoria INTO v_lote_id, v_categoria
  FROM public.lote_categorias lc
  WHERE lc.id = p_lote_categoria_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote categoria nao encontrado';
  END IF;

  -- Guard: o plano deve pertencer ao lote da categoria
  IF v_plano.lote_id IS NOT NULL THEN
    IF v_plano.lote_id != v_lote_id THEN
      RAISE EXCEPTION 'Plano % nao pertence ao lote da categoria %', p_plano_id, p_lote_categoria_id;
    END IF;
  ELSE
    -- Compatibilidade: se lote_id for null, usar lote_categoria_id
    IF v_plano.lote_categoria_id IS NOT NULL AND v_plano.lote_categoria_id != p_lote_categoria_id THEN
      RAISE EXCEPTION 'Plano % nao pertence a categoria %', p_plano_id, p_lote_categoria_id;
    END IF;
  END IF;

  SELECT to_jsonb(lc.*) INTO v_snapshot
  FROM public.lote_categorias lc
  WHERE lc.id = p_lote_categoria_id;

  SELECT fazenda_id INTO v_fazenda_id
  FROM public.lotes
  WHERE id = v_lote_id;

  SELECT
    COALESCE(lc.peso_vivo_atual_kg_cab, 0),
    COALESCE(lc.rc_atual, 0),
    COALESCE(lc.quant_atual, 0),
    COALESCE(lc.quant_inicial, 0),
    COALESCE(lc.morte, 0)
  INTO v_peso_atual, v_rc_atual, v_quant_atual, v_quant_inicial, v_morte
  FROM public.lote_categorias lc
  WHERE lc.id = p_lote_categoria_id;

  -- GMD planejado da formulacao_categorias_gmd
  SELECT fcg.gmd INTO v_gmd_planejado
  FROM public.formulacao_categorias_gmd fcg
  WHERE fcg.formulacao_id = v_plano.formulacao_id
    AND LOWER(TRIM(fcg.categoria)) = LOWER(TRIM(v_categoria));
  IF NOT FOUND THEN
    v_gmd_planejado := NULL;
  END IF;

  SELECT jsonb_build_object(
    'custo_operacional_total_cab', 0,
    'custo_total_producao_cab', COALESCE(lc.custo_total_entrada_reais_cab, 0),
    'progresso_meta_percent', CASE
      WHEN COALESCE(v_plano.peso_meta_kg, 0) > 0
        THEN (v_peso_atual / v_plano.peso_meta_kg) * 100
      ELSE 0
    END,
    'ganho_arroba_cab', 0,
    'peso_vivo_medio_lote', v_peso_atual,
    'peso_inicial_kg_cab', v_peso_atual,
    'rc_inicio', v_rc_atual,
    'rc_atual', v_rc_atual,
    'quant_inicial', v_quant_inicial,
    'quant_atual', v_quant_atual,
    'morte', v_morte,
    'data_pesagem', lc.data_pesagem,
    'data_meta_projetada', lc.data_meta_projetada,
    'dias_restantes_meta', lc.dias_restantes_meta
  ) INTO v_metricas
  FROM public.lote_categorias lc
  WHERE lc.id = p_lote_categoria_id;

  IF v_rc_atual > 0 AND v_quant_atual > 0 THEN
    v_prod_arroba := ((v_peso_atual * (v_rc_atual / 100)) / 15) * v_quant_atual;
  ELSE
    v_prod_arroba := 0;
  END IF;

  INSERT INTO public.planos_nutricionais_snapshots (
    plano_nutricional_id, lote_categoria_id, fazenda_id,
    snapshot, metricas_derivadas,
    duracao_dias, ganho_peso_total_kg_cab, gmd_realizado, gmd_planejado,
    producao_arroba_lote, mortalidade_percent, motivo_migracao,
    plano_anterior_id, plano_posterior_id, tipo_snapshot
  ) VALUES (
    p_plano_id, p_lote_categoria_id, v_fazenda_id,
    v_snapshot, v_metricas,
    0, 0, 0, v_gmd_planejado,
    v_prod_arroba,
    CASE WHEN v_quant_inicial > 0 THEN (v_morte::numeric / v_quant_inicial) * 100 ELSE 0 END,
    p_motivo, NULL, NULL, 'entrada'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.encerrar_plano_nutricional(p_lote_categoria_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plano RECORD;
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
  v_peso_inicio numeric;
  v_rc_inicio numeric;
  v_peso_atual numeric;
  v_rc_atual numeric;
  v_quant_atual integer;
  v_quant_inicial integer;
  v_morte integer;
BEGIN
  SELECT * INTO v_plano
  FROM public.planos_nutricionais
  WHERE lote_categoria_id = p_lote_categoria_id
    AND ativo = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nenhum plano vigente encontrado para esta categoria';
  END IF;

  SELECT to_jsonb(lc.*) INTO v_snapshot
  FROM public.lote_categorias lc
  WHERE lc.id = p_lote_categoria_id;

  SELECT lc.lote_id INTO v_lote_id
  FROM public.lote_categorias lc
  WHERE lc.id = p_lote_categoria_id;

  SELECT fazenda_id INTO v_fazenda_id
  FROM public.lotes
  WHERE id = v_lote_id;

  SELECT
    COALESCE(lc.peso_vivo_atual_kg_cab, 0),
    COALESCE(lc.rc_final, 0),
    COALESCE(lc.quant_atual, 0),
    COALESCE(lc.quant_inicial, 0),
    COALESCE(lc.morte, 0)
  INTO v_peso_atual, v_rc_atual, v_quant_atual, v_quant_inicial, v_morte
  FROM public.lote_categorias lc
  WHERE lc.id = p_lote_categoria_id;

  v_peso_inicio := COALESCE(v_plano.peso_inicio_kg_cab, (
    SELECT lc.peso_entrada_kg_cab FROM public.lote_categorias lc WHERE lc.id = p_lote_categoria_id
  ), 0);
  v_rc_inicio := COALESCE(v_plano.rc_inicio, (
    SELECT lc.rc_inicial FROM public.lote_categorias lc WHERE lc.id = p_lote_categoria_id
  ), 0);

  v_duracao := COALESCE((CURRENT_DATE - v_plano.data_inicio)::integer, 0);

  SELECT f.gmd INTO v_gmd_planejado
  FROM public.formulacoes f
  WHERE f.id = v_plano.formulacao_id;

  v_ganho_peso := v_peso_atual - v_peso_inicio;

  IF v_ganho_peso > 0 AND v_duracao > 0 THEN
    v_gmd_realizado := v_ganho_peso / v_duracao;
  ELSE
    v_gmd_realizado := 0;
  END IF;

  IF v_quant_inicial > 0 THEN
    v_mortalidade := (v_morte::numeric / v_quant_inicial) * 100;
  ELSE
    v_mortalidade := 0;
  END IF;

  IF v_rc_atual > 0 AND v_quant_atual > 0 THEN
    v_prod_arroba_lote := ((v_peso_atual * (v_rc_atual / 100)) / 15) * v_quant_atual;
  ELSE
    v_prod_arroba_lote := 0;
  END IF;

  SELECT jsonb_build_object(
    'custo_operacional_total_cab', COALESCE(lc.custo_operacional_reais_cab_dia, 0) * v_duracao,
    'custo_total_producao_cab', COALESCE(lc.custo_total_entrada_reais_cab, 0) + (COALESCE(lc.custo_operacional_reais_cab_dia, 0) * v_duracao),
    'progresso_meta_percent', CASE
      WHEN COALESCE(v_plano.peso_meta_kg, 0) > 0
        THEN (v_peso_atual / v_plano.peso_meta_kg) * 100
      ELSE 0
    END,
    'ganho_arroba_cab', CASE
      WHEN v_rc_atual > 0 AND v_rc_inicio > 0
        THEN ((v_peso_atual * (v_rc_atual / 100)) / 15) - ((v_peso_inicio * (v_rc_inicio / 100)) / 15)
      ELSE 0
    END,
    'peso_vivo_medio_lote', v_peso_atual,
    'peso_inicial_kg_cab', v_peso_inicio,
    'rc_inicio', v_rc_inicio,
    'rc_atual', v_rc_atual,
    'quant_inicial', v_quant_inicial,
    'quant_atual', v_quant_atual,
    'morte', v_morte,
    'data_pesagem', lc.data_pesagem,
    'data_meta_projetada', lc.data_meta_projetada,
    'dias_restantes_meta', lc.dias_restantes_meta
  ) INTO v_metricas
  FROM public.lote_categorias lc
  WHERE lc.id = p_lote_categoria_id;

  INSERT INTO public.planos_nutricionais_snapshots (
    plano_nutricional_id, lote_categoria_id, fazenda_id,
    snapshot, metricas_derivadas,
    duracao_dias, ganho_peso_total_kg_cab, gmd_realizado, gmd_planejado,
    producao_arroba_lote, mortalidade_percent, motivo_migracao,
    plano_anterior_id, plano_posterior_id, tipo_snapshot
  ) VALUES (
    v_plano.id, p_lote_categoria_id, v_fazenda_id,
    v_snapshot, v_metricas,
    v_duracao, v_ganho_peso, v_gmd_realizado, v_gmd_planejado,
    v_prod_arroba_lote, v_mortalidade, 'encerramento',
    v_plano.id, NULL, 'saida'
  );

  UPDATE public.planos_nutricionais
  SET ativo = false, data_fim = CURRENT_DATE
  WHERE id = v_plano.id;

  UPDATE public.lote_categorias
  SET formulacao_id = NULL,
      estrategia_nutricional = NULL,
      peso_vivo_meta_kg_cab = NULL,
      gmd = NULL,
      consumo_meta_porcentagem_pesovivo = NULL
  WHERE id = p_lote_categoria_id;
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.gerar_notificacoes_recategorizacao(p_fazenda_id uuid, p_usuario_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_inseridas integer := 0;
  v_lote RECORD;
  v_percentual numeric;
  v_dias_restantes integer;
  v_mensagem text;
  v_gmd numeric;
  v_threshold numeric := 95.0;
  v_ativo boolean := true;
  v_config RECORD;
BEGIN
  -- Ler config da fazenda
  SELECT threshold_recategorizacao, recategorizacao_ativo INTO v_config
  FROM public.notificacoes_config
  WHERE fazenda_id = p_fazenda_id;

  IF FOUND THEN
    v_threshold := v_config.threshold_recategorizacao / 100.0;
    v_ativo := v_config.recategorizacao_ativo;
  END IF;

  IF NOT v_ativo THEN
    RETURN 0;
  END IF;

  FOR v_lote IN
    SELECT 
      lc.id AS lote_categoria_id,
      lc.lote_id,
      l.nome AS lote_nome,
      lc.categoria,
      lc.peso_vivo_atual_kg_cab,
      fc.peso_max,
      fc.nome AS faixa_nome,
      COALESCE(pn.gmd_planejado, lc.gmd::numeric) AS gmd
    FROM public.lote_categorias lc
    JOIN public.lotes l ON l.id = lc.lote_id
    LEFT JOIN public.faixas_categorias fc 
      ON fc.fazenda_id = l.fazenda_id 
      AND LOWER(fc.nome) = LOWER(lc.categoria) 
      AND fc.ativo = true
    LEFT JOIN public.planos_nutricionais pn 
      ON pn.lote_categoria_id = lc.id 
      AND pn.ativo = true
    WHERE l.fazenda_id = p_fazenda_id
      AND lc.ativo = true
      AND lc.data_fim IS NULL
      AND lc.peso_vivo_atual_kg_cab IS NOT NULL
      AND fc.peso_max IS NOT NULL
      AND lc.peso_vivo_atual_kg_cab >= (fc.peso_max * v_threshold)
  LOOP
    -- Dedup: se ja existe ANY notificacao para este lote_categoria_id
    -- (mesmo lida ou soft-deletada), pular. O usuario ja foi avisado.
    IF EXISTS (
      SELECT 1 FROM public.notificacoes n
      WHERE n.usuario_id = p_usuario_id
        AND n.fazenda_id = p_fazenda_id
        AND n.dados_jsonb->>'lote_categoria_id' = v_lote.lote_categoria_id::text
        AND n.dados_jsonb->>'tipo_alerta' = 'recategorizacao'
    ) THEN
      CONTINUE;
    END IF;

    v_percentual := ROUND((v_lote.peso_vivo_atual_kg_cab / v_lote.peso_max * 100)::numeric, 1);
    v_gmd := v_lote.gmd;

    IF v_gmd IS NOT NULL AND v_gmd > 0 THEN
      v_dias_restantes := CEIL((v_lote.peso_max - v_lote.peso_vivo_atual_kg_cab) / v_gmd);
      v_mensagem := 'O lote "' || v_lote.lote_nome || '" (' || v_lote.categoria || ') atingiu ' 
        || v_percentual || '% do limite da faixa (' || v_lote.peso_max || ' kg). '
        || 'Peso atual: ' || v_lote.peso_vivo_atual_kg_cab || ' kg. '
        || 'Prazo estimado para recategorizar: ' || v_dias_restantes || ' dias.';
    ELSE
      v_dias_restantes := NULL;
      v_mensagem := 'O lote "' || v_lote.lote_nome || '" (' || v_lote.categoria || ') atingiu ' 
        || v_percentual || '% do limite da faixa (' || v_lote.peso_max || ' kg). '
        || 'Peso atual: ' || v_lote.peso_vivo_atual_kg_cab || ' kg. '
        || 'Prazo indeterminado (sem GMD cadastrado).';
    END IF;

    INSERT INTO public.notificacoes (
      usuario_id, fazenda_id, tipo, titulo, mensagem, 
      lida, acao_url, acao_label, dados_jsonb
    ) VALUES (
      p_usuario_id, p_fazenda_id, 'warning',
      'Recategorização recomendada: ' || v_lote.lote_nome,
      v_mensagem,
      false,
      '/controller/notificacoes',
      'Ver notificações',
      jsonb_build_object(
        'lote_categoria_id', v_lote.lote_categoria_id,
        'lote_id', v_lote.lote_id,
        'lote_nome', v_lote.lote_nome,
        'categoria', v_lote.categoria,
        'peso_atual', v_lote.peso_vivo_atual_kg_cab,
        'limite_sup', v_lote.peso_max,
        'percentual', v_percentual,
        'dias_restantes', v_dias_restantes,
        'tipo_alerta', 'recategorizacao'
      )
    );

    v_inseridas := v_inseridas + 1;
  END LOOP;

  RETURN v_inseridas;
END;
$function$;

CREATE OR REPLACE FUNCTION public.salvar_notificacoes_config(p_fazenda_id uuid, p_threshold_recategorizacao numeric, p_recategorizacao_ativo boolean, p_tratos_ativo boolean DEFAULT true)
 RETURNS notificacoes_config
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_result public.notificacoes_config;
BEGIN
  -- Upsert
  INSERT INTO public.notificacoes_config (
    fazenda_id, threshold_recategorizacao, recategorizacao_ativo, tratos_ativo, updated_at
  ) VALUES (
    p_fazenda_id, p_threshold_recategorizacao, p_recategorizacao_ativo, p_tratos_ativo, now()
  )
  ON CONFLICT (fazenda_id) DO UPDATE SET
    threshold_recategorizacao = EXCLUDED.threshold_recategorizacao,
    recategorizacao_ativo = EXCLUDED.recategorizacao_ativo,
    tratos_ativo = EXCLUDED.tratos_ativo,
    updated_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_push_subscription(p_fazenda_id uuid, p_dispositivo_id text, p_endpoint text, p_keys_p256dh text, p_keys_auth text, p_funcionario_id uuid DEFAULT NULL::uuid)
 RETURNS push_subscriptions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_result public.push_subscriptions;
BEGIN
  INSERT INTO public.push_subscriptions (
    fazenda_id, funcionario_id, dispositivo_id, endpoint, keys_p256dh, keys_auth
  ) VALUES (
    p_fazenda_id, p_funcionario_id, p_dispositivo_id, p_endpoint, p_keys_p256dh, p_keys_auth
  )
  ON CONFLICT (dispositivo_id, endpoint) DO UPDATE SET
    fazenda_id = p_fazenda_id,
    funcionario_id = COALESCE(p_funcionario_id, push_subscriptions.funcionario_id),
    keys_p256dh = p_keys_p256dh,
    keys_auth = p_keys_auth,
    updated_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remover_push_subscription(p_dispositivo_id text, p_endpoint text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
BEGIN
  DELETE FROM public.push_subscriptions
  WHERE dispositivo_id = p_dispositivo_id AND endpoint = p_endpoint;
END;
$function$;

CREATE OR REPLACE FUNCTION public.transferir_lote_entre_fazendas(p_lote_origem_id uuid, p_fazenda_destino_id uuid, p_categorias jsonb, p_nome_usuario text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_lote RECORD;
  v_fazenda_origem RECORD;
  v_fazenda_destino RECORD;
  v_novo_lote_id uuid;
  v_novo_lote_nome text;
  v_cat_item jsonb;
  v_categoria text;
  v_cabecas int;
  v_total_transferir int := 0;
  v_total_origem int := 0;
  v_total_restante int;
  v_is_total boolean;
  v_cat_origem RECORD;
  v_sufixo_num int := 1;
  v_controller RECORD;
  v_categorias_desc text;
  v_result jsonb;
  v_nome_base text;
  v_categorias_nomes text;
  v_data_mov timestamp with time zone := now();
  v_observacao_saida text;
  v_observacao_entrada text;
BEGIN
  SELECT * INTO v_lote FROM lotes WHERE id = p_lote_origem_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lote origem nao encontrado');
  END IF;

  SELECT id, nome, grupo_id INTO v_fazenda_origem FROM fazendas WHERE id = v_lote.fazenda_id;
  SELECT id, nome, grupo_id INTO v_fazenda_destino FROM fazendas WHERE id = p_fazenda_destino_id;

  IF v_fazenda_origem.grupo_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fazenda origem nao pertence a nenhum grupo');
  END IF;
  IF v_fazenda_destino.grupo_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fazenda destino nao pertence a nenhum grupo');
  END IF;
  IF v_fazenda_origem.grupo_id <> v_fazenda_destino.grupo_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fazendas nao pertencem ao mesmo grupo');
  END IF;
  IF v_fazenda_origem.id = v_fazenda_destino.id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fazenda destino igual a origem');
  END IF;

  IF p_categorias IS NULL OR jsonb_array_length(p_categorias) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nenhuma categoria informada');
  END IF;

  FOR v_cat_item IN SELECT * FROM jsonb_array_elements(p_categorias) LOOP
    v_categoria := v_cat_item->>'categoria';
    v_cabecas := (v_cat_item->>'numero_cabecas')::int;
    IF v_cabecas IS NULL OR v_cabecas <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cabecas invalidas para categoria: ' || v_categoria);
    END IF;
    SELECT * INTO v_cat_origem
    FROM lote_categorias
    WHERE lote_id = p_lote_origem_id
      AND LOWER(categoria) = LOWER(v_categoria)
      AND ativo = true;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Categoria nao encontrada no lote origem: ' || v_categoria);
    END IF;
    IF v_cabecas > COALESCE(v_cat_origem.quant_atual, 0) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cabecas excedem disponivel para categoria: ' || v_categoria);
    END IF;
    v_total_transferir := v_total_transferir + v_cabecas;
  END LOOP;

  SELECT COALESCE(SUM(quant_atual), 0) INTO v_total_origem
  FROM lote_categorias
  WHERE lote_id = p_lote_origem_id AND ativo = true;

  v_is_total := (v_total_transferir >= v_total_origem);
  v_total_restante := GREATEST(v_total_origem - v_total_transferir, 0);

  v_nome_base := v_lote.nome;
  v_novo_lote_nome := v_nome_base || ' (' || v_sufixo_num::text || ')';
  LOOP
    IF NOT EXISTS (SELECT 1 FROM lotes WHERE fazenda_id = p_fazenda_destino_id AND nome = v_novo_lote_nome AND deleted_at IS NULL) THEN
      EXIT;
    END IF;
    v_sufixo_num := v_sufixo_num + 1;
    v_novo_lote_nome := v_nome_base || ' (' || v_sufixo_num::text || ')';
    IF v_sufixo_num > 99 THEN
      v_novo_lote_nome := v_nome_base || ' (transferido ' || to_char(now(), 'YYYYMMDDHH24MI') || ')';
      EXIT;
    END IF;
  END LOOP;

  INSERT INTO lotes (
    fazenda_id, nome, n_cabecas, categorias, qtd_bezerros, ativo,
    numero_cabecas, quantidade_bezerros,
    raca, sexo, idade_meses, rc_inicial, preco_kg, preco_cab,
    custo_operacional_reais_cab_dia, estrategia_nutricional,
    produtor_rural, propriedade_origem, numero_contrato, mes_competencia,
    data_liberacao_sisbov, periodo_liberacao_sisbov, data_embarque_previsto,
    quant_inicial, peso_entrada_kg, gmd, data_pesagem, data_meta,
    peso_vivo_meta_kg, peso_vivo_kg, peso_entrada_kg_cab, periodo,
    sistema_producao, preco_animal_kg, preco_animal_cab, idade,
    dias_restantes_meta, data_embarque_prevista, meta_intervalo_rodeio_dias,
    data_proximo_rodeio, destino
  ) VALUES (
    p_fazenda_destino_id, v_novo_lote_nome, v_total_transferir, v_lote.categorias, v_lote.qtd_bezerros, true,
    v_total_transferir, v_lote.quantidade_bezerros,
    v_lote.raca, v_lote.sexo, v_lote.idade_meses, v_lote.rc_inicial, v_lote.preco_kg, v_lote.preco_cab,
    v_lote.custo_operacional_reais_cab_dia, v_lote.estrategia_nutricional,
    v_lote.produtor_rural, v_lote.propriedade_origem, v_lote.numero_contrato, v_lote.mes_competencia,
    v_lote.data_liberacao_sisbov, v_lote.periodo_liberacao_sisbov, v_lote.data_embarque_previsto,
    v_total_transferir, v_lote.peso_entrada_kg, v_lote.gmd, v_lote.data_pesagem, v_lote.data_meta,
    v_lote.peso_vivo_meta_kg, v_lote.peso_vivo_kg, v_lote.peso_entrada_kg_cab, v_lote.periodo,
    v_lote.sistema_producao, v_lote.preco_animal_kg, v_lote.preco_animal_cab, v_lote.idade,
    v_lote.dias_restantes_meta, v_lote.data_embarque_prevista, v_lote.meta_intervalo_rodeio_dias,
    v_lote.data_proximo_rodeio, v_lote.destino
  )
  RETURNING id INTO v_novo_lote_id;

  FOR v_cat_item IN SELECT * FROM jsonb_array_elements(p_categorias) LOOP
    v_categoria := v_cat_item->>'categoria';
    v_cabecas := (v_cat_item->>'numero_cabecas')::int;

    SELECT * INTO v_cat_origem
    FROM lote_categorias
    WHERE lote_id = p_lote_origem_id
      AND LOWER(categoria) = LOWER(v_categoria)
      AND ativo = true;

    INSERT INTO lote_categorias (
      lote_id, categoria, quant_inicial, quant_atual,
      data_pesagem, peso_entrada_kg_cab, peso_entrada_arrobas, gmd, periodo,
      rc_inicial, peso_vivo_atual_kg_cab, peso_vivo_meta_kg_cab, dias_restantes_meta,
      estrategia_nutricional, raca, sexo, idade, ativo,
      morte, consumo, abate, transf_entrada, transf_saida, qtd_bezerros,
      consumo_meta_porcentagem_pesovivo, rc_final, peso_venda_meta_arroba,
      margem_lucro_percent, preco_custo_reais_arroba, preco_custo_cab,
      preco_venda_projetado_reais_arroba, preco_venda_sugerido_cab, rc_atual,
      peso_vivo_atual_arroba_cab, producao_atual_arroba_cab, producao_projetada_arroba_cab,
      preco_entrada_reais_arroba, faturamento_projetado_reais_lote_categoria,
      venda_total_arroba_lote_categoria, agio_percent, custo_frete_reais_cab,
      custo_comissao_reais_cab, custo_sanidade_reais_cab,
      custo_identificacao_rastreabilidade_reais_cab, custo_total_entrada_reais_cab,
      custo_total_entrada_reais_lote, data_ajuste_peso, categoria_origem_id
    ) VALUES (
      v_novo_lote_id, v_cat_origem.categoria, v_cabecas, v_cabecas,
      v_cat_origem.data_pesagem, v_cat_origem.peso_entrada_kg_cab, v_cat_origem.peso_entrada_arrobas,
      v_cat_origem.gmd, v_cat_origem.periodo, v_cat_origem.rc_inicial,
      v_cat_origem.peso_vivo_atual_kg_cab, v_cat_origem.peso_vivo_meta_kg_cab, v_cat_origem.dias_restantes_meta,
      v_cat_origem.estrategia_nutricional, v_cat_origem.raca, v_cat_origem.sexo, v_cat_origem.idade, true,
      0, 0, 0, v_cabecas, 0, v_cat_origem.qtd_bezerros,
      v_cat_origem.consumo_meta_porcentagem_pesovivo, v_cat_origem.rc_final, v_cat_origem.peso_venda_meta_arroba,
      v_cat_origem.margem_lucro_percent, v_cat_origem.preco_custo_reais_arroba, v_cat_origem.preco_custo_cab,
      v_cat_origem.preco_venda_projetado_reais_arroba, v_cat_origem.preco_venda_sugerido_cab, v_cat_origem.rc_atual,
      v_cat_origem.peso_vivo_atual_arroba_cab, v_cat_origem.producao_atual_arroba_cab, v_cat_origem.producao_projetada_arroba_cab,
      v_cat_origem.preco_entrada_reais_arroba, v_cat_origem.faturamento_projetado_reais_lote_categoria,
      v_cat_origem.venda_total_arroba_lote_categoria, v_cat_origem.agio_percent, v_cat_origem.custo_frete_reais_cab,
      v_cat_origem.custo_comissao_reais_cab, v_cat_origem.custo_sanidade_reais_cab,
      v_cat_origem.custo_identificacao_rastreabilidade_reais_cab, v_cat_origem.custo_total_entrada_reais_cab,
      v_cat_origem.custo_total_entrada_reais_lote, v_cat_origem.data_ajuste_peso, NULL
    );
  END LOOP;

  IF v_is_total THEN
    UPDATE lotes SET ativo = false, n_cabecas = 0, numero_cabecas = 0, updated_at = now()
    WHERE id = p_lote_origem_id;
    UPDATE lote_categorias SET ativo = false, quant_atual = 0, updated_at = now()
    WHERE lote_id = p_lote_origem_id AND ativo = true;
  ELSE
    FOR v_cat_item IN SELECT * FROM jsonb_array_elements(p_categorias) LOOP
      v_categoria := v_cat_item->>'categoria';
      v_cabecas := (v_cat_item->>'numero_cabecas')::int;
      UPDATE lote_categorias
      SET quant_atual = quant_atual - v_cabecas,
          transf_saida = transf_saida + v_cabecas,
          updated_at = now()
      WHERE lote_id = p_lote_origem_id
        AND LOWER(categoria) = LOWER(v_categoria)
        AND ativo = true;
    END LOOP;
    UPDATE lotes
    SET n_cabecas = v_total_restante,
        numero_cabecas = v_total_restante,
        updated_at = now()
    WHERE id = p_lote_origem_id;
  END IF;

  v_categorias_nomes := '';
  FOR v_cat_item IN SELECT * FROM jsonb_array_elements(p_categorias) LOOP
    IF v_categorias_nomes <> '' THEN v_categorias_nomes := v_categorias_nomes || ', '; END IF;
    v_categorias_nomes := v_categorias_nomes || (v_cat_item->>'categoria') || ': ' || (v_cat_item->>'numero_cabecas') || ' cabecas';
  END LOOP;

  v_observacao_saida := 'Transferencia para ' || v_fazenda_destino.nome || '. Lote criado: ' || v_novo_lote_nome || '.';
  v_observacao_entrada := 'Transferencia recebida de ' || v_fazenda_origem.nome || '. Lote origem: ' || v_lote.nome || '.';

  INSERT INTO registros_movimentacao (
    fazenda_id, data, lote_origem, lote_origem_id,
    destino, lote_destino_id,
    numero_cabecas, categoria,
    motivo_movimentacao, subtipo,
    causa_observacao, responsavel,
    fazenda_destino_id,
    sync_status, version
  ) VALUES (
    v_fazenda_origem.id,
    v_data_mov,
    v_lote.nome,
    p_lote_origem_id,
    v_novo_lote_nome,
    v_novo_lote_id,
    v_total_transferir,
    v_categorias_nomes,
    'Transferencia'::tipo_movimentacao_motivo,
    'Saida'::tipo_movimentacao_subtipo,
    v_observacao_saida,
    p_nome_usuario,
    p_fazenda_destino_id,
    'synced',
    1
  );

  INSERT INTO registros_movimentacao (
    fazenda_id, data, lote_origem, lote_origem_id,
    destino, lote_destino_id,
    numero_cabecas, categoria,
    motivo_movimentacao, subtipo,
    causa_observacao, responsavel,
    fazenda_destino_id,
    sync_status, version
  ) VALUES (
    v_fazenda_destino.id,
    v_data_mov,
    v_lote.nome,
    p_lote_origem_id,
    v_novo_lote_nome,
    v_novo_lote_id,
    v_total_transferir,
    v_categorias_nomes,
    'Transferencia'::tipo_movimentacao_motivo,
    'Entrada'::tipo_movimentacao_subtipo,
    v_observacao_entrada,
    p_nome_usuario,
    p_fazenda_destino_id,
    'synced',
    1
  );

  FOR v_controller IN
    SELECT u.id FROM usuarios u
    JOIN usuario_fazenda uf ON u.id = uf.usuario_id
    WHERE uf.fazenda_id = v_fazenda_destino.id
      AND uf.ativo = true
      AND uf.papel IN ('admin', 'controller')
      AND u.email NOT LIKE '%@gestaup.internal%'
  LOOP
    INSERT INTO notificacoes (usuario_id, fazenda_id, tipo, titulo, mensagem, acao_url, acao_label, dados_jsonb)
    VALUES (
      v_controller.id,
      v_fazenda_destino.id,
      'info',
      'Lote recebido por transferencia: ' || v_novo_lote_nome,
      'Lote "' || v_lote.nome || '" recebido da fazenda ' || v_fazenda_origem.nome || ' por transferencia. Categorias: ' || v_categorias_nomes || '. Total: ' || v_total_transferir || ' cabecas.',
      '/controller/lotes',
      'Ver lotes',
      jsonb_build_object(
        'tipo_transferencia', 'lote_recebido',
        'lote_origem_id', p_lote_origem_id,
        'lote_destino_id', v_novo_lote_id,
        'lote_nome', v_novo_lote_nome,
        'fazenda_origem_id', v_fazenda_origem.id,
        'fazenda_origem_nome', v_fazenda_origem.nome,
        'fazenda_destino_id', p_fazenda_destino_id,
        'categorias', p_categorias,
        'total_cabecas', v_total_transferir,
        'transferencia_total', v_is_total
      )
    );
  END LOOP;

  FOR v_controller IN
    SELECT u.id FROM usuarios u
    JOIN usuario_fazenda uf ON u.id = uf.usuario_id
    WHERE uf.fazenda_id = v_fazenda_origem.id
      AND uf.ativo = true
      AND uf.papel IN ('admin', 'controller')
      AND u.email NOT LIKE '%@gestaup.internal%'
  LOOP
    INSERT INTO notificacoes (usuario_id, fazenda_id, tipo, titulo, mensagem, acao_url, acao_label, dados_jsonb)
    VALUES (
      v_controller.id,
      v_fazenda_origem.id,
      'info',
      'Lote transferido para ' || v_fazenda_destino.nome,
      'Lote "' || v_lote.nome || '" transferido para a fazenda ' || v_fazenda_destino.nome || '. Categorias: ' || v_categorias_nomes || '. Total: ' || v_total_transferir || ' cabecas.' || CASE WHEN v_is_total THEN ' Lote inativado na origem.' ELSE ' Lote permanece ativo com ' || v_total_restante || ' cabecas.' END,
      '/controller/lotes',
      'Ver lotes',
      jsonb_build_object(
        'tipo_transferencia', 'lote_enviado',
        'lote_origem_id', p_lote_origem_id,
        'lote_destino_id', v_novo_lote_id,
        'lote_nome', v_lote.nome,
        'fazenda_origem_id', v_fazenda_origem.id,
        'fazenda_destino_id', p_fazenda_destino_id,
        'fazenda_destino_nome', v_fazenda_destino.nome,
        'categorias', p_categorias,
        'total_cabecas', v_total_transferir,
        'transferencia_total', v_is_total
      )
    );
  END LOOP;

  v_result := jsonb_build_object(
    'success', true,
    'lote_destino_id', v_novo_lote_id,
    'lote_destino_nome', v_novo_lote_nome,
    'fazenda_destino_nome', v_fazenda_destino.nome,
    'total_cabecas', v_total_transferir,
    'transferencia_total', v_is_total
  );

  RETURN v_result;
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.aprovar_solicitacao_novo_lote(p_solicitacao_id uuid, p_dados_lote_editado jsonb, p_categorias_editadas jsonb, p_usuario_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.rejeitar_solicitacao_novo_lote(p_solicitacao_id uuid, p_motivo text, p_usuario_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_sol RECORD;
BEGIN
  SELECT * INTO v_sol FROM solicitacoes_novo_lote WHERE id = p_solicitacao_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Solicitação não encontrada'); END IF;
  IF v_sol.status <> 'pendente' THEN RETURN jsonb_build_object('success',false,'error','Solicitação não está pendente'); END IF;
  UPDATE solicitacoes_novo_lote SET status = 'rejeitada', rejeitada_at = now(), rejeitada_by = p_usuario_id, motivo_rejeicao = NULLIF(TRIM(COALESCE(p_motivo,'')),''), updated_at = now() WHERE id = p_solicitacao_id;
  RETURN jsonb_build_object('success',true,'solicitacao_id',p_solicitacao_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.corrigir_peso_categoria(p_lote_categoria_id uuid, p_peso_novo_kg_cab numeric, p_data_pesagem date, p_motivo text DEFAULT NULL::text, p_usuario_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lote_id uuid;
  v_fazenda_id uuid;
  v_peso_anterior numeric;
BEGIN
  IF p_peso_novo_kg_cab IS NULL OR p_peso_novo_kg_cab <= 0 THEN
    RAISE EXCEPTION 'Peso novo deve ser positivo';
  END IF;
  IF p_data_pesagem IS NULL THEN
    RAISE EXCEPTION 'Data da pesagem é obrigatória';
  END IF;
  IF p_data_pesagem > CURRENT_DATE THEN
    RAISE EXCEPTION 'Data da pesagem não pode ser futura';
  END IF;

  SELECT lc.lote_id, l.fazenda_id, lc.peso_vivo_atual_kg_cab
  INTO v_lote_id, v_fazenda_id, v_peso_anterior
  FROM lote_categorias lc
  JOIN lotes l ON l.id = lc.lote_id
  WHERE lc.id = p_lote_categoria_id
    AND lc.ativo = true
    AND lc.data_fim IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria ativa não encontrada';
  END IF;

  INSERT INTO peso_correcoes (
    fazenda_id, lote_id, lote_categoria_id,
    peso_anterior_kg_cab, peso_novo_kg_cab, data_pesagem, motivo, usuario_id
  ) VALUES (
    v_fazenda_id, v_lote_id, p_lote_categoria_id,
    COALESCE(v_peso_anterior, 0), p_peso_novo_kg_cab, p_data_pesagem, p_motivo, p_usuario_id
  );

  UPDATE lote_categorias
  SET peso_vivo_atual_kg_cab = p_peso_novo_kg_cab,
      data_ajuste_peso = p_data_pesagem
  WHERE id = p_lote_categoria_id;
  -- trigger_recalc_peso_lote_cat dispara automaticamente (AFTER UPDATE OF
  -- data_ajuste_peso, peso_vivo_atual_kg_cab) com p_ajuste_manual=true
  -- (data_ajuste_peso mudou), recalculando registros_suplementacao.peso_vivo_kg
  -- e em cascata consumo_pct_pv.
END;
$function$;

CREATE OR REPLACE FUNCTION public.excluir_registro_abastecimento(p_id uuid, p_fazenda_id uuid, p_usuario_id uuid, p_usuario_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_controller boolean;
BEGIN
  -- Configurar contexto de auditoria
  PERFORM set_config('app.current_user_id', p_usuario_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(p_usuario_email, ''), true);

  -- Verificar permissão: apenas controller+ pode excluir
  SELECT EXISTS(
    SELECT 1 FROM usuario_fazenda uf
    WHERE uf.usuario_id = p_usuario_id
      AND uf.fazenda_id = p_fazenda_id
      AND uf.papel IN ('admin', 'controller')
      AND uf.ativo = true
  ) INTO v_is_controller;

  IF NOT v_is_controller THEN
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem excluir registros de abastecimento';
  END IF;

  -- Soft-delete (trigger de auditoria dispara automaticamente e a
  -- trg_sync_baixa_abastecimento estorna a baixa de estoque vinculada)
  UPDATE registros_abastecimento
  SET deleted_at = NOW(), updated_at = NOW()
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado ou já excluído';
  END IF;

  RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.excluir_registro_entrada_insumos(p_id uuid, p_fazenda_id uuid, p_usuario_id uuid, p_usuario_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_controller boolean;
BEGIN
  -- Configurar contexto de auditoria
  PERFORM set_config('app.current_user_id', p_usuario_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(p_usuario_email, ''), true);

  -- Verificar permissão: apenas controller+ pode excluir
  SELECT EXISTS(
    SELECT 1 FROM usuario_fazenda uf
    WHERE uf.usuario_id = p_usuario_id
      AND uf.fazenda_id = p_fazenda_id
      AND uf.papel IN ('admin', 'controller')
      AND uf.ativo = true
  ) INTO v_is_controller;

  IF NOT v_is_controller THEN
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem excluir registros de entrada de insumos';
  END IF;

  -- Soft-delete do cabeçalho (trigger de auditoria dispara automaticamente)
  UPDATE registros_entrada_insumos
  SET deleted_at = NOW(), updated_at = NOW()
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado ou já excluído';
  END IF;

  -- Remover itens: o DELETE dispara trg_entrada_insumos_itens_mov, que
  -- soft-deleta as movimentações espelhadas e recalcula saldo/WAC
  DELETE FROM entrada_insumos_itens WHERE entrada_id = p_id;

  RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$function$;

-- Reabre (ACL original: EXECUTE implícito para PUBLIC)
GRANT EXECUTE ON FUNCTION public.update_quant_atual_with_data(uuid,character varying,character varying,character varying) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrar_plano_nutricional(uuid,uuid,text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_snapshot_entrada(uuid,uuid,text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encerrar_plano_nutricional(uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recategorizar_lote_categoria(uuid,text,boolean,uuid,uuid,text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_notificacoes_recategorizacao(uuid,uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_notificacoes_config(uuid,numeric,boolean,boolean) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_push_subscription(uuid,text,text,text,text,uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remover_push_subscription(text,text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transferir_lote_entre_fazendas(uuid,uuid,jsonb,text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encerrar_plano_lote(uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrar_plano_lote(uuid,uuid,text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_plano_lote(uuid,uuid,boolean) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprovar_solicitacao_novo_lote(uuid,jsonb,jsonb,uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rejeitar_solicitacao_novo_lote(uuid,text,uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corrigir_peso_categoria(uuid,numeric,date,text,uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_registro_abastecimento(uuid,uuid,uuid,text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_registro_entrada_insumos(uuid,uuid,uuid,text) TO PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.guard_w_fazenda(uuid);
DROP FUNCTION IF EXISTS public.guard_w_lote(uuid);
DROP FUNCTION IF EXISTS public.guard_w_lote_categoria(uuid);
DROP FUNCTION IF EXISTS public.guard_w_solicitacao(uuid);
DROP FUNCTION IF EXISTS public.guard_w_usuario(uuid);
DROP FUNCTION IF EXISTS public.guard_w_is_client();
