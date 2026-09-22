-- ============================================================================
-- MIGRAÇÃO - Renomeia tipo de programação de tratos 'engorda' -> 'confinamento'
-- ============================================================================
-- O vocabulario passa a usar 'confinamento', alinhado ao tipo de lote.
-- O UPDATE precisa rodar entre o DROP e o ADD do CHECK: constraints CHECK
-- validam as linhas existentes no momento do ADD, entao as linhas 'engorda'
-- precisam ser migradas antes da nova constraint ser criada.
-- O mesmo rename e aplicado ao snapshot registros_fabrica_confinamento.tipo
-- (mesmo dominio, sem CHECK proprio) para manter o filtro de tipo do
-- Acompanhamento de Tratos consistente com o historico.

ALTER TABLE public.programacao_tratos
  DROP CONSTRAINT IF EXISTS programacao_tratos_tipo_check;

UPDATE public.programacao_tratos
  SET tipo = 'confinamento'
  WHERE tipo = 'engorda';

ALTER TABLE public.programacao_tratos
  ADD CONSTRAINT programacao_tratos_tipo_check
  CHECK (tipo = ANY (ARRAY['confinamento'::text, 'sequestro'::text, 'tip'::text]));

ALTER TABLE public.programacao_tratos
  ALTER COLUMN tipo SET DEFAULT 'confinamento';

UPDATE public.registros_fabrica_confinamento
  SET tipo = 'confinamento'
  WHERE tipo = 'engorda';

ALTER TABLE public.registros_fabrica_confinamento
  ALTER COLUMN tipo SET DEFAULT 'confinamento';
