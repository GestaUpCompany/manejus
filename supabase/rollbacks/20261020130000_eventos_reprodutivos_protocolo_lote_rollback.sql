-- ROLLBACK de 20261020130000_eventos_reprodutivos_protocolo_lote.sql
-- NÃO fica em supabase/migrations/ de propósito.
-- ATENÇÃO: a coluna protocolo_lote_id é apagada (o elo das Inseminações com o lote se perde; os eventos em si ficam).
DROP FUNCTION IF EXISTS public.registrar_ia_lote_protocolo(uuid, uuid, date, text, text, text, uuid[], text, text, text);
DROP TRIGGER IF EXISTS trg_eventos_reprodutivos_protocolo ON public.eventos_reprodutivos;
DROP FUNCTION IF EXISTS public.trg_eventos_reprodutivos_protocolo();
DROP INDEX IF EXISTS public.idx_eventos_reprodutivos_protocolo_lote;
ALTER TABLE public.eventos_reprodutivos DROP COLUMN IF EXISTS protocolo_lote_id;
