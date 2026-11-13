-- Rollback de 20261113140000_curral_bebedouros.sql
-- ATENÇÃO: apaga os vínculos curral<->bebedouro e as colunas curral_id/curral de registros_bebedouros.
DROP INDEX IF EXISTS public.idx_registros_bebedouros_curral_id;
ALTER TABLE public.registros_bebedouros
  DROP COLUMN IF EXISTS curral_id,
  DROP COLUMN IF EXISTS curral;

DROP FUNCTION IF EXISTS public.get_bebedouros_situacao_local_relatorio(uuid);
DROP FUNCTION IF EXISTS public.salvar_curral_bebedouros(uuid, uuid[]);
DROP TABLE IF EXISTS public.curral_bebedouros;
DROP FUNCTION IF EXISTS public.trg_curral_bebedouros_valida_fazenda();

NOTIFY pgrst, 'reload schema';
