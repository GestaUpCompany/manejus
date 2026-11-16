-- Rollback de 20261116100000_almoxarifado_modo_devolucao.sql
DROP INDEX IF EXISTS public.usuario_fazenda_um_responsavel_devolucao_idx;
ALTER TABLE public.usuario_fazenda DROP COLUMN IF EXISTS responsavel_devolucao;
ALTER TABLE public.fazendas DROP CONSTRAINT IF EXISTS fazendas_almoxarifado_modo_devolucao_check;
ALTER TABLE public.fazendas DROP COLUMN IF EXISTS almoxarifado_modo_devolucao;
