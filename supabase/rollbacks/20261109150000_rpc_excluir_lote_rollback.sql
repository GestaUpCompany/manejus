-- Rollback: remove a RPC excluir_lote. A exclusão volta a ser feita por UPDATE direto (que falha com 42501).

DROP FUNCTION IF EXISTS public.excluir_lote(uuid);
