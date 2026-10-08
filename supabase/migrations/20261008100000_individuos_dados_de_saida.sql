-- ============================================================================
-- Indivíduos / Fase 3a: dados de saída do animal (data, motivo e destino)
-- ============================================================================
-- Hoje a saída de um indivíduo só existe como `status` (Abatido, Doado, Morto, Transferido,
-- Venda Vivo). Não há quando nem por quê. Esta migration adiciona três colunas ANULÁVEIS, sem
-- default e sem CHECK (a lista de motivos é validada no painel para poder evoluir sem migration).
--
-- Impacto no PWA: nenhum. Colunas novas e anuláveis; o PWA lê com colunas explícitas ou `select *`
-- e não escreve nelas. Registros antigos ficam com NULL.
-- Não há backfill (não altera dados existentes).
-- Rollback: supabase/rollbacks/20261008100000_individuos_dados_de_saida_rollback.sql
-- ============================================================================

ALTER TABLE public.individuos
  ADD COLUMN IF NOT EXISTS data_saida date,
  ADD COLUMN IF NOT EXISTS motivo_saida text,
  ADD COLUMN IF NOT EXISTS destino_saida text;

COMMENT ON COLUMN public.individuos.data_saida IS 'Data (fuso da fazenda) em que o animal saiu do rebanho. NULL enquanto Vivo ou para saídas antigas sem data.';
COMMENT ON COLUMN public.individuos.motivo_saida IS 'Motivo da saída (ex.: Venda, Abate, Morte, Doação, Transferência, Descarte, Outro). Texto livre validado no painel.';
COMMENT ON COLUMN public.individuos.destino_saida IS 'Destino do animal na saída (comprador, frigorífico, fazenda de destino etc.), texto livre.';
