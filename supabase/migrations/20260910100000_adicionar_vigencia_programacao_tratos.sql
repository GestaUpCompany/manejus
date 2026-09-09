-- Adiciona vigência explícita às programações de tratos.
-- Programações existentes recebem início na data de criação e vigência aberta.

ALTER TABLE public.programacao_tratos
  ADD COLUMN IF NOT EXISTS data_inicio date,
  ADD COLUMN IF NOT EXISTS data_fim date;

UPDATE public.programacao_tratos
SET
  data_inicio = COALESCE(data_inicio, created_at::date),
  data_fim = COALESCE(data_fim, DATE '9999-12-31')
WHERE data_inicio IS NULL OR data_fim IS NULL;

ALTER TABLE public.programacao_tratos
  ALTER COLUMN data_inicio SET NOT NULL,
  ALTER COLUMN data_fim SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'programacao_tratos_vigencia_valida'
      AND conrelid = 'public.programacao_tratos'::regclass
  ) THEN
    ALTER TABLE public.programacao_tratos
      ADD CONSTRAINT programacao_tratos_vigencia_valida
      CHECK (data_fim >= data_inicio);
  END IF;
END $$;

COMMENT ON COLUMN public.programacao_tratos.data_inicio IS
  'Primeiro dia em que a programação é válida.';
COMMENT ON COLUMN public.programacao_tratos.data_fim IS
  'Último dia em que a programação é válida.';
