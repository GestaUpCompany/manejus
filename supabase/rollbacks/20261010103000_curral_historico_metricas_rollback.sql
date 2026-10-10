-- Rollback de 20261010103000_curral_historico_metricas.sql
-- Remove a view, o trigger e as colunas novas (perde hora, cabecas e peso de entrada/saida registrados).
-- Aplicar ANTES o rollback de 20261010104000_registros_curral se ele ja tiver sido aplicado.

DROP VIEW IF EXISTS public.v_historico_ocupacao_curral;
DROP TRIGGER IF EXISTS trg_lch_metricas ON public.lote_curral_historico;
DROP FUNCTION IF EXISTS public.trg_lch_metricas();
DROP INDEX IF EXISTS public.idx_lote_curral_historico_entrada;

ALTER TABLE public.lote_curral_historico
  DROP COLUMN IF EXISTS peso_vivo_medio_saida_kg,
  DROP COLUMN IF EXISTS cabecas_saida,
  DROP COLUMN IF EXISTS peso_vivo_medio_entrada_kg,
  DROP COLUMN IF EXISTS cabecas_entrada,
  DROP COLUMN IF EXISTS data_hora_saida,
  DROP COLUMN IF EXISTS data_hora_entrada;
