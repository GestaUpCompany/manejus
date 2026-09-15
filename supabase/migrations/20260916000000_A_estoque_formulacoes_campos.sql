-- ============================================================================
-- MIGRAÇÃO A - Adicionar campos de estoque em formulacoes e controla_estoque em insumos
-- Estende o controle de estoque para produtos finais (formulações) e adiciona
-- flag de instanciação em insumos e formulações.
-- ============================================================================

-- ==================== formulacoes: campos de estoque ====================
ALTER TABLE public.formulacoes
  ADD COLUMN IF NOT EXISTS estoque_atual numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_minimo numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_unitario numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_total_estoque numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS controla_estoque boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.formulacoes.estoque_atual IS 'Saldo atual em kg (WAC mantido por trigger)';
COMMENT ON COLUMN public.formulacoes.estoque_minimo IS 'Estoque mínimo para alerta (kg)';
COMMENT ON COLUMN public.formulacoes.custo_unitario IS 'Custo médio ponderado móvel (WAC) por kg';
COMMENT ON COLUMN public.formulacoes.custo_total_estoque IS 'Custo total do estoque atual (estoque_atual * custo_unitario)';
COMMENT ON COLUMN public.formulacoes.controla_estoque IS 'Se true, este produto final tem controle de estoque ativo';

-- ==================== insumos: flag controla_estoque + campos de estoque ====================
ALTER TABLE public.insumos
  ADD COLUMN IF NOT EXISTS controla_estoque boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS estoque_minimo numeric(12,3) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.insumos.controla_estoque IS 'Se true, este insumo tem controle de estoque ativo (instanciado)';
COMMENT ON COLUMN public.insumos.estoque_minimo IS 'Estoque mínimo para alerta (kg)';
