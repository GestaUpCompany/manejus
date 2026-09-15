-- ============================================================================
-- MIGRAÇÃO B - Criar tabela movimentacoes_estoque_suplementos
-- Tabela central de movimentações de estoque para insumos e produtos finais.
-- Substitui a legada movimentacao_estoque (que será desativada na Migration G).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.movimentacoes_estoque_suplementos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  item_tipo text NOT NULL CHECK (item_tipo IN ('insumo', 'formulacao')),
  item_id uuid NOT NULL,
  tipo_movimentacao text NOT NULL CHECK (tipo_movimentacao IN ('entrada', 'baixa', 'producao', 'consumo', 'ajuste', 'estorno')),
  quantidade numeric(12,3) NOT NULL,
  custo_unitario numeric(12,4),
  valor_total numeric(12,2),
  origem text,
  registro_origem_id uuid,
  data date,
  observacao text,
  local_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  -- Idempotência: evitar duplicar movimentação em retry de sync
  CONSTRAINT uq_mov_estoque_supl_origem UNIQUE (registro_origem_id, item_tipo, item_id, tipo_movimentacao)
);

-- ==================== Índices ====================
CREATE INDEX IF NOT EXISTS idx_mov_estoque_supl_fazenda
  ON public.movimentacoes_estoque_suplementos (fazenda_id);

CREATE INDEX IF NOT EXISTS idx_mov_estoque_supl_item
  ON public.movimentacoes_estoque_suplementos (item_tipo, item_id, data);

CREATE INDEX IF NOT EXISTS idx_mov_estoque_supl_data
  ON public.movimentacoes_estoque_suplementos (data);

CREATE INDEX IF NOT EXISTS idx_mov_estoque_supl_registro_origem
  ON public.movimentacoes_estoque_suplementos (registro_origem_id);

CREATE INDEX IF NOT EXISTS idx_mov_estoque_supl_deleted
  ON public.movimentacoes_estoque_suplementos (deleted_at)
  WHERE deleted_at IS NULL;

-- ==================== RLS ====================
ALTER TABLE public.movimentacoes_estoque_suplementos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mov_estoque_supl_select_fazenda" ON public.movimentacoes_estoque_suplementos;
CREATE POLICY "mov_estoque_supl_select_fazenda"
  ON public.movimentacoes_estoque_suplementos FOR SELECT
  TO authenticated
  USING (
    fazenda_id IN (
      SELECT fazenda_id FROM public.usuario_fazenda
      WHERE usuario_id = auth.uid() AND ativo = true
    )
  );

DROP POLICY IF EXISTS "mov_estoque_supl_insert_fazenda" ON public.movimentacoes_estoque_suplementos;
CREATE POLICY "mov_estoque_supl_insert_fazenda"
  ON public.movimentacoes_estoque_suplementos FOR INSERT
  TO authenticated
  WITH CHECK (
    fazenda_id IN (
      SELECT fazenda_id FROM public.usuario_fazenda
      WHERE usuario_id = auth.uid() AND ativo = true
    )
  );

DROP POLICY IF EXISTS "mov_estoque_supl_update_fazenda" ON public.movimentacoes_estoque_suplementos;
CREATE POLICY "mov_estoque_supl_update_fazenda"
  ON public.movimentacoes_estoque_suplementos FOR UPDATE
  TO authenticated
  USING (
    fazenda_id IN (
      SELECT fazenda_id FROM public.usuario_fazenda
      WHERE usuario_id = auth.uid() AND ativo = true
    )
  );

DROP POLICY IF EXISTS "mov_estoque_supl_delete_fazenda" ON public.movimentacoes_estoque_suplementos;
CREATE POLICY "mov_estoque_supl_delete_fazenda"
  ON public.movimentacoes_estoque_suplementos FOR DELETE
  TO authenticated
  USING (
    fazenda_id IN (
      SELECT fazenda_id FROM public.usuario_fazenda
      WHERE usuario_id = auth.uid() AND ativo = true
    )
  );

-- ==================== Trigger updated_at ====================
DROP TRIGGER IF EXISTS trg_mov_estoque_supl_updated_at ON public.movimentacoes_estoque_suplementos;

CREATE TRIGGER trg_mov_estoque_supl_updated_at
  BEFORE UPDATE ON public.movimentacoes_estoque_suplementos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ==================== Grants ====================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimentacoes_estoque_suplementos TO authenticated;

COMMENT ON TABLE public.movimentacoes_estoque_suplementos IS
  'Movimentações de estoque de insumos e produtos finais (suplementação). WAC mantido por trigger.';
COMMENT ON COLUMN public.movimentacoes_estoque_suplementos.item_tipo IS
  'Tipo do item: insumo (tabela insumos) ou formulacao (tabela formulacoes).';
COMMENT ON COLUMN public.movimentacoes_estoque_suplementos.item_id IS
  'UUID do item (insumo_id ou formulacao_id conforme item_tipo). Não tem FK direta por ser polimórfica.';
COMMENT ON COLUMN public.movimentacoes_estoque_suplementos.tipo_movimentacao IS
  'entrada=recebimento, baixa=consumo/produção, producao=entrada de produto acabado, consumo=saída na suplementação, ajuste=saldo absoluto, estorno=reversão.';
COMMENT ON COLUMN public.movimentacoes_estoque_suplementos.origem IS
  'Origem da movimentação: estoque_inicial, painel_entrada, painel_ajuste, entrada_insumos, saida_insumos, fabrica_confinamento, suplementacao.';
