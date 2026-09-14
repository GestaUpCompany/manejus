-- Adicionar 'estoque_inicial' na constraint de origem de movimentacoes_combustivel
-- Permite registrar o saldo inicial do tanque como movimentacao de auditoria.

ALTER TABLE public.movimentacoes_combustivel
  DROP CONSTRAINT IF EXISTS movimentacoes_combustivel_origem_check;

ALTER TABLE public.movimentacoes_combustivel
  ADD CONSTRAINT movimentacoes_combustivel_origem_check
  CHECK (origem IN ('pwa_entrada', 'painel_baixa', 'painel_ajuste', 'painel_entrada', 'estoque_inicial', 'manual'));
