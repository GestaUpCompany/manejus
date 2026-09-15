-- ============================================================================
-- MIGRAÇÃO G - Desativar triggers legados quebrados
-- Os triggers legados (atualizar_estoque_entrada, atualizar_estoque_saida, etc.)
-- foram substituídos pelos novos triggers da Migration E que operam nas tabelas
-- de itens e usam a tabela movimentacoes_estoque_suplementos com WAC.
-- A tabela movimentacao_estoque legada é mantida como auditoria histórica.
-- ============================================================================

-- ==================== Dropar triggers legados (cabeçalho) ====================
DROP TRIGGER IF EXISTS trg_estoque_entrada ON public.registros_entrada_insumos;
DROP TRIGGER IF EXISTS trg_estoque_entrada_update ON public.registros_entrada_insumos;
DROP TRIGGER IF EXISTS trg_estoque_entrada_delete ON public.registros_entrada_insumos;
DROP TRIGGER IF EXISTS trg_estoque_saida ON public.registros_saida_insumos;
DROP TRIGGER IF EXISTS trg_estoque_saida_update_delete ON public.registros_saida_insumos;

-- ==================== Dropar triggers legados (itens) ====================
-- Estes triggers atualizam insumos.estoque_atual diretamente, causando
-- dupla contagem com o trigger WAC (update_estoque_suplemento).
DROP TRIGGER IF EXISTS trg_estoque_item_entrada_insert ON public.entrada_insumos_itens;
DROP TRIGGER IF EXISTS trg_estoque_saida_delete ON public.registros_saida_insumos;
DROP TRIGGER IF EXISTS trg_estoque_saida_update ON public.registros_saida_insumos;

-- ==================== Dropar funções legadas (cabeçalho) ====================
DROP FUNCTION IF EXISTS public.atualizar_estoque_entrada();
DROP FUNCTION IF EXISTS public.atualizar_estoque_entrada_update();
DROP FUNCTION IF EXISTS public.atualizar_estoque_entrada_delete();
DROP FUNCTION IF EXISTS public.atualizar_estoque_saida();
DROP FUNCTION IF EXISTS public.atualizar_estoque_saida_update_delete();

-- ==================== Dropar funções legadas (itens) ====================
DROP FUNCTION IF EXISTS public.atualizar_estoque_item_entrada();
DROP FUNCTION IF EXISTS public.atualizar_estoque_saida_delete();
DROP FUNCTION IF EXISTS public.atualizar_estoque_saida_update();

-- ==================== Marcar tabela legada como deprecated ====================
COMMENT ON TABLE public.movimentacao_estoque IS
  'DEPRECATED: Tabela legada de movimentações. Substituída por movimentacoes_estoque_suplementos. Mantida apenas para auditoria histórica.';
