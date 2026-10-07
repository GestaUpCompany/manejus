-- Leitura de cocho no layout novo do PWA: foto opcional do cocho (uma por registro/curral).
ALTER TABLE public.registros_leitura_cocho
  ADD COLUMN IF NOT EXISTS foto_url text;
