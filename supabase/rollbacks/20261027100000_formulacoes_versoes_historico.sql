-- Rollback de 20261027100000_formulacoes_versoes_historico.sql
-- Atenção: apaga o histórico gravado. Fazer backup antes se já houver versões úteis.
DROP TRIGGER IF EXISTS trigger_registrar_edicao_insumo ON public.insumos;
DROP FUNCTION IF EXISTS public.trigger_registrar_edicao_insumo();
DROP FUNCTION IF EXISTS public._registrar_versao_formulacao(uuid, text, uuid, text);
DROP TABLE IF EXISTS public.insumos_edicoes;
DROP TABLE IF EXISTS public.formulacoes_versoes;
