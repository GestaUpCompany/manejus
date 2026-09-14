-- Add local_id column to movimentacoes_combustivel for idempotent sync from PWA
ALTER TABLE public.movimentacoes_combustivel
ADD COLUMN local_id TEXT;

CREATE UNIQUE INDEX idx_movimentacoes_combustivel_local_id
ON public.movimentacoes_combustivel(local_id)
WHERE local_id IS NOT NULL;
