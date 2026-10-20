-- ROLLBACK de 20261020290000_iatf_descartar_femea_rpc.sql
-- NÃO fica em supabase/migrations/ de propósito.
-- 1) DROP FUNCTION IF EXISTS public.descartar_femea_lote_protocolo(uuid, uuid, uuid, text);
-- 2) Reaplicar o corpo de trg_individuo_baixa_descarta_femea_iatf de 20261020240000_iatf_femea_baixada_sai_do_lote.sql
--    (com o bloco que conclui o passo de IA inline).
-- 3) DROP FUNCTION IF EXISTS public.iatf_concluir_ia_se_completa(uuid, uuid);  (só depois do passo 2)
SELECT 1;
