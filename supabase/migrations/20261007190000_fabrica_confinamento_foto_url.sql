-- Carregamento Vagao no layout novo do PWA: foto opcional da balanca no fechamento do trato.
ALTER TABLE public.registros_fabrica_confinamento
  ADD COLUMN IF NOT EXISTS foto_url text;
