-- Rollback de 20261021110000_movimentacoes_farmacia_local_id_unique.sql
-- Volta ao índice parcial (o upsert do PWA por local_id volta a falhar com 42P10).
DROP INDEX IF EXISTS public.uq_mov_farmacia_local_id;
CREATE UNIQUE INDEX uq_mov_farmacia_local_id
  ON public.movimentacoes_farmacia (local_id) WHERE local_id IS NOT NULL;
