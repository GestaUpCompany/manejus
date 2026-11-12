-- Rollback da fase 2B do Infográfico Anual (Bebedouros).
DROP FUNCTION IF EXISTS public.get_infografico_anual_bebedouros(uuid, int);
