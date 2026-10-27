-- Rollback de 20261027150000_abastecimento_tanque_padrao.sql
DROP TRIGGER IF EXISTS trg_abastecimento_tanque_padrao ON public.registros_abastecimento;
DROP FUNCTION IF EXISTS public.abastecimento_tanque_padrao();
