DROP TRIGGER IF EXISTS trg_pesagem_avisa_carencia ON public.registros_pesagem;
DROP FUNCTION IF EXISTS public.trg_pesagem_avisa_carencia();
DROP FUNCTION IF EXISTS public.animais_em_carencia(uuid, date);
DROP FUNCTION IF EXISTS public.lotes_em_carencia(uuid, date);
