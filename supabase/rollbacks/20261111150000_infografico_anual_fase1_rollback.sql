-- Rollback de 20261111150000_infografico_anual_fase1.sql
DROP FUNCTION IF EXISTS public.get_infografico_anual_combustivel(uuid, int);
DROP FUNCTION IF EXISTS public.get_infografico_anual_consumo(uuid, int);
DROP FUNCTION IF EXISTS public.get_infografico_anual_clima(uuid, int);
DROP FUNCTION IF EXISTS public.get_infografico_anual_morte(uuid, int);
DROP FUNCTION IF EXISTS public.get_infografico_anual_rodeio(uuid, int);
DROP FUNCTION IF EXISTS public._infografico_anual_periodo(int);
