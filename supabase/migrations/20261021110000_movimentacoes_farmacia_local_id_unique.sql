-- O upsert do PWA usa onConflict: 'local_id', que o PostgREST envia sem predicado.
-- Com índice único parcial (WHERE local_id IS NOT NULL) o Postgres retorna 42P10
-- (mesmo problema de movimentacoes_combustivel, 20261013150000).
-- Índice único completo resolve; NULLs múltiplos continuam permitidos.
-- Rollback: supabase/rollbacks/20261021110000_movimentacoes_farmacia_local_id_unique_rollback.sql
DROP INDEX IF EXISTS public.uq_mov_farmacia_local_id;
CREATE UNIQUE INDEX uq_mov_farmacia_local_id
  ON public.movimentacoes_farmacia (local_id);
