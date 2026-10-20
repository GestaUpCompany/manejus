-- ============================================================================
-- IATF (auditoria item 8): RPC para descartar fêmea do lote de protocolo (usada pelo PWA e pelo painel)
-- ============================================================================
-- Achado (20/10/2026): o PWA não tinha como tirar uma fêmea do protocolo (perdeu o implante, adoeceu...). A IA ia para ela até
-- o gestor descartá-la no painel, e com a escrita direta fechada ao peão (item 7) isso exige uma RPC.
-- Agora:
--   * descartar_femea_lote_protocolo(p_fazenda_id, p_lote_id, p_individuo_id, p_motivo): SECURITY DEFINER, com checagem de
--     acesso à fazenda; só lote "Em andamento"; idempotente (fêmea já descartada: não faz nada, para o reenvio da fila do
--     PWA); motivo vazio vira "Fora do protocolo". Se a fêmea era a última sem IA e as demais já foram inseminadas, o passo
--     de IA aberto é concluído (mesma regra do gatilho de baixa do item 3);
--   * essa regra vira a função interna iatf_concluir_ia_se_completa(p_fazenda_id, p_lote_id), sem EXECUTE para a API, usada
--     pela RPC e pelo gatilho trg_individuo_baixa_descarta_femea_iatf (que passa a chamá-la em vez de repetir o bloco).
-- Reativar fêmea continua direto pela tabela, só pela gestão (o gatilho do item 5 barra conflito com outro lote).
-- Rollback: supabase/rollbacks/20261020290000_iatf_descartar_femea_rpc_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.iatf_concluir_ia_se_completa(p_fazenda_id uuid, p_lote_id uuid)
RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tarefa uuid;
  v_data date;
BEGIN
  SELECT t.id INTO v_tarefa FROM public.lotes_protocolo_iatf_tarefas t
   WHERE t.lote_protocolo_id = p_lote_id AND t.fazenda_id = p_fazenda_id AND t.tipo = 'Inseminacao' AND t.feita_em IS NULL;
  IF v_tarefa IS NULL THEN RETURN; END IF;

  SELECT max(e.data) INTO v_data FROM public.eventos_reprodutivos e
   WHERE e.protocolo_lote_id = p_lote_id AND e.tipo = 'Inseminação' AND e.deleted_at IS NULL;
  IF v_data IS NULL THEN RETURN; END IF;

  -- Ainda há fêmea ativa (viva) sem IA: o passo continua aberto
  IF EXISTS (
    SELECT 1 FROM public.lotes_protocolo_iatf_femeas f
      JOIN public.individuos i ON i.id = f.individuo_id AND i.status = 'Vivo' AND i.deleted_at IS NULL
     WHERE f.lote_protocolo_id = p_lote_id AND f.status = 'Ativa'
       AND NOT EXISTS (
         SELECT 1 FROM public.eventos_reprodutivos e
          WHERE e.protocolo_lote_id = p_lote_id AND e.individuo_id = f.individuo_id AND e.tipo = 'Inseminação' AND e.deleted_at IS NULL
       )
  ) THEN
    RETURN;
  END IF;

  PERFORM public.marcar_tarefa_protocolo_iatf(p_fazenda_id, v_tarefa, v_data, 'Concluído ao sair a última fêmea sem IA', NULL, NULL);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.iatf_concluir_ia_se_completa(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- O gatilho de baixa (item 3) passa a usar a função interna
CREATE OR REPLACE FUNCTION public.trg_individuo_baixa_descarta_femea_iatf()
RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lote uuid;
  v_motivo text;
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
    PERFORM public.iatf_concluir_ia_se_completa(NEW.fazenda_id, v_lote);
  END LOOP;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.descartar_femea_lote_protocolo(
  p_fazenda_id uuid,
  p_lote_id uuid,
  p_individuo_id uuid,
  p_motivo text DEFAULT NULL
) RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_l record;
  v_f record;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.is_admin_user() OR public.caller_has_fazenda_access(p_fazenda_id)) THEN
    RAISE EXCEPTION 'Sem acesso à fazenda' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT l.id, l.status INTO v_l
  FROM public.lotes_protocolo_iatf l WHERE l.id = p_lote_id AND l.fazenda_id = p_fazenda_id AND l.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de protocolo não encontrado' USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT f.id, f.status INTO v_f
  FROM public.lotes_protocolo_iatf_femeas f
  WHERE f.lote_protocolo_id = p_lote_id AND f.individuo_id = p_individuo_id AND f.fazenda_id = p_fazenda_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fêmea não encontrada neste lote de protocolo' USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Reenvio da fila: já descartada, não há o que fazer
  IF v_f.status = 'Descartada' THEN
    RETURN;
  END IF;

  IF v_l.status <> 'Em andamento' THEN
    RAISE EXCEPTION 'O lote de protocolo não está em andamento' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.lotes_protocolo_iatf_femeas
     SET status = 'Descartada', motivo_descarte = COALESCE(NULLIF(btrim(p_motivo), ''), 'Fora do protocolo')
   WHERE id = v_f.id;

  -- Se era a última fêmea sem IA e as demais já foram inseminadas, o passo de IA aberto fica completo
  PERFORM public.iatf_concluir_ia_se_completa(p_fazenda_id, p_lote_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.descartar_femea_lote_protocolo(uuid, uuid, uuid, text) TO authenticated;
