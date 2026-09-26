-- ============================================================================
-- Fix: OS de transferência nunca saía de 'embarcada'
--
-- Na compra, a OS vai a 'recebida' pelo trigger de movimentação quando a
-- entrada sincroniza. Na transferência o laudo de recebimento NÃO gera
-- movimentação no sync (o crédito só acontece na conferência do controller),
-- então nada transitava a OS para 'recebida' e fechar_os_venda sempre falhava
-- com "Aguardando recebimento na fazenda de destino".
--
-- Este trigger marca a OS como 'recebida' assim que o primeiro laudo de
-- recebimento chega. Estorno já volta a OS para 'aberta' em estornar_baixa_os.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_os_recebimento_status_transferencia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
BEGIN
  UPDATE public.ordens_servico
  SET status = 'recebida', updated_at = now()
  WHERE id = NEW.os_id
    AND tipo = 'transferencia'
    AND status IN ('aberta', 'embarcada')
    AND deleted_at IS NULL;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_os_recebimento_status_transferencia ON public.os_recebimentos;
CREATE TRIGGER trg_os_recebimento_status_transferencia
  AFTER INSERT ON public.os_recebimentos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_os_recebimento_status_transferencia();
