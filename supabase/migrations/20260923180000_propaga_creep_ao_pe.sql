-- ============================================================================
-- CREEP FEEDING — dieta única por lote para bezerro(a) ao pé
-- ============================================================================
-- Regra de negócio: bezerro ao pé e bezerra ao pé do mesmo lote recebem a
-- MESMA dieta creep. O vínculo continua em lote_categorias.formulacao_id por
-- categoria (o GMD é materializado por fn_lote_categoria_creep_integrity), mas
-- esta trigger mantém o invariante em qualquer caminho de escrita:
--   - UPDATE que define/troca/remove a creep de uma categoria ao pé propaga
--     para as demais categorias ao pé ativas do mesmo lote;
--   - INSERT de categoria ao pé sem formulacao_id herda a creep vigente do
--     lote; com formulacao_id, propaga para os irmãos (última escrita vence).
-- O UPDATE nos irmãos dispara esta mesma trigger, mas o WHERE IS DISTINCT FROM
-- garante que na segunda geração nenhuma linha difere, então a recursão termina.
CREATE OR REPLACE FUNCTION public.fn_propaga_creep_ao_pe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_calf boolean;
  v_sibling_form uuid;
BEGIN
  v_is_calf := lower(unaccent(trim(NEW.categoria))) IN ('bezerro ao pe', 'bezerra ao pe');
  IF NOT v_is_calf OR NEW.ativo IS DISTINCT FROM true OR NEW.data_fim IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.formulacao_id IS NULL THEN
    SELECT lc.formulacao_id INTO v_sibling_form
    FROM public.lote_categorias lc
    WHERE lc.lote_id = NEW.lote_id
      AND lc.id <> NEW.id
      AND lc.ativo = true
      AND lc.data_fim IS NULL
      AND lower(unaccent(trim(lc.categoria))) IN ('bezerro ao pe', 'bezerra ao pe')
      AND lc.formulacao_id IS NOT NULL
    LIMIT 1;
    IF v_sibling_form IS NOT NULL THEN
      UPDATE public.lote_categorias
      SET formulacao_id = v_sibling_form
      WHERE id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  UPDATE public.lote_categorias lc
  SET formulacao_id = NEW.formulacao_id
  WHERE lc.lote_id = NEW.lote_id
    AND lc.id <> NEW.id
    AND lc.ativo = true
    AND lc.data_fim IS NULL
    AND lower(unaccent(trim(lc.categoria))) IN ('bezerro ao pe', 'bezerra ao pe')
    AND lc.formulacao_id IS DISTINCT FROM NEW.formulacao_id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_propaga_creep_ao_pe ON public.lote_categorias;
CREATE TRIGGER trg_propaga_creep_ao_pe
  AFTER INSERT OR UPDATE OF formulacao_id ON public.lote_categorias
  FOR EACH ROW EXECUTE FUNCTION public.fn_propaga_creep_ao_pe();
