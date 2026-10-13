-- Rollback: 1) reexecutar o CREATE OR REPLACE de get_dados_relatorio_consumo em
-- supabase/migrations/20260929120000_relatorio_consumo_pasto_curral.sql
-- 2) remover a função auxiliar:
DROP FUNCTION IF EXISTS public.calculate_quant_em(uuid, text, timestamptz);
