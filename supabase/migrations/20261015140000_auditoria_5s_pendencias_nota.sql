-- Auditoria 5S: evidencia das nao conformidades (pendencias) e nota geral do setor
--
--  * nao_conformidades: { chave_do_item: { observacao, foto_url, pendencia?: { situacao, desde } } }
--    Uma entrada por item respondido N. `pendencia` existe quando o item veio de uma pendencia anterior
--    do setor e foi respondido como 'mantida' (ainda pendente). A pendencia em si e derivada do historico
--    (sem tabela propria), como em Bebedouros e Rodeio.
--  * nota_geral: nota do setor de 0 a 5 dada pelo auditor (nula nos registros anteriores).
--
-- Rollback: supabase/rollbacks/20261015140000_auditoria_5s_pendencias_nota_rollback.sql

ALTER TABLE public.registros_auditoria_5s
  ADD COLUMN IF NOT EXISTS nao_conformidades jsonb,
  ADD COLUMN IF NOT EXISTS nota_geral smallint;

ALTER TABLE public.registros_auditoria_5s
  DROP CONSTRAINT IF EXISTS registros_auditoria_5s_nota_geral_check;
ALTER TABLE public.registros_auditoria_5s
  ADD CONSTRAINT registros_auditoria_5s_nota_geral_check
  CHECK (nota_geral IS NULL OR nota_geral BETWEEN 0 AND 5);

COMMENT ON COLUMN public.registros_auditoria_5s.nao_conformidades IS
  'Evidencia dos itens N: {chave: {observacao, foto_url, pendencia?: {situacao: resolvida|mantida, desde}}}.';
COMMENT ON COLUMN public.registros_auditoria_5s.nota_geral IS
  'Nota geral do setor dada pelo auditor, de 0 a 5.';

-- Historico por setor (pendencias): ultimas auditorias do setor
CREATE INDEX IF NOT EXISTS idx_registros_auditoria_5s_fazenda_setor_data
  ON public.registros_auditoria_5s (fazenda_id, setor_id, data DESC)
  WHERE deleted_at IS NULL;
