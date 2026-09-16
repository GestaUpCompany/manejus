-- Adiciona coluna foto_url nas cadernetas que passam a capturar foto no PWA
alter table public.registros_enfermaria add column if not exists foto_url text;
alter table public.registros_rodeio add column if not exists foto_url text;
alter table public.registros_manutencao_maquinas add column if not exists foto_url text;
alter table public.registros_limpeza add column if not exists foto_url text;

-- Bucket compartilhado para fotos das cadernetas (mesmo padrão de fotos-morte/fotos-atividades)
insert into storage.buckets (id, name, public)
values ('fotos-registros', 'fotos-registros', true)
on conflict (id) do nothing;

create policy "fotos-registros-read"
on storage.objects for select to authenticated
using (bucket_id = 'fotos-registros');

create policy "fotos-registros-upload"
on storage.objects for insert to authenticated
with check (bucket_id = 'fotos-registros');

create policy "fotos-registros-update"
on storage.objects for update to authenticated
using (bucket_id = 'fotos-registros')
with check (bucket_id = 'fotos-registros');

create policy "fotos-registros-delete"
on storage.objects for delete to authenticated
using (bucket_id = 'fotos-registros');
