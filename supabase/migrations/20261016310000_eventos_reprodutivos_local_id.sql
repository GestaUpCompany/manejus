-- ============================================================================
-- Indivíduos / Fase 4 no PWA (P3): eventos_reprodutivos passa a aceitar envio idempotente do PWA
-- ============================================================================
-- O PWA grava offline e reenvia na volta do sinal; sem chave do registro local, um reenvio duplicaria o evento.
-- Mesmo padrão de aplicacoes_sanitarias: local_id com índice único COMPLETO (índice parcial dá 42P10 no upsert)
-- e origem painel|pwa. Só colunas novas, nulas ou com padrão: o painel e o PWA antigo seguem válidos.
-- Rollback: supabase/rollbacks/20261016310000_eventos_reprodutivos_local_id_rollback.sql
-- ============================================================================

ALTER TABLE public.eventos_reprodutivos
  ADD COLUMN local_id text,
  ADD COLUMN origem text NOT NULL DEFAULT 'painel';

ALTER TABLE public.eventos_reprodutivos
  ADD CONSTRAINT eventos_reprodutivos_origem_check CHECK (origem IN ('painel', 'pwa'));

CREATE UNIQUE INDEX eventos_reprodutivos_local_id_key ON public.eventos_reprodutivos (local_id);
