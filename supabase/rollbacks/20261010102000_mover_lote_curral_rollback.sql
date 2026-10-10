-- Rollback de 20261010102000_mover_lote_curral.sql
DROP FUNCTION IF EXISTS public.mover_lote_curral(uuid, uuid, date, numeric);
