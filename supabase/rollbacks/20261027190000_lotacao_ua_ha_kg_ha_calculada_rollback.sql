DROP TRIGGER IF EXISTS trg_lotacao_pasto_area ON public.pastos;
DROP TRIGGER IF EXISTS trg_lotacao_lote_categorias ON public.lote_categorias;
DROP TRIGGER IF EXISTS trg_lotacao_lote_pasto_historico ON public.lote_pasto_historico;

DROP FUNCTION IF EXISTS public.trg_lotacao_pasto_area();
DROP FUNCTION IF EXISTS public.trg_lotacao_lote_categorias();
DROP FUNCTION IF EXISTS public.trg_lotacao_lote_pasto_historico();
DROP FUNCTION IF EXISTS public.recalcular_lotacao_pasto(uuid);
DROP FUNCTION IF EXISTS public.recalcular_lotacao_lote(uuid);

ALTER TABLE public.pastos
  DROP COLUMN IF EXISTS ua_ha,
  DROP COLUMN IF EXISTS kg_ha;
