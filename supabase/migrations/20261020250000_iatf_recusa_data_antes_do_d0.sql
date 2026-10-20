-- ============================================================================
-- IATF (auditoria item 4): recusa data de execução anterior ao D0 do lote de protocolo
-- ============================================================================
-- Achado em teste (20/10/2026): marcar o D0 com data 30 dias antes do D0 e registrar IA 25 dias antes do D0 foram aceitos.
-- O relatório de taxa de prenhez limita o ciclo pela data da IA; uma IA anterior ao D0 cai fora do ciclo do protocolo e
-- entra no relatório fora de ordem.
-- Agora marcar_tarefa_protocolo_iatf (com data) e registrar_ia_lote_protocolo recusam data anterior ao D0 do lote, com a
-- mensagem "A data de execução não pode ser anterior ao D0 do lote (dd/mm/aaaa)". Passo executado ANTES da data prevista
-- (mas não antes do D0) continua permitido. Desfazer (data nula) não é afetado.
-- Só reescreve as duas funções (mesmas assinaturas); nenhum dado nem tabela é tocado.
-- Rollback: supabase/rollbacks/20261020250000_iatf_recusa_data_antes_do_d0_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.marcar_tarefa_protocolo_iatf(
  p_fazenda_id uuid,
  p_tarefa_id uuid,
  p_feita_em date,
  p_observacao text DEFAULT NULL,
  p_responsavel text DEFAULT NULL,
  p_local_id text DEFAULT NULL
) RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_t record;
  v_l record;
BEGIN
  SELECT t.id, t.tipo, t.lote_protocolo_id INTO v_t
  FROM public.lotes_protocolo_iatf_tarefas t WHERE t.id = p_tarefa_id AND t.fazenda_id = p_fazenda_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada nesta fazenda' USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT l.status, l.data_d0 INTO v_l FROM public.lotes_protocolo_iatf l
  WHERE l.id = v_t.lote_protocolo_id AND l.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de protocolo não encontrado' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_l.status = 'Cancelado' THEN
    RAISE EXCEPTION 'O lote está cancelado' USING ERRCODE = 'check_violation';
  END IF;

  IF p_feita_em IS NULL AND v_t.tipo = 'Inseminacao' THEN
    PERFORM public.desfazer_ia_lote_protocolo(p_fazenda_id, p_tarefa_id, NULL);
    RETURN;
  END IF;

  IF p_feita_em IS NOT NULL AND p_feita_em > (now() AT TIME ZONE 'America/Cuiaba')::date THEN
    RAISE EXCEPTION 'A data de execução não pode ser futura' USING ERRCODE = 'check_violation';
  END IF;
  IF p_feita_em IS NOT NULL AND p_feita_em < v_l.data_d0 THEN
    RAISE EXCEPTION 'A data de execução não pode ser anterior ao D0 do lote (%)', to_char(v_l.data_d0, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.lotes_protocolo_iatf_tarefas
     SET feita_em = p_feita_em,
         feita_por = CASE WHEN p_feita_em IS NULL THEN NULL ELSE NULLIF(btrim(p_responsavel), '') END,
         observacao = CASE WHEN p_feita_em IS NULL THEN observacao ELSE COALESCE(NULLIF(btrim(p_observacao), ''), observacao) END,
         local_id = CASE WHEN p_feita_em IS NULL THEN NULL ELSE COALESCE(NULLIF(btrim(p_local_id), ''), local_id) END,
         updated_at = now()
   WHERE id = p_tarefa_id;

  -- O lote conclui sozinho quando não resta tarefa pendente e reabre se uma marcação for desfeita
  UPDATE public.lotes_protocolo_iatf l
     SET status = CASE WHEN EXISTS (
           SELECT 1 FROM public.lotes_protocolo_iatf_tarefas t WHERE t.lote_protocolo_id = l.id AND t.feita_em IS NULL
         ) THEN 'Em andamento' ELSE 'Concluído' END
   WHERE l.id = v_t.lote_protocolo_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_ia_lote_protocolo(
  p_fazenda_id uuid,
  p_tarefa_id uuid,
  p_data date,
  p_touro_nome text DEFAULT NULL,
  p_semen_partida text DEFAULT NULL,
  p_tecnico text DEFAULT NULL,
  p_individuos uuid[] DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_local_id text DEFAULT NULL,
  p_origem text DEFAULT 'painel'
) RETURNS integer
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t record;
  v_l record;
  v_ids uuid[];
  v_pend uuid[];
  v_n integer;
  v_total integer;
  v_restam integer;
BEGIN
  SELECT t.id, t.tipo, t.lote_protocolo_id, t.feita_em INTO v_t
  FROM public.lotes_protocolo_iatf_tarefas t WHERE t.id = p_tarefa_id AND t.fazenda_id = p_fazenda_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada nesta fazenda' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_t.tipo <> 'Inseminacao' THEN
    RAISE EXCEPTION 'A tarefa não é o passo de Inseminação' USING ERRCODE = 'check_violation';
  END IF;

  -- Reenvio da mesma chamada (a fila offline do PWA reenvia até confirmar): já gravada, não repete nada
  IF p_local_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.eventos_reprodutivos e WHERE e.local_id LIKE (p_local_id || ':%')
  ) THEN
    RETURN 0;
  END IF;

  SELECT l.id, l.status, l.estacao_id, l.data_d0 INTO v_l
  FROM public.lotes_protocolo_iatf l WHERE l.id = v_t.lote_protocolo_id AND l.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de protocolo não encontrado' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_l.status = 'Cancelado' THEN
    RAISE EXCEPTION 'O lote está cancelado' USING ERRCODE = 'check_violation';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'Informe a data da inseminação' USING ERRCODE = 'check_violation';
  END IF;
  IF p_data > (now() AT TIME ZONE 'America/Cuiaba')::date THEN
    RAISE EXCEPTION 'A data de execução não pode ser futura' USING ERRCODE = 'check_violation';
  END IF;
  IF p_data < v_l.data_d0 THEN
    RAISE EXCEPTION 'A data de execução não pode ser anterior ao D0 do lote (%)', to_char(v_l.data_d0, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  -- Fêmea "ativa" no lote = vínculo Ativa E animal vivo e não excluído
  IF p_individuos IS NULL THEN
    SELECT COALESCE(array_agg(f.individuo_id), '{}') INTO v_ids
    FROM public.lotes_protocolo_iatf_femeas f
    JOIN public.individuos i ON i.id = f.individuo_id AND i.status = 'Vivo' AND i.deleted_at IS NULL
    WHERE f.lote_protocolo_id = v_l.id AND f.status = 'Ativa';
  ELSE
    SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_ids FROM unnest(p_individuos) AS x WHERE x IS NOT NULL;
    SELECT count(*) INTO v_total
    FROM public.lotes_protocolo_iatf_femeas f
    JOIN public.individuos i ON i.id = f.individuo_id AND i.status = 'Vivo' AND i.deleted_at IS NULL
    WHERE f.lote_protocolo_id = v_l.id AND f.status = 'Ativa' AND f.individuo_id = ANY (v_ids);
    IF v_total <> cardinality(v_ids) THEN
      RAISE EXCEPTION 'Há fêmea que não é ativa neste lote de protocolo' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Nenhuma fêmea ativa para inseminar' USING ERRCODE = 'check_violation';
  END IF;

  -- Só as fêmeas sem Inseminação ativa neste lote de protocolo entram (não duplica por reenvio ou por desfazer/refazer)
  SELECT COALESCE(array_agg(x), '{}') INTO v_pend
  FROM unnest(v_ids) AS x
  WHERE NOT EXISTS (
    SELECT 1 FROM public.eventos_reprodutivos e
    WHERE e.protocolo_lote_id = v_l.id AND e.individuo_id = x AND e.tipo = 'Inseminação' AND e.deleted_at IS NULL
  );

  IF cardinality(v_pend) = 0 THEN
    -- Passo já concluído e nada a gravar: mantém a recusa que o PWA e o painel já traduzem
    IF v_t.feita_em IS NOT NULL THEN
      RAISE EXCEPTION 'A inseminação deste lote já foi registrada em %', to_char(v_t.feita_em, 'DD/MM/YYYY')
        USING ERRCODE = 'check_violation';
    END IF;
    -- Passo aberto, fêmeas informadas já inseminadas e outras ainda sem IA: a chamada não teria efeito
    IF EXISTS (
      SELECT 1 FROM public.lotes_protocolo_iatf_femeas f
      JOIN public.individuos i ON i.id = f.individuo_id AND i.status = 'Vivo' AND i.deleted_at IS NULL
      WHERE f.lote_protocolo_id = v_l.id AND f.status = 'Ativa'
        AND NOT EXISTS (
          SELECT 1 FROM public.eventos_reprodutivos e
          WHERE e.protocolo_lote_id = v_l.id AND e.individuo_id = f.individuo_id AND e.tipo = 'Inseminação' AND e.deleted_at IS NULL
        )
    ) THEN
      RAISE EXCEPTION 'As fêmeas informadas já têm inseminação neste lote' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.eventos_reprodutivos
    (fazenda_id, individuo_id, tipo, data, estacao_id, touro_nome, semen_partida, tecnico, observacao, responsavel,
     protocolo_lote_id, local_id, origem)
  SELECT p_fazenda_id, x, 'Inseminação', p_data, v_l.estacao_id, NULLIF(btrim(p_touro_nome), ''),
         NULLIF(btrim(p_semen_partida), ''), NULLIF(btrim(p_tecnico), ''), NULLIF(btrim(p_observacao), ''),
         NULLIF(btrim(p_tecnico), ''), v_l.id,
         CASE WHEN p_local_id IS NULL THEN NULL ELSE p_local_id || ':' || x END,
         CASE WHEN p_origem = 'pwa' THEN 'pwa' ELSE 'painel' END
  FROM unnest(v_pend) AS x
  ON CONFLICT (local_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- A tarefa só é concluída quando todas as fêmeas ativas (vivas) do lote já têm Inseminação
  SELECT count(*) INTO v_restam
  FROM public.lotes_protocolo_iatf_femeas f
  JOIN public.individuos i ON i.id = f.individuo_id AND i.status = 'Vivo' AND i.deleted_at IS NULL
  WHERE f.lote_protocolo_id = v_l.id AND f.status = 'Ativa'
    AND NOT EXISTS (
      SELECT 1 FROM public.eventos_reprodutivos e
      WHERE e.protocolo_lote_id = v_l.id AND e.individuo_id = f.individuo_id AND e.tipo = 'Inseminação' AND e.deleted_at IS NULL
    );
  IF v_restam = 0 THEN
    PERFORM public.marcar_tarefa_protocolo_iatf(p_fazenda_id, p_tarefa_id, p_data, p_observacao, p_tecnico, p_local_id);
  END IF;

  RETURN v_n;
END;
$function$;
