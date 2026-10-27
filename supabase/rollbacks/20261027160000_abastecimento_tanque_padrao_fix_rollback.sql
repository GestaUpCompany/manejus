-- Rollback de 20261027160000_abastecimento_tanque_padrao_fix.sql
-- Remove o trigger e a função; o estado anterior (sem preenchimento de tanque) é
-- o da migration 20261027150000 desfeita pelo rollback 20261027150000_..._rollback.sql.
DROP TRIGGER IF EXISTS trg_abastecimento_tanque_padrao ON public.registros_abastecimento;
DROP FUNCTION IF EXISTS public.abastecimento_tanque_padrao();
