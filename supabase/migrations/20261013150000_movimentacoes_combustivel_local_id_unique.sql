-- O upsert do PWA usa onConflict: 'local_id', que o PostgREST envia sem predicado.
-- Com indice unico parcial (WHERE local_id IS NOT NULL) o Postgres retorna 42P10.
-- Indice unico completo resolve; NULLs multiplos continuam permitidos.
DROP INDEX IF EXISTS public.idx_movimentacoes_combustivel_local_id;
CREATE UNIQUE INDEX idx_movimentacoes_combustivel_local_id
  ON public.movimentacoes_combustivel (local_id);
