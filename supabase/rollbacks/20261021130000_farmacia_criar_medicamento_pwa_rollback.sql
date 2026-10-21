-- Rollback de 20261021130000_farmacia_criar_medicamento_pwa.sql
-- Medicamentos já criados pela RPC permanecem no catálogo.
DROP FUNCTION IF EXISTS public.criar_medicamento_pwa(uuid, uuid, text, text, text, text, numeric, text);
