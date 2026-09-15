-- ============================================================================
-- MIGRAÇÃO - Auto-instanciação de itens no estoque de suplementos
-- Altera o default de controla_estoque para true em insumos e formulacoes,
-- eliminando o passo manual de "instanciar" no Painel Web.
-- Todos os insumos e formulações criados passam a ter controle de estoque ativo
-- por padrão, com saldo zero. O usuário registra entradas normalmente.
-- ============================================================================

-- ==================== Alterar default para true ====================
ALTER TABLE public.insumos
  ALTER COLUMN controla_estoque SET DEFAULT true;

ALTER TABLE public.formulacoes
  ALTER COLUMN controla_estoque SET DEFAULT true;

-- ==================== Backfill: itens existentes passam a ter controla_estoque = true ====================
UPDATE public.insumos
  SET controla_estoque = true
  WHERE controla_estoque = false;

UPDATE public.formulacoes
  SET controla_estoque = true
  WHERE controla_estoque = false;

-- ==================== Atualizar comentários ====================
COMMENT ON COLUMN public.insumos.controla_estoque IS 'Se true, este insumo tem controle de estoque ativo (padrão: true desde a criação)';
COMMENT ON COLUMN public.formulacoes.controla_estoque IS 'Se true, este produto final tem controle de estoque ativo (padrão: true desde a criação)';
