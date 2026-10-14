-- Rollback de 20261014130000_lote_desativado_libera_pasto_curral.sql
-- Remove o trigger e a funcao. Nao desfaz vinculos que ja tenham sido liberados (dado operacional).
DROP TRIGGER IF EXISTS trg_lote_desativado_libera_local ON public.lotes;
DROP FUNCTION IF EXISTS public.trg_lote_desativado_libera_local();
