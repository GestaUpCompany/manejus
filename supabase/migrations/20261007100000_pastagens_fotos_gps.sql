alter table public.registros_pastagens
  add column if not exists foto_saida_url text,
  add column if not exists foto_saida_latitude numeric,
  add column if not exists foto_saida_longitude numeric,
  add column if not exists foto_saida_gps_accuracy numeric,
  add column if not exists foto_saida_em timestamptz,
  add column if not exists foto_entrada_url text,
  add column if not exists foto_entrada_latitude numeric,
  add column if not exists foto_entrada_longitude numeric,
  add column if not exists foto_entrada_gps_accuracy numeric,
  add column if not exists foto_entrada_em timestamptz;
