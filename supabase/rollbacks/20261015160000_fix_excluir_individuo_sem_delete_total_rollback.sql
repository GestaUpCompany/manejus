-- ROLLBACK de 20261015160000_fix_excluir_individuo_sem_delete_total.sql
-- NÃO fica em supabase/migrations/ de propósito.
-- A versão anterior de excluir_individuo (20261015150000) tinha um DELETE sem WHERE e falha sempre,
-- então não vale restaurá-la. Para remover a função inteira, use o rollback de 20261015150000.
DROP FUNCTION IF EXISTS public.excluir_individuo(uuid, uuid);
