-- Rollback da fase 2A do Infográfico Anual (Maternidade e Pastagens).
DROP FUNCTION IF EXISTS public.get_infografico_anual_maternidade(uuid, int);
DROP FUNCTION IF EXISTS public.get_infografico_anual_pastagens(uuid, int);
