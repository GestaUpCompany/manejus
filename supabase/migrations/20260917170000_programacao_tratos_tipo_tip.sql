-- Permite tipo 'tip' em programacao_tratos
--
-- O CHECK programacao_tratos_tipo_check aceitava apenas 'engorda' e
-- 'sequestro', mas o painel oferece TIP como tipo selecionável na tela de
-- Lançamento de Tratos e na Configuração de Tratos. Sem 'tip' no CHECK, criar
-- uma programação de TIP falharia no banco.

ALTER TABLE public.programacao_tratos
  DROP CONSTRAINT programacao_tratos_tipo_check;

ALTER TABLE public.programacao_tratos
  ADD CONSTRAINT programacao_tratos_tipo_check
  CHECK (tipo = ANY (ARRAY['engorda'::text, 'sequestro'::text, 'tip'::text]));
