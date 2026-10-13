SELECT cron.unschedule('atualizar-idade-categorias');
DROP TRIGGER IF EXISTS trg_lote_categorias_idade_ref ON public.lote_categorias;
DROP FUNCTION IF EXISTS public.fn_lote_categorias_idade_ref();
DROP FUNCTION IF EXISTS public.atualizar_idade_categorias();
DROP FUNCTION IF EXISTS public.calcular_idade_atual(integer, date);
ALTER TABLE public.lote_categorias DROP COLUMN IF EXISTS idade_atual, DROP COLUMN IF EXISTS idade_data_ref;
