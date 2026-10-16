-- ============================================================================
-- Indivíduos / Fase 0.5: localização incerta quando o lote é movimentado só por contagem
-- ============================================================================
-- Problema: a operação do Manejus é por agregado (lote_categorias). Uma apartação/transferência registra
-- "m cabeças da categoria X saem do lote A para o lote B", sem dizer quais. Hoje nada atualiza o lote_atual dos
-- indivíduos identificados (a maioria das movimentações é parcial: 235 apartações, 1 a 241 cabeças cada).
--
-- Regra (decisão do usuário, 15/10/2026), para movimentações Saída/Entrevero lote -> lote, sem OS e sem
-- individuo_id, de uma categoria ativa da origem:
--   * a movimentação ESVAZIA a categoria da origem (quant_atual = 0): os identificados COM localização confirmada
--     acompanham (lote_atual = destino). Os já marcados como incertos continuam incertos: uma apartação anterior
--     pode tê-los levado para outro lote.
--   * a movimentação é PARCIAL: os identificados confirmados da origem viram "incertos"
--     (localizacao_incerta_desde = data da movimentação). Continuam no lote de origem até serem confirmados.
--   * estorno (soft-delete) da movimentação: os identificados confirmados da categoria na origem e no destino
--     viram incertos, porque o agregado mudou e não dá para saber onde cada um está.
-- Confirmação: pesagem com leitura de brinco/chip (migration seguinte), ou RPC confirmar_localizacao_individuos
-- (painel). A RPC só muda o lote de animais INCERTOS: mover um animal confirmado exige o evento agregado.
--
-- Não altera quant_atual nem calculate_quant_atual (o agregado continua sendo a verdade da contagem).
-- Fora do alcance: formato legado motivo 'Transferencia' (categoria composta em texto) e movimentações de OS.
-- Retrocompatível com o PWA: só coluna nova (nula) e gatilho no servidor. Sem backfill: todos começam confirmados.
-- Rollback: supabase/rollbacks/20261015190000_individuos_localizacao_incerta_rollback.sql
-- ============================================================================

ALTER TABLE public.individuos ADD COLUMN IF NOT EXISTS localizacao_incerta_desde date;

COMMENT ON COLUMN public.individuos.localizacao_incerta_desde IS
  'Data a partir da qual não se sabe se o animal ainda está no lote_atual (movimentação por contagem). NULL = localização confirmada.';

CREATE INDEX IF NOT EXISTS idx_individuos_localizacao_incerta
  ON public.individuos (fazenda_id, lote_atual)
  WHERE localizacao_incerta_desde IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.trg_movimentacao_propaga_individuos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_q_depois integer;
  v_data date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
  ELSIF NOT (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  IF NEW.os_id IS NOT NULL OR NEW.individuo_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.motivo_movimentacao::text NOT IN ('Saída', 'Entrevero') THEN
    RETURN NEW;
  END IF;
  IF NEW.lote_origem_id IS NULL OR NEW.lote_destino_id IS NULL OR NEW.lote_origem_id = NEW.lote_destino_id THEN
    RETURN NEW;
  END IF;
  IF NEW.categoria IS NULL OR COALESCE(NEW.numero_cabecas, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Categoria ativa na origem e lote da mesma fazenda (calculate_quant_atual devolve 0 sem categoria: não
  -- confundir com "lote esvaziado")
  IF NOT EXISTS (
    SELECT 1
    FROM public.lote_categorias lc
    JOIN public.lotes l ON l.id = lc.lote_id
    WHERE lc.lote_id = NEW.lote_origem_id
      AND l.fazenda_id = NEW.fazenda_id
      AND LOWER(lc.categoria) = LOWER(NEW.categoria)
      AND lc.ativo = true
  ) THEN
    RETURN NEW;
  END IF;

  v_data := (COALESCE(NEW.data, now()) AT TIME ZONE 'America/Cuiaba')::date;

  IF TG_OP = 'UPDATE' THEN
    -- Estorno: o agregado mudou e a localização individual deixou de ser conhecida
    UPDATE public.individuos
    SET localizacao_incerta_desde = (now() AT TIME ZONE 'America/Cuiaba')::date, updated_at = now()
    WHERE fazenda_id = NEW.fazenda_id
      AND deleted_at IS NULL
      AND status = 'Vivo'
      AND LOWER(categoria) = LOWER(NEW.categoria)
      AND lote_atual IN (NEW.lote_origem_id, NEW.lote_destino_id)
      AND localizacao_incerta_desde IS NULL;
    RETURN NEW;
  END IF;

  v_q_depois := public.calculate_quant_atual(NEW.lote_origem_id, NEW.categoria);

  IF v_q_depois = 0 THEN
    UPDATE public.individuos
    SET lote_atual = NEW.lote_destino_id, updated_at = now()
    WHERE fazenda_id = NEW.fazenda_id
      AND deleted_at IS NULL
      AND status = 'Vivo'
      AND lote_atual = NEW.lote_origem_id
      AND LOWER(categoria) = LOWER(NEW.categoria)
      AND localizacao_incerta_desde IS NULL;
  ELSE
    UPDATE public.individuos
    SET localizacao_incerta_desde = v_data, updated_at = now()
    WHERE fazenda_id = NEW.fazenda_id
      AND deleted_at IS NULL
      AND status = 'Vivo'
      AND lote_atual = NEW.lote_origem_id
      AND LOWER(categoria) = LOWER(NEW.categoria)
      AND localizacao_incerta_desde IS NULL;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trg_movimentacao_propaga_individuos() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_zz_movimentacao_propaga_individuos ON public.registros_movimentacao;
CREATE TRIGGER trigger_zz_movimentacao_propaga_individuos
  AFTER INSERT OR UPDATE OF deleted_at ON public.registros_movimentacao
  FOR EACH ROW EXECUTE FUNCTION public.trg_movimentacao_propaga_individuos();

-- Confirmação manual (painel): informa onde os animais incertos estão. Não gera movimentação agregada.
CREATE OR REPLACE FUNCTION public.confirmar_localizacao_individuos(
  p_fazenda_id uuid,
  p_lote_id uuid,
  p_individuo_ids uuid[]
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_atualizados integer;
  v_total integer := COALESCE(array_length(p_individuo_ids, 1), 0);
BEGIN
  IF public.caller_is_peao() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação restrita ao painel de gestão');
  END IF;
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda');
  END IF;
  IF v_total = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nenhum animal informado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lotes WHERE id = p_lote_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lote não encontrado nesta fazenda');
  END IF;

  -- Só animais com localização incerta (ou que já estão neste lote) mudam de lote aqui. Mover um animal
  -- confirmado para outro lote exige o evento agregado (apartação/transferência).
  UPDATE public.individuos
  SET lote_atual = p_lote_id,
      localizacao_incerta_desde = NULL,
      updated_at = now()
  WHERE id = ANY (p_individuo_ids)
    AND fazenda_id = p_fazenda_id
    AND deleted_at IS NULL
    AND status = 'Vivo'
    AND (localizacao_incerta_desde IS NOT NULL OR lote_atual IS NOT DISTINCT FROM p_lote_id);
  GET DIAGNOSTICS v_atualizados = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'atualizados', v_atualizados, 'ignorados', v_total - v_atualizados);
END;
$function$;

REVOKE ALL ON FUNCTION public.confirmar_localizacao_individuos(uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_localizacao_individuos(uuid, uuid, uuid[]) TO authenticated;
