-- Rodeio: contagem por categoria real do lote (mesmo formato de registros_pastagens)
-- e observação livre do lote (digitada ou ditada por voz no PWA).
alter table public.registros_rodeio add column if not exists categorias_detalhes jsonb;
alter table public.registros_rodeio add column if not exists observacao text;
