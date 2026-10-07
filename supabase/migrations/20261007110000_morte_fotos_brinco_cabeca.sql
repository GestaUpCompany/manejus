alter table public.registros_morte
  add column if not exists foto_brinco_url text,
  add column if not exists foto_cabeca_url text;
