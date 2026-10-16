-- Rollback de 20261016220000_movimentacao_data_retroativa (recriado em 16/10/2026; o original sumiu do disco).
-- Remove os dois triggers e as funções. A coluna data_informada é mantida (guarda a data original já informada).
DROP TRIGGER IF EXISTS trigger_aa_movimentacao_ajusta_data ON public.registros_movimentacao;
DROP TRIGGER IF EXISTS trigger_movimentacao_recalc_quant_update ON public.registros_movimentacao;
DROP FUNCTION IF EXISTS public.trg_movimentacao_ajusta_data();
DROP FUNCTION IF EXISTS public.trg_movimentacao_recalc_quant_update();
