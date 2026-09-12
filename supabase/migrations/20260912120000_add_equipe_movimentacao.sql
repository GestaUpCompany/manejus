-- Adiciona colunas equipe e equipe_nomes na tabela registros_movimentacao
-- para registrar a equipe que participou do manejo de movimentação.
-- Mesmo padrão já existente em registros_rodeio (equipe integer, equipe_nomes jsonb).

ALTER TABLE registros_movimentacao
ADD COLUMN IF NOT EXISTS equipe integer,
ADD COLUMN IF NOT EXISTS equipe_nomes jsonb;
