-- Rollback da fase 2C do Infográfico Anual (Almoxarifado, Farmácia e Cantina).
DROP FUNCTION IF EXISTS public.get_infografico_anual_almoxarifado(uuid, int);
DROP FUNCTION IF EXISTS public.get_infografico_anual_farmacia(uuid, int);
DROP FUNCTION IF EXISTS public.get_infografico_anual_cantina(uuid, int);
