-- Rollback de 20261021120000_farmacia_baixa_enfermaria.sql
-- As baixas já geradas (origem 'enfermaria') permanecem em movimentacoes_farmacia; para estorná-las:
--   UPDATE public.movimentacoes_farmacia SET deleted_at = now() WHERE origem = 'enfermaria' AND deleted_at IS NULL;
DROP TRIGGER IF EXISTS trg_enfermaria_baixa_farmacia ON public.registros_enfermaria;
DROP FUNCTION IF EXISTS public.trg_enfermaria_baixa_farmacia();
DROP TRIGGER IF EXISTS trg_medicamentos_bloquear_troca_unidade ON public.medicamentos;
DROP FUNCTION IF EXISTS public.medicamentos_bloquear_troca_unidade();
DROP FUNCTION IF EXISTS public.farmacia_dose_para_estoque(text, text, numeric, text);
ALTER TABLE public.medicamentos DROP CONSTRAINT IF EXISTS medicamentos_conteudo_check;
ALTER TABLE public.medicamentos
  DROP COLUMN IF EXISTS conteudo_por_unidade,
  DROP COLUMN IF EXISTS conteudo_unidade;
