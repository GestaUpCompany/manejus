-- ============================================================================
-- Ajuste de quantidade por categoria: novo motivo de movimentação 'Ajuste'
-- ============================================================================
-- Parte 1 de 2. O valor novo do enum não pode ser usado na mesma transação em que é
-- criado, por isso a função e a RPC ficam em 20261030110000_ajustar_quantidade_lote_categoria.sql.
-- Rollback: supabase/rollbacks/20261030100000_motivo_movimentacao_ajuste_rollback.sql
-- ============================================================================

ALTER TYPE public.tipo_movimentacao_motivo ADD VALUE IF NOT EXISTS 'Ajuste';
