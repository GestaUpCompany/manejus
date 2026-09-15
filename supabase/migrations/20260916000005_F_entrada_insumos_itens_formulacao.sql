-- ============================================================================
-- MIGRAÇÃO F - Adicionar formulacao_id, lote, validade em entrada_insumos_itens
-- Permite registrar entrada de produto final comprado pronto (formulação) além
-- de insumos. lote/validade são informativos (controle por item, não por lote).
-- ============================================================================

ALTER TABLE public.entrada_insumos_itens
  ADD COLUMN IF NOT EXISTS formulacao_id uuid REFERENCES public.formulacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lote text,
  ADD COLUMN IF NOT EXISTS validade date;

-- Permitir insumo_id NULL quando for produto final (formulacao_id preenchido)
ALTER TABLE public.entrada_insumos_itens
  ALTER COLUMN insumo_id DROP NOT NULL;

-- Constraint XOR: ou é insumo, ou é formulação, nunca ambos, nunca nenhum
ALTER TABLE public.entrada_insumos_itens
  DROP CONSTRAINT IF EXISTS chk_item_alvo;
ALTER TABLE public.entrada_insumos_itens
  ADD CONSTRAINT chk_item_alvo CHECK (
    (insumo_id IS NOT NULL) <> (formulacao_id IS NOT NULL)
  );

-- Constraint: lote/validade só podem ser preenchidos se for produto final (formulacao_id)
ALTER TABLE public.entrada_insumos_itens
  DROP CONSTRAINT IF EXISTS chk_lote_validade_so_produto;
ALTER TABLE public.entrada_insumos_itens
  ADD CONSTRAINT chk_lote_validade_so_produto CHECK (
    (formulacao_id IS NOT NULL) OR (lote IS NULL AND validade IS NULL)
  );

COMMENT ON COLUMN public.entrada_insumos_itens.formulacao_id IS
  'Se preenchido, é entrada de produto final comprado pronto (formulação). insumo_id deve ser NULL.';
COMMENT ON COLUMN public.entrada_insumos_itens.lote IS
  'Lote de fabricação (informativo, só para produto final). Estoque é por item, não por lote.';
COMMENT ON COLUMN public.entrada_insumos_itens.validade IS
  'Data de validade (informativo, só para produto final). Estoque é por item, não por lote.';

-- ==================== Adicionar local_id em saida_insumos_itens para idempotência do sync ====================
ALTER TABLE public.saida_insumos_itens
  ADD COLUMN IF NOT EXISTS local_id text;

CREATE UNIQUE INDEX IF NOT EXISTS saida_insumos_itens_local_id_key
  ON public.saida_insumos_itens(local_id);
