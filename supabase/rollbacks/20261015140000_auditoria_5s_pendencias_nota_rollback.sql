-- Rollback de 20261015140000_auditoria_5s_pendencias_nota.sql
-- ATENCAO: apaga a nota geral e as evidencias das nao conformidades ja registradas.
DROP INDEX IF EXISTS public.idx_registros_auditoria_5s_fazenda_setor_data;
ALTER TABLE public.registros_auditoria_5s
  DROP CONSTRAINT IF EXISTS registros_auditoria_5s_nota_geral_check,
  DROP COLUMN IF EXISTS nota_geral,
  DROP COLUMN IF EXISTS nao_conformidades;
