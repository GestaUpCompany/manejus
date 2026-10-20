-- ============================================================================
-- Fix da migration 20261020110000: trg_lotes_protocolo_iatf_filho_validar falhava nas TAREFAS
-- ============================================================================
-- A função é compartilhada por fêmeas e tarefas e testava `TG_TABLE_NAME = '...femeas' AND (... NEW.individuo_id ...)`
-- numa só expressão. O plpgsql não garante curto-circuito, então na tabela de tarefas (sem individuo_id) o NEW.individuo_id
-- era avaliado e dava 42703, e criar_lote_protocolo_iatf falhava ao gerar as tarefas. Corrigido com IFs aninhados.
-- Só reescreve a função (CREATE OR REPLACE); nenhum dado nem tabela é tocado (as tabelas estão vazias).
-- Rollback: supabase/rollbacks/20261020120000_fix_gatilho_filho_lotes_protocolo_iatf_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_lotes_protocolo_iatf_filho_validar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_faz uuid;
  v_ind record;
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
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trg_lotes_protocolo_iatf_filho_validar() FROM PUBLIC, anon, authenticated;
