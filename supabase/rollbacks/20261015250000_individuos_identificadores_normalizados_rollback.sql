DROP TRIGGER IF EXISTS trg_individuos_normaliza_identificadores ON public.individuos;
DROP FUNCTION IF EXISTS public.trg_individuos_normaliza_identificadores();
DROP INDEX IF EXISTS public.idx_individuos_fazenda_brinco_unico;
DROP INDEX IF EXISTS public.idx_individuos_fazenda_chip_unico;
DROP INDEX IF EXISTS public.idx_individuos_fazenda_manejo_unico;
CREATE UNIQUE INDEX idx_individuos_fazenda_brinco_unico ON public.individuos (fazenda_id, id_brinco) WHERE deleted_at IS NULL AND id_brinco IS NOT NULL AND id_brinco <> '';
CREATE UNIQUE INDEX idx_individuos_fazenda_chip_unico ON public.individuos (fazenda_id, id_chip) WHERE deleted_at IS NULL AND id_chip IS NOT NULL AND id_chip <> '';
CREATE UNIQUE INDEX idx_individuos_fazenda_manejo_unico ON public.individuos (fazenda_id, id_manejo) WHERE deleted_at IS NULL AND id_manejo IS NOT NULL AND id_manejo <> '';
