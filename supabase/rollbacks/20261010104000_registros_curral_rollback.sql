-- Rollback de 20261010104000_registros_curral.sql
-- Remove a tabela registros_curral (APAGA os registros de troca de curral do PWA!) e o nucleo
-- interno, e devolve trocar_lote_curral a versao autossuficiente de 20261010100000.
-- So rodar se o PWA que grava registros_curral ainda nao foi distribuido, ou depois de exportar
-- a tabela. As trocas ja aplicadas permanecem no historico (lote_curral_historico).

DROP TRIGGER IF EXISTS trg_registros_curral_mover_lote ON public.registros_curral;
DROP FUNCTION IF EXISTS public.processar_movimentacao_curral();
DROP TABLE IF EXISTS public.registros_curral;

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

DROP FUNCTION IF EXISTS public._ocupar_curral(uuid, uuid, date, numeric, timestamptz);
