-- ============================================================================
-- IATF (C2): registrar_ia_lote_protocolo não duplica a Inseminação da fêmea que já a tem no lote de protocolo
-- ============================================================================
-- Achado em teste (20/10/2026): desfazer o passo de IA e registrá-lo de novo pelo painel (que não envia local_id) gravava
-- uma segunda Inseminação para cada fêmea (2 fêmeas viraram 4 IAs). Agora só entram fêmeas sem Inseminação ativa no lote.
-- A tarefa continua sendo marcada, e a função devolve quantas Inseminações novas foram gravadas (0 se todas já existiam).
-- Só reescreve a função (mesma assinatura); nenhum dado nem tabela é tocado.
-- Rollback: supabase/rollbacks/20261020160000_registrar_ia_nao_duplica_por_lote_rollback.sql
-- ============================================================================

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
  v_n integer;
  v_total integer;
BEGIN
  SELECT t.id, t.tipo, t.lote_protocolo_id, t.feita_em, t.local_id INTO v_t
  FROM public.lotes_protocolo_iatf_tarefas t WHERE t.id = p_tarefa_id AND t.fazenda_id = p_fazenda_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada nesta fazenda' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_t.tipo <> 'Inseminacao' THEN
    RAISE EXCEPTION 'A tarefa não é o passo de Inseminação' USING ERRCODE = 'check_violation';
  END IF;
  -- Passo já feito: só o reenvio da mesma marcação passa (idempotência); outro registro duplicaria as inseminações
  IF v_t.feita_em IS NOT NULL AND (p_local_id IS NULL OR v_t.local_id IS DISTINCT FROM p_local_id) THEN
    RAISE EXCEPTION 'A inseminação deste lote já foi registrada em %', to_char(v_t.feita_em, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT l.id, l.status, l.estacao_id INTO v_l
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

  IF p_individuos IS NULL THEN
    SELECT COALESCE(array_agg(f.individuo_id), '{}') INTO v_ids
    FROM public.lotes_protocolo_iatf_femeas f WHERE f.lote_protocolo_id = v_l.id AND f.status = 'Ativa';
  ELSE
    SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_ids FROM unnest(p_individuos) AS x WHERE x IS NOT NULL;
    SELECT count(*) INTO v_total FROM public.lotes_protocolo_iatf_femeas f
    WHERE f.lote_protocolo_id = v_l.id AND f.status = 'Ativa' AND f.individuo_id = ANY (v_ids);
    IF v_total <> cardinality(v_ids) THEN
      RAISE EXCEPTION 'Há fêmea que não é ativa neste lote de protocolo' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Nenhuma fêmea ativa para inseminar' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.eventos_reprodutivos
    (fazenda_id, individuo_id, tipo, data, estacao_id, touro_nome, semen_partida, tecnico, observacao, responsavel,
     protocolo_lote_id, local_id, origem)
  SELECT p_fazenda_id, x, 'Inseminação', p_data, v_l.estacao_id, NULLIF(btrim(p_touro_nome), ''),
         NULLIF(btrim(p_semen_partida), ''), NULLIF(btrim(p_tecnico), ''), NULLIF(btrim(p_observacao), ''),
         NULLIF(btrim(p_tecnico), ''), v_l.id,
         CASE WHEN p_local_id IS NULL THEN NULL ELSE p_local_id || ':' || x END,
         CASE WHEN p_origem = 'pwa' THEN 'pwa' ELSE 'painel' END
  FROM unnest(v_ids) AS x
  -- Fêmea que já tem Inseminação ativa neste lote de protocolo não recebe outra (desfazer o passo e registrar de novo
  -- pelo painel, que não manda local_id, duplicaria). Para corrigir uma IA lançada errada, exclua-a na ficha da fêmea.
  WHERE NOT EXISTS (
    SELECT 1 FROM public.eventos_reprodutivos e
    WHERE e.protocolo_lote_id = v_l.id AND e.individuo_id = x AND e.tipo = 'Inseminação' AND e.deleted_at IS NULL
  )
  ON CONFLICT (local_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  PERFORM public.marcar_tarefa_protocolo_iatf(p_fazenda_id, p_tarefa_id, p_data, p_observacao, p_tecnico, p_local_id);

  RETURN v_n;
END;
$function$;
