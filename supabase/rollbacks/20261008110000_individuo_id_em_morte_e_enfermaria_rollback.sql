-- ROLLBACK de 20261008110000_individuo_id_em_morte_e_enfermaria.sql
-- NÃO fica em supabase/migrations/ de propósito. ATENÇÃO: apaga os vínculos individuo_id já gravados.
-- Animais marcados como Morto por este gatilho NÃO voltam a Vivo sozinhos (reverta à mão, se preciso:
-- UPDATE individuos SET status='Vivo', data_saida=NULL, motivo_saida=NULL WHERE motivo_saida='Morte').
DROP TRIGGER IF EXISTS trg_registros_morte_baixa_individuo ON public.registros_morte;
DROP FUNCTION IF EXISTS public.trg_registros_morte_baixa_individuo();
DROP INDEX IF EXISTS public.idx_registros_morte_individuo_id;
DROP INDEX IF EXISTS public.idx_registros_enfermaria_individuo_id;
ALTER TABLE public.registros_morte DROP COLUMN IF EXISTS individuo_id;
ALTER TABLE public.registros_enfermaria DROP COLUMN IF EXISTS individuo_id;
