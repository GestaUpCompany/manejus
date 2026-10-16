-- Rollback de 20261015220000: remove as funções novas (o front antigo grava direto nas tabelas).
DROP FUNCTION IF EXISTS public.salvar_individuo(uuid, uuid, jsonb, date);
DROP FUNCTION IF EXISTS public.data_movimentacao_individuo(date, public.lote_categorias);
