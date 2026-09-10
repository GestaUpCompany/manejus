-- Adiciona coluna local_id + unique index nas 7 tabelas restantes de registros.
-- Objetivo: idempotência no sync PWA -> Supabase via upsert com onConflict('local_id').
-- O unique index não é parcial: PostgreSQL permite múltiplos NULLs em unique index,
-- então INSERTs do Painel Web (sem local_id) não conflitam entre si.

-- registros_entrada_insumos
ALTER TABLE public.registros_entrada_insumos ADD COLUMN IF NOT EXISTS local_id text;
CREATE UNIQUE INDEX IF NOT EXISTS registros_entrada_insumos_local_id_key
  ON public.registros_entrada_insumos (local_id);

-- entrada_insumos_itens
ALTER TABLE public.entrada_insumos_itens ADD COLUMN IF NOT EXISTS local_id text;
CREATE UNIQUE INDEX IF NOT EXISTS entrada_insumos_itens_local_id_key
  ON public.entrada_insumos_itens (local_id);

-- registros_saida_insumos
ALTER TABLE public.registros_saida_insumos ADD COLUMN IF NOT EXISTS local_id text;
CREATE UNIQUE INDEX IF NOT EXISTS registros_saida_insumos_local_id_key
  ON public.registros_saida_insumos (local_id);

-- atividade_funcionarios
ALTER TABLE public.atividade_funcionarios ADD COLUMN IF NOT EXISTS local_id text;
CREATE UNIQUE INDEX IF NOT EXISTS atividade_funcionarios_local_id_key
  ON public.atividade_funcionarios (local_id);

-- atividade_sessoes
ALTER TABLE public.atividade_sessoes ADD COLUMN IF NOT EXISTS local_id text;
CREATE UNIQUE INDEX IF NOT EXISTS atividade_sessoes_local_id_key
  ON public.atividade_sessoes (local_id);

-- atividade_imprevistos
ALTER TABLE public.atividade_imprevistos ADD COLUMN IF NOT EXISTS local_id text;
CREATE UNIQUE INDEX IF NOT EXISTS atividade_imprevistos_local_id_key
  ON public.atividade_imprevistos (local_id);

-- atividades
ALTER TABLE public.atividades ADD COLUMN IF NOT EXISTS local_id text;
CREATE UNIQUE INDEX IF NOT EXISTS atividades_local_id_key
  ON public.atividades (local_id);
