-- Remove a ponte e as RPCs. A função trg_movimentacao_propaga_individuos NÃO é revertida ao LOWER():
-- para voltar, reaplique o corpo de 20261015190000.
DROP FUNCTION IF EXISTS public.desvincular_individuo_movimentacao(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.vincular_individuos_movimentacao(uuid, uuid, uuid[], boolean);
DROP TABLE IF EXISTS public.evento_individuos;
