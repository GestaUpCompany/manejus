-- ROLLBACK de 20261020260000_iatf_femea_em_um_lote_por_vez.sql
-- NÃO fica em supabase/migrations/ de propósito.
-- Reaplicar o corpo de criar_lote_protocolo_iatf de 20261020110000_lotes_protocolo_iatf.sql e o de
-- trg_lotes_protocolo_iatf_filho_validar de 20261020120000_fix_gatilho_filho_lotes_protocolo_iatf.sql.
SELECT 1;
