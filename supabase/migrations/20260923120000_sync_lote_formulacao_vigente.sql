-- ============================================================================
-- Trigger: manter lotes.formulacao_id sincronizado com o plano vigente
-- ============================================================================
-- Contexto: lotes.formulacao_id é uma coluna desnormalizada que deve sempre
-- refletir a formulação do plano vigente do lote (ativo = true, data_fim NULL).
-- As RPCs de plano (iniciar/encerrar/migrar) atualizam a coluna, mas escritas
-- diretas em planos_nutricionais (ou bugs antigos, como o form de lote que
-- sobrescrevia formulacao_id) deixam a coluna divergente.
--
-- A divergência tem efeito real: as triggers sync_gmd_lote_categorias e
-- repropagar_gmd_para_lotes propagam GMD às categorias usando
-- lotes.formulacao_id. Com o valor stale, a categoria evolui peso com GMD da
-- formulação errada (observado em produção: garrote a 1.450 quando a formulação
-- vigente define 0.400) ou deixa de receber atualizações de GMD.
--
-- Esta trigger recalcula o vigente a cada INSERT/UPDATE/DELETE em
-- planos_nutricionais e ajusta lotes.formulacao_id somente quando diverge
-- (guard IS DISTINCT FROM evita updates desnecessários, que disparariam
-- sync_gmd_lote_categorias e o audit log sem efeito prático).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_lote_formulacao_vigente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lote_id uuid;
  v_form_id uuid;
BEGIN
  -- Lotes afetados: NEW.lote_id (INSERT/UPDATE) e OLD.lote_id (UPDATE/DELETE,
  -- cobre o caso raro de um plano trocar de lote).
  FOR v_lote_id IN
    SELECT DISTINCT lote_id
    FROM (
      SELECT CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.lote_id END AS lote_id
      UNION ALL
      SELECT CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.lote_id END
    ) t
    WHERE lote_id IS NOT NULL
  LOOP
    SELECT pn.formulacao_id INTO v_form_id
    FROM public.planos_nutricionais pn
    WHERE pn.lote_id = v_lote_id
      AND pn.ativo = true
      AND pn.data_fim IS NULL
    ORDER BY pn.data_inicio DESC NULLS LAST, pn.ordem ASC
    LIMIT 1;

    -- Sem plano vigente: v_form_id fica NULL e a coluna é limpa,
    -- replicando o comportamento de encerrar_plano_lote sem próximo na fila.
    UPDATE public.lotes
    SET formulacao_id = v_form_id
    WHERE id = v_lote_id
      AND formulacao_id IS DISTINCT FROM v_form_id;
  END LOOP;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_planos_sync_lote_formulacao ON public.planos_nutricionais;
CREATE TRIGGER trg_planos_sync_lote_formulacao
AFTER INSERT OR UPDATE OR DELETE ON public.planos_nutricionais
FOR EACH ROW
EXECUTE FUNCTION public.sync_lote_formulacao_vigente();
