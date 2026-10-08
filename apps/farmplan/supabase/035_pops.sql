-- =====================================================================
-- FARM PLAN · 035 · POP (Procedimento Operacional Padrão) em PDF
-- Cria o armazenamento privado "pops". Cada fazenda só vê os seus.
-- Anexar/Remover: Consultor, Gestor e Administrativo. Ver: toda a equipe.
-- O endereço do PDF fica em atividades.como_fazer.pop (não muda tabela).
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pops', 'pops', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "pops ver"     on storage.objects;
drop policy if exists "pops enviar"  on storage.objects;
drop policy if exists "pops apagar"  on storage.objects;
create policy "pops ver" on storage.objects for select to authenticated using (
  bucket_id = 'pops' and (storage.foldername(name))[1] in (select f::text from minhas_fazendas() f));
create policy "pops enviar" on storage.objects for insert to authenticated with check (
  bucket_id = 'pops' and (storage.foldername(name))[1] in (select f::text from minhas_fazendas() f)
  and tenho_papel(((storage.foldername(name))[1])::uuid, array['consultor','gestor','administrativo']));
create policy "pops apagar" on storage.objects for delete to authenticated using (
  bucket_id = 'pops' and tenho_papel(((storage.foldername(name))[1])::uuid, array['consultor','gestor','administrativo']));

select 'POPs em PDF prontos' as resultado;
