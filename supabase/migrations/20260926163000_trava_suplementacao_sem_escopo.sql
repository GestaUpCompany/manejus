-- A unicidade da trava é por lote e dia, independentemente do escopo.
-- Uma linha da caderneta representa o lançamento inteiro; escopo é apenas uma
-- classificação da linha e não deve permitir um segundo trato no mesmo dia.

DROP INDEX IF EXISTS uq_suplementacao_fazenda_lote_dia;

CREATE UNIQUE INDEX uq_suplementacao_fazenda_lote_dia
ON registros_suplementacao (
  fazenda_id,
  COALESCE(lote_id, '00000000-0000-0000-0000-000000000000'),
  data_local
)
WHERE data_local IS NOT NULL AND deleted_at IS NULL;
