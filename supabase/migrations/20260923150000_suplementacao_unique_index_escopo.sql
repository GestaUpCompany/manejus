-- Inclui escopo na unique index de registros_suplementacao
--
-- Com creep feeding, um mesmo lote pode ter duas linhas no mesmo dia: uma no
-- escopo 'lote' (categorias adultas) e outra no escopo 'creep' (bezerro(a) ao
-- pé). Se as duas formulações tiverem o mesmo nome, o índice antigo
-- (fazenda_id, lote_id, formulacao, data) rejeitaria a segunda linha. O escopo
-- passa a fazer parte da chave, mantendo a proteção contra duplicatas dentro de
-- cada série.
--
-- Mantém: índice parcial (deleted_at IS NULL) e COALESCE para lote_id NULL.

DROP INDEX IF EXISTS uq_suplementacao_fazenda_lote_formulacao_data;

CREATE UNIQUE INDEX uq_suplementacao_fazenda_lote_formulacao_data
ON registros_suplementacao (
  fazenda_id,
  COALESCE(lote_id, '00000000-0000-0000-0000-000000000000'),
  formulacao,
  data,
  escopo
)
WHERE deleted_at IS NULL;
