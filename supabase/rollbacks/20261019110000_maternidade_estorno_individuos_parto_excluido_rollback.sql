DROP TRIGGER IF EXISTS trg_maternidade_estorna_cria ON public.registros_maternidade;
DROP FUNCTION IF EXISTS public.trg_maternidade_estorna_cria();
DROP FUNCTION IF EXISTS public.cria_do_parto_sem_outro_uso(uuid, uuid, uuid, timestamptz);
