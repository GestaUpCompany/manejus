-- ROLLBACK de 20261020240000_iatf_femea_baixada_sai_do_lote.sql
-- NÃO fica em supabase/migrations/ de propósito.
-- 1) DROP TRIGGER IF EXISTS trg_individuo_baixa_descarta_femea_iatf ON public.individuos;
--    DROP FUNCTION IF EXISTS public.trg_individuo_baixa_descarta_femea_iatf();
-- 2) Reaplicar o corpo de registrar_ia_lote_protocolo de 20261020230000_desfazer_ia_lote_protocolo.sql.
-- Vínculos já passados para Descartada pelo gatilho não voltam sozinhos (reativar pelo painel, se for o caso).
SELECT 1;
