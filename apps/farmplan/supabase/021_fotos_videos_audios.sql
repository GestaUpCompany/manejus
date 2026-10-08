-- =====================================================================
-- FARM PLAN · 021 · Fotos, Vídeos e Áudios do Aplicativo
-- midias : cada foto, vídeo (até 30 s), áudio ou recado enviado pelo app,
--          ligado a uma baixa de tarefa, a um Fora do Plano/Imprevisto
--          ou a um recado livre para o gestor.
-- Os arquivos ficam no Storage do Supabase, na pasta "midias" (privada):
--   midias/<fazenda>/<ano>/<semana>/<arquivo>
-- Só quem tem acesso à fazenda vê. Pode rodar mais de uma vez sem problema.
-- =====================================================================

-- 1. Tabela
create table if not exists midias (
  id             uuid primary key default gen_random_uuid(),
  fazenda_id     uuid not null references fazendas(id) on delete cascade,
  ano            int  not null,
  semana         int  not null,
  dia            int  not null check (dia between 0 and 6),          -- 0 = segunda
  origem         text not null check (origem in ('baixa', 'fora', 'recado')),
  tipo           text not null check (tipo in ('foto', 'video', 'audio', 'texto')),
  atividade_id   uuid references atividades(id) on delete cascade,     -- quando é de uma baixa
  fora_id        uuid references fora_do_plano(id) on delete cascade,  -- quando é de um Fora do Plano / Imprevisto
  pessoa_id      uuid references pessoas(id) on delete set null,       -- quem enviou (cadastro da pessoa)
  caminho        text,                                                 -- arquivo no Storage
  mime           text,
  bytes          int,
  segundos       numeric,
  texto          text,                                                 -- legenda ou recado
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  registrado_em  timestamptz not null default now()
);
create index if not exists midias_dia on midias (fazenda_id, ano, semana, dia);

alter table midias enable row level security;
drop policy if exists "ver midias"    on midias;
drop policy if exists "enviar midias" on midias;
drop policy if exists "apagar midias" on midias;
-- Recado livre: só quem mandou e gestor/administrativo/consultor veem
create policy "ver midias" on midias for select using (
  fazenda_id in (select minhas_fazendas())
  and (origem <> 'recado' or registrado_por = auth.uid() or tenho_papel(fazenda_id, array['consultor','gestor','administrativo'])));
create policy "enviar midias" on midias for insert with check (
  fazenda_id in (select minhas_fazendas()) and registrado_por = auth.uid());
create policy "apagar midias" on midias for delete using (
  registrado_por = auth.uid() or tenho_papel(fazenda_id, array['consultor','gestor','administrativo']));
grant select, insert, delete on midias to authenticated;

-- 2. Pasta privada no Storage (até 25 MB por arquivo; só imagem, vídeo e áudio)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('midias', 'midias', false, 26214400, array['image/*', 'video/*', 'audio/*'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "midias ver"    on storage.objects;
drop policy if exists "midias enviar" on storage.objects;
drop policy if exists "midias apagar" on storage.objects;
create policy "midias ver" on storage.objects for select to authenticated using (
  bucket_id = 'midias' and (storage.foldername(name))[1] in (select f::text from minhas_fazendas() f));
create policy "midias enviar" on storage.objects for insert to authenticated with check (
  bucket_id = 'midias' and (storage.foldername(name))[1] in (select f::text from minhas_fazendas() f));
create policy "midias apagar" on storage.objects for delete to authenticated using (
  bucket_id = 'midias' and (owner = auth.uid()
    or tenho_papel(((storage.foldername(name))[1])::uuid, array['consultor','gestor','administrativo'])));

select 'Fotos, vídeos e áudios prontos' as resultado;
