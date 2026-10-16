DROP TRIGGER IF EXISTS trigger_movimentacao_recalc_quant_update ON public.registros_movimentacao;
DROP FUNCTION IF EXISTS public.trg_movimentacao_recalc_quant_update();
DROP TRIGGER IF EXISTS trigger_aa_movimentacao_ajusta_data ON public.registros_movimentacao;
DROP FUNCTION IF EXISTS public.trg_movimentacao_ajusta_data();
ALTER TABLE public.registros_movimentacao DROP COLUMN IF EXISTS data_informada;
