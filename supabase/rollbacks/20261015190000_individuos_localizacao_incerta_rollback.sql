-- ROLLBACK de 20261015190000_individuos_localizacao_incerta.sql
-- NÃO fica em supabase/migrations/ de propósito. ATENÇÃO: apaga a coluna e os marcadores de incerteza já
-- gravados. Animais que acompanharam um lote esvaziado continuam no lote de destino (lote_atual não é revertido).
-- Reverta antes a migration 20261015200000 (a pesagem passa a ler a coluna).
DROP TRIGGER IF EXISTS trigger_zz_movimentacao_propaga_individuos ON public.registros_movimentacao;
DROP FUNCTION IF EXISTS public.trg_movimentacao_propaga_individuos();
DROP FUNCTION IF EXISTS public.confirmar_localizacao_individuos(uuid, uuid, uuid[]);
DROP INDEX IF EXISTS public.idx_individuos_localizacao_incerta;
ALTER TABLE public.individuos DROP COLUMN IF EXISTS localizacao_incerta_desde;
