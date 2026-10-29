-- Rollback de 20261028110000_detalhar_tropa_exige_fazenda.sql
-- Remove a versão com p_fazenda_id. A versão (uuid, jsonb) de 20261028100000 deve ser recriada reaplicando
-- o bloco CREATE FUNCTION daquele arquivo; o rollback de 20261028100000 remove a função por completo.
DROP FUNCTION IF EXISTS public.detalhar_tropa(uuid, uuid, jsonb);
