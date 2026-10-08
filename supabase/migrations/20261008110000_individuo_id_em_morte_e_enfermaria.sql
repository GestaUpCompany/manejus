-- ============================================================================
-- Indivíduos / Fase 3b: vínculo de morte e enfermaria com o indivíduo
-- ============================================================================
-- Achado: registros_morte e registros_enfermaria só guardam brinco/chip em texto. Não há como ver a
-- morte ou o tratamento de um animal na ficha dele, e uma morte nunca muda o status do indivíduo.
--
-- Ação:
--  1) Coluna `individuo_id` (uuid, ANULÁVEL, FK com ON DELETE SET NULL) nas duas tabelas + índice parcial.
--  2) Gatilho em registros_morte: ao inserir uma morte COM individuo_id, marca o indivíduo como Morto
--     (status, data_saida, motivo_saida) se ele estava Vivo. Ao excluir (soft-delete) a morte, desfaz
--     isso apenas se o indivíduo ainda estiver Morto por motivo 'Morte'.
--
-- Retrocompatível com PWAs antigos: eles não enviam individuo_id, então o gatilho não faz nada para
-- eles (NULL). Nenhum registro existente é alterado (SEM backfill; ele altera dados de outras fazendas
-- e exige autorização explícita).
-- Pré-requisito: 20261008100000 (colunas data_saida/motivo_saida).
-- O gatilho de morte existente (trigger_update_quant_atual_morte, contadores do lote) não é alterado.
-- Rollback: supabase/rollbacks/20261008110000_individuo_id_em_morte_e_enfermaria_rollback.sql
-- ============================================================================

ALTER TABLE public.registros_morte
  ADD COLUMN IF NOT EXISTS individuo_id uuid REFERENCES public.individuos(id) ON DELETE SET NULL;

ALTER TABLE public.registros_enfermaria
  ADD COLUMN IF NOT EXISTS individuo_id uuid REFERENCES public.individuos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_registros_morte_individuo_id
  ON public.registros_morte (individuo_id) WHERE individuo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_registros_enfermaria_individuo_id
  ON public.registros_enfermaria (individuo_id) WHERE individuo_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trg_registros_morte_baixa_individuo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
BEGIN
  IF NEW.individuo_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NULL THEN
      UPDATE public.individuos
      SET status = 'Morto',
          data_saida = (NEW.data AT TIME ZONE 'America/Cuiaba')::date,
          motivo_saida = 'Morte',
          updated_at = now()
      WHERE id = NEW.individuo_id
        AND fazenda_id = NEW.fazenda_id
        AND deleted_at IS NULL
        AND status = 'Vivo';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Estorno: morte excluída devolve o animal a Vivo, só se foi esta morte que o baixou
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE public.individuos
      SET status = 'Vivo',
          data_saida = NULL,
          motivo_saida = NULL,
          destino_saida = NULL,
          updated_at = now()
      WHERE id = NEW.individuo_id
        AND fazenda_id = NEW.fazenda_id
        AND status = 'Morto'
        AND motivo_saida = 'Morte';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trg_registros_morte_baixa_individuo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_registros_morte_baixa_individuo ON public.registros_morte;
CREATE TRIGGER trg_registros_morte_baixa_individuo
  AFTER INSERT OR UPDATE OF deleted_at ON public.registros_morte
  FOR EACH ROW EXECUTE FUNCTION public.trg_registros_morte_baixa_individuo();
