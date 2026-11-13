-- Rollback de 20261112260000_rls_backups_farmacia_saida.sql
ALTER TABLE IF EXISTS public.backup_saida_itens_duplicados_20261022 DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.backup_medicamentos_20261103 DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.backup_movimentacoes_farmacia_20261103 DISABLE ROW LEVEL SECURITY;
