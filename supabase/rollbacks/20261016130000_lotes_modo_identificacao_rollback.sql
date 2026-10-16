DROP FUNCTION IF EXISTS public.definir_modo_identificacao(uuid, uuid, text);
DROP TRIGGER IF EXISTS trg_lotes_valida_modo_identificacao ON public.lotes;
DROP FUNCTION IF EXISTS public.trg_lotes_valida_modo_identificacao();
ALTER TABLE public.lotes DROP CONSTRAINT IF EXISTS lotes_modo_identificacao_check;
ALTER TABLE public.lotes DROP COLUMN IF EXISTS modo_identificacao;
