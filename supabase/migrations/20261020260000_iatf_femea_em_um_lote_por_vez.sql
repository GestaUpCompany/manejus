-- ============================================================================
-- IATF (auditoria item 5): a mesma fêmea não fica ativa em dois lotes de protocolo em andamento ao mesmo tempo
-- ============================================================================
-- Achado em teste (20/10/2026): a mesma fêmea entrou em dois lotes "Em andamento" sem aviso. Duas IAs na mesma fêmea contam
-- duas tentativas no relatório de taxa de prenhez e duplicam alertas; na prática quase sempre é engano.
-- Agora:
--   * criar_lote_protocolo_iatf recusa fêmea que já está ATIVA em outro lote "Em andamento", dizendo quais e em que lote
--     ("Fêmea(s) já em outro lote de protocolo em andamento: BR-042 (lote "X"). Descarte-a(s) de lá ou cancele aquele lote");
--   * o gatilho de validação do vínculo também recusa (inserção direta e "Reativar" de fêmea descartada): rede de segurança;
--   * repasse legítimo continua livre: lote anterior Concluído ou Cancelado, ou a fêmea Descartada nele, não bloqueia.
-- Lotes que já têm a mesma fêmea ativa em dois lotes (dados anteriores a esta migration) não são alterados.
-- Só reescreve duas funções (mesmas assinaturas); nenhum dado nem tabela é tocado.
-- Rollback: supabase/rollbacks/20261020260000_iatf_femea_em_um_lote_por_vez_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.criar_lote_protocolo_iatf(
  p_fazenda_id uuid,
  p_protocolo_id uuid,
  p_nome text,
  p_data_d0 date,
  p_individuos uuid[],
  p_estacao_id uuid DEFAULT NULL,
  p_responsavel text DEFAULT NULL,
  p_local_id text DEFAULT NULL,
  p_origem text DEFAULT 'painel'
) RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_prot record;
  v_ids uuid[];
  v_conf text;
  v_nconf integer;
BEGIN
  -- Reenvio do mesmo lote (PWA futuro): devolve o que já existe
  IF p_local_id IS NOT NULL THEN
    SELECT l.id INTO v_id FROM public.lotes_protocolo_iatf l WHERE l.local_id = p_local_id;
    IF FOUND THEN RETURN v_id; END IF;
  END IF;

  IF p_nome IS NULL OR btrim(p_nome) = '' THEN
    RAISE EXCEPTION 'Informe o nome do lote' USING ERRCODE = 'check_violation';
  END IF;
  IF p_data_d0 IS NULL THEN
    RAISE EXCEPTION 'Informe o D0' USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.id, p.ativo INTO v_prot
  FROM public.protocolos_iatf p
  WHERE p.id = p_protocolo_id AND p.fazenda_id = p_fazenda_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Protocolo não encontrado nesta fazenda' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NOT v_prot.ativo THEN
    RAISE EXCEPTION 'O protocolo está inativo' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM public.protocolos_iatf_passos s WHERE s.protocolo_id = p_protocolo_id AND s.tipo = 'Inseminacao';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O protocolo precisa ter um passo de Inseminação' USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_ids FROM unnest(p_individuos) AS x WHERE x IS NOT NULL;
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos uma fêmea' USING ERRCODE = 'check_violation';
  END IF;

  -- Fêmea já ativa em outro lote de protocolo em andamento (a lista mostra até 5)
  SELECT count(*), string_agg(q.txt, ', ')
    INTO v_nconf, v_conf
  FROM (
    SELECT COALESCE(i.id_brinco, i.id_manejo, i.id_chip, 'sem identificação') || ' (lote "' || l.nome || '")' AS txt
    FROM public.lotes_protocolo_iatf_femeas f
    JOIN public.lotes_protocolo_iatf l ON l.id = f.lote_protocolo_id AND l.deleted_at IS NULL AND l.status = 'Em andamento'
    JOIN public.individuos i ON i.id = f.individuo_id
    WHERE f.status = 'Ativa' AND f.individuo_id = ANY (v_ids)
    ORDER BY 1
    LIMIT 5
  ) q;
  IF v_nconf > 0 THEN
    RAISE EXCEPTION 'Fêmea(s) já em outro lote de protocolo em andamento: %. Descarte-a(s) de lá ou cancele aquele lote', v_conf
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.lotes_protocolo_iatf (fazenda_id, protocolo_id, nome, data_d0, estacao_id, responsavel, local_id, origem)
  VALUES (p_fazenda_id, p_protocolo_id, btrim(p_nome), p_data_d0, p_estacao_id, NULLIF(btrim(p_responsavel), ''), p_local_id,
          CASE WHEN p_origem = 'pwa' THEN 'pwa' ELSE 'painel' END)
  RETURNING id INTO v_id;

  -- O gatilho valida sexo, vida e fazenda de cada fêmea
  INSERT INTO public.lotes_protocolo_iatf_femeas (lote_protocolo_id, fazenda_id, individuo_id)
  SELECT v_id, p_fazenda_id, x FROM unnest(v_ids) AS x;

  INSERT INTO public.lotes_protocolo_iatf_tarefas
    (lote_protocolo_id, fazenda_id, passo_id, dia, ordem, rotulo, tipo, medicamento_id, medicamento_nome, dose, data_prevista)
  SELECT v_id, p_fazenda_id, s.id, s.dia, s.ordem, s.rotulo, s.tipo, s.medicamento_id, s.medicamento_nome, s.dose,
         p_data_d0 + s.dia
  FROM public.protocolos_iatf_passos s
  WHERE s.protocolo_id = p_protocolo_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_lotes_protocolo_iatf_filho_validar()
RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_faz uuid;
  v_ind record;
  v_outro text;
BEGIN
  NEW.updated_at := now();

  SELECT l.fazenda_id INTO v_faz FROM public.lotes_protocolo_iatf l WHERE l.id = NEW.lote_protocolo_id;
  IF NOT FOUND OR v_faz <> NEW.fazenda_id THEN
    RAISE EXCEPTION 'Lote de protocolo inválido para esta fazenda' USING ERRCODE = 'check_violation';
  END IF;

  -- Só na fêmea: sexo, fazenda e vida do animal (descarte e edição posteriores não revalidam o animal)
  IF TG_TABLE_NAME = 'lotes_protocolo_iatf_femeas' THEN
    IF TG_OP = 'INSERT' OR NEW.individuo_id IS DISTINCT FROM OLD.individuo_id THEN
      SELECT i.sexo, i.fazenda_id, i.status INTO v_ind
      FROM public.individuos i WHERE i.id = NEW.individuo_id AND i.deleted_at IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Indivíduo não encontrado ou excluído' USING ERRCODE = 'foreign_key_violation';
      END IF;
      IF v_ind.fazenda_id <> NEW.fazenda_id THEN
        RAISE EXCEPTION 'O indivíduo pertence a outra fazenda' USING ERRCODE = 'check_violation';
      END IF;
      IF v_ind.sexo <> 'Fêmea' THEN
        RAISE EXCEPTION 'Protocolo de IATF só se aplica a fêmeas (indivíduo é %)', v_ind.sexo USING ERRCODE = 'check_violation';
      END IF;
      IF v_ind.status <> 'Vivo' THEN
        RAISE EXCEPTION 'A fêmea precisa estar viva (status %)', v_ind.status USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- Uma fêmea ativa por vez em lotes de protocolo em andamento (entrada no lote ou reativação de descartada)
    IF NEW.status = 'Ativa' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'Ativa' OR NEW.individuo_id IS DISTINCT FROM OLD.individuo_id) THEN
      SELECT l.nome INTO v_outro
      FROM public.lotes_protocolo_iatf_femeas f
      JOIN public.lotes_protocolo_iatf l ON l.id = f.lote_protocolo_id AND l.deleted_at IS NULL AND l.status = 'Em andamento'
      WHERE f.individuo_id = NEW.individuo_id AND f.status = 'Ativa' AND f.lote_protocolo_id <> NEW.lote_protocolo_id
      LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION 'A fêmea já está no lote de protocolo "%" em andamento', v_outro USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
