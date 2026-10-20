-- ============================================================================
-- Indivíduos / Fase 4 C2 (3/3): elo do evento reprodutivo com o lote de protocolo e registro da IA
-- ============================================================================
--   1) eventos_reprodutivos.protocolo_lote_id   coluna NOVA e nula (base da taxa de prenhez por protocolo)
--   2) trg_eventos_reprodutivos_protocolo       valida o elo: mesma fazenda e fêmea do lote. Gatilho SEPARADO: a função
--                                               trg_eventos_reprodutivos_validar não é alterada
--   3) registrar_ia_lote_protocolo              grava a Inseminação das fêmeas ativas do lote e marca a tarefa de IA
--
-- Retrocompatível: o PWA e o painel atuais não enviam protocolo_lote_id e continuam válidos. Fora de ordem: a IA é
-- gravada sem evento_cobertura_id, então não depende de evento anterior. A data da IA não pode ser futura (regra
-- que já vale para todo evento reprodutivo). Não mexe em quant_atual.
-- Rollback: supabase/rollbacks/20261020130000_eventos_reprodutivos_protocolo_lote_rollback.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Coluna do elo
-- ----------------------------------------------------------------------------
ALTER TABLE public.eventos_reprodutivos
  ADD COLUMN protocolo_lote_id uuid REFERENCES public.lotes_protocolo_iatf(id) ON DELETE SET NULL;

CREATE INDEX idx_eventos_reprodutivos_protocolo_lote
  ON public.eventos_reprodutivos (protocolo_lote_id) WHERE protocolo_lote_id IS NOT NULL AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2) Validação do elo (gatilho separado)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_eventos_reprodutivos_protocolo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.protocolo_lote_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Só confere quando o elo é novo ou mudou (editar/excluir o evento depois não revalida)
  IF TG_OP = 'UPDATE' AND NEW.protocolo_lote_id IS NOT DISTINCT FROM OLD.protocolo_lote_id
     AND NEW.individuo_id IS NOT DISTINCT FROM OLD.individuo_id THEN
    RETURN NEW;
  END IF;

  PERFORM 1
  FROM public.lotes_protocolo_iatf l
  JOIN public.lotes_protocolo_iatf_femeas f ON f.lote_protocolo_id = l.id
  WHERE l.id = NEW.protocolo_lote_id AND l.fazenda_id = NEW.fazenda_id AND l.deleted_at IS NULL
    AND f.individuo_id = NEW.individuo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A fêmea não pertence a este lote de protocolo (ou ele é de outra fazenda)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trg_eventos_reprodutivos_protocolo() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_eventos_reprodutivos_protocolo
  BEFORE INSERT OR UPDATE ON public.eventos_reprodutivos
  FOR EACH ROW EXECUTE FUNCTION public.trg_eventos_reprodutivos_protocolo();

-- ----------------------------------------------------------------------------
-- 3) Registrar a IA do lote
-- ----------------------------------------------------------------------------
-- p_individuos NULL = todas as fêmeas Ativas do lote; informado = só essas (têm de ser Ativas do lote).
-- Idempotente: com p_local_id, cada evento usa a chave `p_local_id:individuo_id`; reenviar não duplica.
-- Devolve quantas Inseminações foram gravadas agora.
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
  SELECT t.id, t.tipo, t.lote_protocolo_id INTO v_t
  FROM public.lotes_protocolo_iatf_tarefas t WHERE t.id = p_tarefa_id AND t.fazenda_id = p_fazenda_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada nesta fazenda' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_t.tipo <> 'Inseminacao' THEN
    RAISE EXCEPTION 'A tarefa não é o passo de Inseminação' USING ERRCODE = 'check_violation';
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
  ON CONFLICT (local_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  PERFORM public.marcar_tarefa_protocolo_iatf(p_fazenda_id, p_tarefa_id, p_data, p_observacao, p_tecnico, p_local_id);

  RETURN v_n;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.registrar_ia_lote_protocolo(uuid, uuid, date, text, text, text, uuid[], text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_ia_lote_protocolo(uuid, uuid, date, text, text, text, uuid[], text, text, text) TO authenticated, service_role;
