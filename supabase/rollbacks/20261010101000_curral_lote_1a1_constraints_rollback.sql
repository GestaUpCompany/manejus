-- Rollback de 20261010101000_curral_lote_1a1_constraints.sql
-- Remove as constraints do 1:1. Nao remove btree_gist (usada por programacao_tratos_sem_sobreposicao).
-- Os dados ficam como estao; o unico indice parcial original (uq_lote_curral_historico_aberta) permanece.

DROP INDEX IF EXISTS public.uq_currais_lote_unico;

ALTER TABLE public.lote_curral_historico
  DROP CONSTRAINT IF EXISTS lch_sem_sobreposicao_lote,
  DROP CONSTRAINT IF EXISTS lch_sem_sobreposicao_curral,
  DROP CONSTRAINT IF EXISTS lch_datas_validas;
