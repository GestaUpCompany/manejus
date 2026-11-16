-- ============================================================================
-- Almoxarifado: modo de devolução por fazenda (somente schema, aditivo)
-- ============================================================================
-- Dois modos por fazenda:
--   'quem_retira'      -> cada pessoa devolve o que retirou (padrão, comportamento atual)
--   'um_devolve_todos' -> várias pessoas retiram, o responsável marcado devolve tudo
-- Esta migration só cria as colunas (padrão preserva o comportamento atual; PWAs antigos
-- continuam funcionando). A validação no servidor e a função de saldo do modo novo vêm em
-- migrations seguintes, depois de definido como o nome digitado no PWA se liga a um usuário.
-- Um responsável ativo por fazenda, garantido pelo índice parcial.
-- Rollback: supabase/rollbacks/20261116100000_almoxarifado_modo_devolucao_rollback.sql
-- ============================================================================

ALTER TABLE public.fazendas
  ADD COLUMN IF NOT EXISTS almoxarifado_modo_devolucao text NOT NULL DEFAULT 'quem_retira';

ALTER TABLE public.fazendas
  DROP CONSTRAINT IF EXISTS fazendas_almoxarifado_modo_devolucao_check;
ALTER TABLE public.fazendas
  ADD CONSTRAINT fazendas_almoxarifado_modo_devolucao_check
  CHECK (almoxarifado_modo_devolucao IN ('quem_retira', 'um_devolve_todos'));

ALTER TABLE public.usuario_fazenda
  ADD COLUMN IF NOT EXISTS responsavel_devolucao boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS usuario_fazenda_um_responsavel_devolucao_idx
  ON public.usuario_fazenda (fazenda_id)
  WHERE responsavel_devolucao = true AND ativo = true;
