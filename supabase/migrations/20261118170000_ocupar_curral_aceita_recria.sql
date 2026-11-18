-- Recria passa a aceitar curral: _ocupar_curral aceita Recria além de Confinamento, TIP e Sequestro.
-- Corpo copiado de 20261010104000_registros_curral.sql (linhas 33-193); única mudança é a lista de sistemas.

CREATE OR REPLACE FUNCTION public._ocupar_curral(
  p_curral_id uuid,
  p_lote_id uuid,
  p_data_entrada date DEFAULT NULL,
  p_kg_mn_dia_dia1 numeric DEFAULT NULL,
  p_data_hora timestamptz DEFAULT NULL
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
  v_encerradas uuid[];
  v_conflito record;
  v_ocupacao_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(p_curral_id::text, p_lote_id::text), 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(GREATEST(p_curral_id::text, p_lote_id::text), 0));

  SELECT c.id, c.fazenda_id, c.lote_id, c.ativo, c.deleted_at
    INTO v_curral
    FROM public.currais c
   WHERE c.id = p_curral_id;

  IF NOT FOUND OR v_curral.ativo IS DISTINCT FROM true OR v_curral.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Curral não encontrado ou inativo');
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

  IF v_lote.sistema_producao NOT IN ('Confinamento', 'TIP', 'Sequestro', 'Recria') THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Sistema de produção do lote (' || COALESCE(v_lote.sistema_producao, 'indefinido') || ') não utiliza curral');
  END IF;

  SELECT COALESCE(f.timezone, 'America/Cuiaba') INTO v_tz FROM public.fazendas f WHERE f.id = v_curral.fazenda_id;
  v_tz := COALESCE(v_tz, 'America/Cuiaba');
  v_hoje := (now() AT TIME ZONE v_tz)::date;
  v_data := COALESCE(p_data_entrada, v_hoje);

  IF v_data > v_hoje THEN
    RETURN jsonb_build_object('success', false, 'error', 'A data de entrada não pode ser futura');
  END IF;

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
    UPDATE public.currais
       SET lote_id = NULL, updated_at = now()
     WHERE lote_id = p_lote_id
       AND id <> p_curral_id
       AND deleted_at IS NULL;

    UPDATE public.currais
       SET lote_id = p_lote_id, updated_at = now()
     WHERE id = p_curral_id;

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

    -- Ocupacoes realmente encerradas por esta troca (as removidas por "ceder o dia" nao existem mais).
    SELECT array_agg(h.id) INTO v_encerradas
      FROM public.lote_curral_historico h
     WHERE h.id = ANY(COALESCE(v_antigas, '{}'::uuid[]))
       AND h.data_final IS NOT NULL;

    -- Hora exata da troca: do registro do peao; senao, inicio do dia da entrada retroativa.
    IF p_data_hora IS NOT NULL OR v_data < v_hoje THEN
      UPDATE public.lote_curral_historico
         SET data_hora_entrada = COALESCE(p_data_hora, (v_data::timestamp AT TIME ZONE v_tz)),
             updated_at = now()
       WHERE id = v_ocupacao_id;

      UPDATE public.lote_curral_historico
         SET data_hora_saida = COALESCE(p_data_hora, (v_data::timestamp AT TIME ZONE v_tz)),
             updated_at = now()
       WHERE id = ANY(COALESCE(v_encerradas, '{}'::uuid[]));
    END IF;
  EXCEPTION
    WHEN exclusion_violation OR unique_violation THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Conflito de ocupação: o curral ou o lote já está ocupado nesse período');
  END;

  RETURN jsonb_build_object(
    'success', true,
    'ocupacao_id', v_ocupacao_id,
    'encerradas', to_jsonb(COALESCE(v_encerradas, '{}'::uuid[]))
  );
END;
$$;
