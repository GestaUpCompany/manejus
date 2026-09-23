-- ============================================================================
-- Fix: fn_set_gmd_bezerro_ao_pe sobrescrevia o GMD materializado pela dieta
-- creep (trg_lote_categoria_creep_integrity) em INSERTs de lote_categorias.
--
-- Ordem dos BEFORE INSERT triggers em lote_categorias é alfabética:
--   trg_lote_categoria_creep_integrity → trg_normalize_categoria_lowercase
--   → trg_set_gmd_bezerro_ao_pe
-- Como trg_set_gmd_bezerro_ao_pe dispara por último e setava NEW.gmd
-- incondicionalmente para o default (0.600/0.500), uma categoria ao pé criada
-- já vinculada a uma formulação creep (INSERT com formulacao_id) terminava com
-- o GMD default em vez do GMD da formulação creep.
--
-- Fix: só aplicar o default quando NEW.gmd IS NULL. Isso preserva, por ordem de
-- prioridade: (1) GMD materializado da formulação creep, (2) GMD informado
-- explicitamente no INSERT, e mantém o fallback default para os demais casos.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_set_gmd_bezerro_ao_pe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.gmd IS NULL THEN
    IF LOWER(unaccent(NEW.categoria)) ILIKE 'bezerro ao pe' THEN
      NEW.gmd := '0.600';
    ELSIF LOWER(unaccent(NEW.categoria)) ILIKE 'bezerra ao pe' THEN
      NEW.gmd := '0.500';
    END IF;
  END IF;
  RETURN NEW;
END;
$func$;
