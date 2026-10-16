-- Rollback de 20261015210000: restaura o trigger de pesagem (20261015200000) e o cron anterior; remove as colunas.
-- As funções órfãs removidas não são recriadas (sem uso e com bug). Reaplique o corpo de
-- trg_registros_pesagem_upsert_individuo de 20261015200000 antes de dropar as colunas.
ALTER TABLE public.individuos DROP CONSTRAINT IF EXISTS individuos_peso_atual_origem_check;
ALTER TABLE public.individuos DROP COLUMN IF EXISTS peso_atual_origem, DROP COLUMN IF EXISTS peso_atual_data;
