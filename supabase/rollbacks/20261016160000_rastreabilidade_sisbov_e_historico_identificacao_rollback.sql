-- Remove histórico e colunas de rastreabilidade. A view da linha do tempo volta à definição de 20261016150000
-- e salvar_individuo ao corpo de 20261015240000 (reaplique esses arquivos após este).
DROP TRIGGER IF EXISTS trg_individuos_historico_identificacao ON public.individuos;
DROP FUNCTION IF EXISTS public.trg_individuos_historico_identificacao();
DROP VIEW IF EXISTS public.vw_individuo_linha_do_tempo;
DROP TABLE IF EXISTS public.individuo_identificacoes;
DROP INDEX IF EXISTS public.idx_individuos_codigo_sisbov_unico;
ALTER TABLE public.individuos DROP CONSTRAINT IF EXISTS individuos_codigo_sisbov_check;
ALTER TABLE public.individuos DROP CONSTRAINT IF EXISTS individuos_dispositivo_tipo_check;
ALTER TABLE public.individuos
  DROP COLUMN IF EXISTS codigo_sisbov, DROP COLUMN IF EXISTS codigo_pnib, DROP COLUMN IF EXISTS dispositivo_tipo,
  DROP COLUMN IF EXISTS data_identificacao, DROP COLUMN IF EXISTS data_vacina_brucelose;
