-- Permite manter programações de períodos diferentes para o mesmo tipo.
-- A vigência passa a ser determinada por data_inicio/data_fim.

DROP INDEX IF EXISTS public.idx_programacao_tratos_fazenda_tipo;

CREATE INDEX IF NOT EXISTS idx_programacao_tratos_fazenda_tipo_vigencia
  ON public.programacao_tratos (fazenda_id, tipo, data_inicio, data_fim)
  WHERE ativo = true;
