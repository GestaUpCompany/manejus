-- ============================================================================
-- IATF (auditoria item 3): fêmea que sai do rebanho deixa de receber IA e de travar o passo de IA do lote de protocolo
-- ============================================================================
-- Achado em teste (20/10/2026): com a fêmea marcada Morto mas ainda "Ativa" no lote, registrar_ia_lote_protocolo gravou
-- Inseminação para ela. O gatilho de validação só confere o animal quando ele ENTRA no lote; depois disso o lote não
-- acompanhava a baixa. Com a IA por grupos (item 1), a fêmea morta ainda ativa também impediria o passo de IA de fechar.
-- Agora:
--   * gatilho em individuos: quando o animal deixa de estar Vivo (Morto, Abatido, Doado, Transferido, Venda Vivo) ou é
--     excluído, o vínculo dele em lotes de protocolo "Em andamento" passa a Descartada, com o motivo. Se era a última
--     fêmea sem IA, o passo de IA é concluído com a data da última IA (as demais já estavam inseminadas);
--   * registrar_ia_lote_protocolo só considera fêmea viva e não excluída (cobre vínculos anteriores ao gatilho): não
--     insemina fêmea baixada e não a conta como "ainda sem IA" para fechar o passo.
-- Lotes concluídos ou cancelados não são alterados (histórico). Reativar uma fêmea continua manual, pelo painel.
-- Rollback: supabase/rollbacks/20261020240000_iatf_femea_baixada_sai_do_lote_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_individuo_baixa_descarta_femea_iatf()
RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lote uuid;
  v_tarefa uuid;
  v_motivo text;
  v_data date;
BEGIN
  v_motivo := CASE
    WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN 'Animal excluído do cadastro'
    ELSE 'Saiu do rebanho (' || NEW.status || ')'
  END;

  FOR v_lote IN
    WITH d AS (
      UPDATE public.lotes_protocolo_iatf_femeas f
         SET status = 'Descartada', motivo_descarte = v_motivo
        FROM public.lotes_protocolo_iatf l
       WHERE f.individuo_id = NEW.id AND f.status = 'Ativa'
         AND l.id = f.lote_protocolo_id AND l.deleted_at IS NULL AND l.status = 'Em andamento'
      RETURNING f.lote_protocolo_id
    )
    SELECT DISTINCT lote_protocolo_id FROM d
  LOOP
    -- Se ela era a última fêmea sem IA, o passo de IA aberto passa a estar completo
    SELECT t.id INTO v_tarefa FROM public.lotes_protocolo_iatf_tarefas t
     WHERE t.lote_protocolo_id = v_lote AND t.tipo = 'Inseminacao' AND t.feita_em IS NULL;
    CONTINUE WHEN v_tarefa IS NULL;

    SELECT max(e.data) INTO v_data FROM public.eventos_reprodutivos e
     WHERE e.protocolo_lote_id = v_lote AND e.tipo = 'Inseminação' AND e.deleted_at IS NULL;
    CONTINUE WHEN v_data IS NULL;

    IF NOT EXISTS (
      SELECT 1 FROM public.lotes_protocolo_iatf_femeas f
        JOIN public.individuos i ON i.id = f.individuo_id AND i.status = 'Vivo' AND i.deleted_at IS NULL
       WHERE f.lote_protocolo_id = v_lote AND f.status = 'Ativa'
         AND NOT EXISTS (
           SELECT 1 FROM public.eventos_reprodutivos e
            WHERE e.protocolo_lote_id = v_lote AND e.individuo_id = f.individuo_id AND e.tipo = 'Inseminação' AND e.deleted_at IS NULL
         )
    ) THEN
      PERFORM public.marcar_tarefa_protocolo_iatf(NEW.fazenda_id, v_tarefa, v_data, 'Concluído ao sair a última fêmea sem IA', NULL, NULL);
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_individuo_baixa_descarta_femea_iatf ON public.individuos;
CREATE TRIGGER trg_individuo_baixa_descarta_femea_iatf
  AFTER UPDATE OF status, deleted_at ON public.individuos
  FOR EACH ROW
  WHEN (
    (OLD.status = 'Vivo' AND NEW.status IS DISTINCT FROM 'Vivo')
    OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  )
  EXECUTE FUNCTION public.trg_individuo_baixa_descarta_femea_iatf();

-- registrar_ia_lote_protocolo: só fêmea viva e não excluída
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
  IF p_data > (now() AT TIME ZONE 'America/Cuiaba')::date THEN
    RAISE EXCEPTION 'A data de execução não pode ser futura' USING ERRCODE = 'check_violation';
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
