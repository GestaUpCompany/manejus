-- ============================================================================
-- MIGRAÇÃO D - Adicionar formulacao_id em registros_saida_insumos e registros_suplementacao
-- Permite que os triggers saibam qual formulação foi produzida/consumida.
-- Backfill por nome (dieta_produzida / formulacao) para registros existentes.
-- ============================================================================

-- ==================== registros_saida_insumos ====================
ALTER TABLE public.registros_saida_insumos
  ADD COLUMN IF NOT EXISTS formulacao_id uuid REFERENCES public.formulacoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_saida_insumos_formulacao
  ON public.registros_saida_insumos (fazenda_id, formulacao_id);

-- Backfill: tentar casar dieta_produzida (nome) com formulacoes.nome na mesma fazenda
UPDATE public.registros_saida_insumos r
SET formulacao_id = sub.id
FROM (
  SELECT r2.id AS registro_id, f.id
  FROM public.registros_saida_insumos r2
  JOIN public.formulacoes f
    ON f.fazenda_id = r2.fazenda_id
    AND f.nome = r2.dieta_produzida
    AND f.deleted_at IS NULL
  WHERE r2.formulacao_id IS NULL
    AND r2.dieta_produzida IS NOT NULL
    AND r2.deleted_at IS NULL
  -- LIMIT 1 por registro para evitar ambiguidade de nomes duplicados
  GROUP BY r2.id, f.id
) sub
WHERE r.id = sub.registro_id
  AND r.formulacao_id IS NULL;

-- ==================== registros_suplementacao ====================
ALTER TABLE public.registros_suplementacao
  ADD COLUMN IF NOT EXISTS formulacao_id uuid REFERENCES public.formulacoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_suplementacao_formulacao
  ON public.registros_suplementacao (fazenda_id, formulacao_id);

-- Backfill: tentar casar formulacao (nome) com formulacoes.nome na mesma fazenda
UPDATE public.registros_suplementacao r
SET formulacao_id = sub.id
FROM (
  SELECT r2.id AS registro_id, f.id
  FROM public.registros_suplementacao r2
  JOIN public.formulacoes f
    ON f.fazenda_id = r2.fazenda_id
    AND f.nome = r2.formulacao
    AND f.deleted_at IS NULL
  WHERE r2.formulacao_id IS NULL
    AND r2.formulacao IS NOT NULL
    AND r2.deleted_at IS NULL
  GROUP BY r2.id, f.id
) sub
WHERE r.id = sub.registro_id
  AND r.formulacao_id IS NULL;

COMMENT ON COLUMN public.registros_saida_insumos.formulacao_id IS
  'UUID da formulação produzida. dieta_produzida (nome) mantido por compatibilidade.';
COMMENT ON COLUMN public.registros_suplementacao.formulacao_id IS
  'UUID da formulação consumida. formulacao (nome) mantido por compatibilidade.';
