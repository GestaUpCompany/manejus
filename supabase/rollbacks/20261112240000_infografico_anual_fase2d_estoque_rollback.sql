-- Rollback da fase 2D do Infográfico Anual (Estoque de Insumos e Formulações + refeições da Cantina).
-- Remove o invólucro da Cantina e devolve à função de estoque o nome original da fase 2C.
DROP FUNCTION IF EXISTS public.get_infografico_anual_cantina(uuid, int);
ALTER FUNCTION public.get_infografico_anual_cantina_estoque(uuid, int) RENAME TO get_infografico_anual_cantina;
DROP FUNCTION IF EXISTS public.get_infografico_anual_estoque(uuid, int);
