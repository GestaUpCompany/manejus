-- Rollback de 20261016250000_manejo_curral_local_id_unico (volta aos índices parciais da migration 20261016230000).
DROP INDEX IF EXISTS public.sessoes_manejo_curral_local_id_key;
DROP INDEX IF EXISTS public.registros_manejo_curral_local_id_key;

CREATE UNIQUE INDEX uq_sessoes_manejo_curral_local ON public.sessoes_manejo_curral (fazenda_id, local_id) WHERE local_id IS NOT NULL;
CREATE UNIQUE INDEX uq_registros_manejo_curral_local ON public.registros_manejo_curral (fazenda_id, local_id) WHERE local_id IS NOT NULL;
