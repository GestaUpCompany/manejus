-- Pendências do checklist de Bebedouros: leitura do histórico de UM bebedouro
--
-- O PWA, ao abrir um bebedouro, lê os registros mais recentes dele (por numero_bebedouro, ordem de data
-- decrescente) para saber quais itens do checklist continuam marcados como problema. O Painel faz o mesmo
-- cálculo sobre os registros da fazenda. Sem índice, essa leitura varreria todos os registros da fazenda.
--
-- Só índice: o estado das pendências é derivado dos registros, não há tabela nem trigger novos.
-- Parcial em deleted_at IS NULL, igual às consultas (soft delete).
--
-- Rollback: supabase/rollbacks/20261013140000_idx_registros_bebedouros_fazenda_bebedouro_data_rollback.sql

CREATE INDEX IF NOT EXISTS idx_registros_bebedouros_fazenda_bebedouro_data
  ON public.registros_bebedouros (fazenda_id, numero_bebedouro, data DESC)
  WHERE deleted_at IS NULL;
