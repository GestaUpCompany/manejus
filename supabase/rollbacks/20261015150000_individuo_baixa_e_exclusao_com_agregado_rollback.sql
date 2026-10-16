-- ROLLBACK de 20261015150000_individuo_baixa_e_exclusao_com_agregado.sql
-- NÃO fica em supabase/migrations/ de propósito. Só remove as funções.
-- Não desfaz dados: baixas e exclusões já feitas por elas permanecem (movimentações agregadas com
-- causa_observacao 'Baixa manual:%' e indivíduos com deleted_at). O painel volta a precisar da versão anterior
-- do hook (UPDATE direto em individuos) depois deste rollback.
DROP FUNCTION IF EXISTS public.baixar_individuo(uuid, uuid, text, date, text, text);
DROP FUNCTION IF EXISTS public.excluir_individuo(uuid, uuid);
