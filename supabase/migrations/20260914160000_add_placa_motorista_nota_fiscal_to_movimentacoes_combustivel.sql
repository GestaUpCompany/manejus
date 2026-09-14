-- Adicionar campos de placa do veiculo, nome do motorista e nota fiscal
-- na tabela movimentacoes_combustivel para entradas de combustivel via PWA

ALTER TABLE movimentacoes_combustivel
  ADD COLUMN IF NOT EXISTS placa_veiculo text,
  ADD COLUMN IF NOT EXISTS nome_motorista text,
  ADD COLUMN IF NOT EXISTS nota_fiscal text;
