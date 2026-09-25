-- Trava de um trato por lote por dia na caderneta de suplementação
--
-- Objetivo: impedir dois lançamentos de suplementação para o mesmo lote no
-- mesmo dia de calendário (fuso da fazenda). O app já bloqueia no cliente
-- (IndexedDB + registros puxados + consulta online), mas entre aparelhos
-- offline a unicidade só pode ser garantida no banco.
--
-- Desenho retrocompatível:
-- * `data_local` é enviada pelo PWA apenas quando `fazendas.trava_suplementacao`
--   está ligada; linhas sem a coluna (históricas ou de app antigo) NÃO
--   participam da constraint, então nada quebra para versões antigas nem para
--   fazendas fora do rollout.
-- * Índice parcial: sem backfill, duplicados históricos não derrubam a
--   migration e a trava passa a valer apenas para novos lançamentos.
-- * `escopo` na chave preserva o par lote+creep do mesmo lançamento (creep
--   feeding grava uma linha extra com escopo 'creep').
-- * `deleted_at IS NULL`: trato excluído (soft-delete) não bloqueia novo
--   lançamento.
--
-- Flag por fazenda: `fazendas.trava_suplementacao` (default false).
-- O PWA lê a flag na validação da fazenda e no refresh da Home; com ela ligada
-- o app bloqueia no save e envia `data_local`, ativando a constraint.
--
-- Resíduo assumido: em fazenda habilitada, um aparelho com PWA antigo ainda
-- pode criar duplicado (envia data_local NULL). Cobertura melhora conforme os
-- aparelhos atualizam.

ALTER TABLE registros_suplementacao
  ADD COLUMN IF NOT EXISTS data_local date;

ALTER TABLE fazendas
  ADD COLUMN IF NOT EXISTS trava_suplementacao boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_suplementacao_fazenda_lote_dia
ON registros_suplementacao (
  fazenda_id,
  COALESCE(lote_id, '00000000-0000-0000-0000-000000000000'),
  data_local,
  escopo
)
WHERE data_local IS NOT NULL AND deleted_at IS NULL;
