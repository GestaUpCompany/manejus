-- Pendências do checklist do Rodeio: leitura do histórico de UM lote
--
-- O PWA, ao escolher o lote no Rodeio, lê os rodeios mais recentes dele (por lote_id, ordem de data
-- decrescente) para saber quais itens persistentes do checklist continuam marcados como problema.
-- O Painel faz o mesmo cálculo sobre os registros da fazenda. Sem índice, essa leitura varreria todos
-- os registros da fazenda.
--
-- Só índice: o estado das pendências é derivado dos registros, não há tabela nem trigger novos.
-- Parcial em deleted_at IS NULL, igual às consultas (soft delete).
--
-- Rollback: supabase/rollbacks/20261015120000_idx_registros_rodeio_fazenda_lote_data_rollback.sql

CREATE INDEX IF NOT EXISTS idx_registros_rodeio_fazenda_lote_data
  ON public.registros_rodeio (fazenda_id, lote_id, data DESC)
  WHERE deleted_at IS NULL;
