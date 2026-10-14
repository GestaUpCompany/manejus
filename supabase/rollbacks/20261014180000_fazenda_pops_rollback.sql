-- Rollback de 20261014180000_fazenda_pops.sql
-- Antes de rodar: esvaziar o bucket 'pops' pelo painel/API (o Supabase não permite apagar bucket com objetos via SQL).
DROP TABLE IF EXISTS public.fazenda_pops;
DROP POLICY IF EXISTS "pops-insert" ON storage.objects;
DROP POLICY IF EXISTS "pops-update" ON storage.objects;
DROP POLICY IF EXISTS "pops-delete" ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'pops';
