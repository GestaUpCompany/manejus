-- ============================================================================
-- Indivíduos: remove o modo de identificação manual do lote (decisão de 16/10/2026)
-- ============================================================================
-- O nível de qualificação do lote (só contagem / parcial / completo) passou a ser CALCULADO a partir de
-- vw_lote_categoria_identificacao, e nenhum evento exige mais informar animais. Por isso saem:
--   * trigger trg_lotes_valida_modo_identificacao e sua função;
--   * RPC definir_modo_identificacao;
--   * constraint lotes_modo_identificacao_check e a coluna lotes.modo_identificacao.
-- Segurança: a migration aborta se algum lote tiver modo diferente de 'agregado' (nada seria perdido hoje: 618 lotes,
-- todos 'agregado'; nenhuma view, função ou código do painel/PWA lê a coluna).
-- Rollback (recria tudo como na 20261016130000): supabase/rollbacks/20261016210000_remove_modo_identificacao_manual_rollback.sql
-- ============================================================================

DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.lotes WHERE modo_identificacao <> 'agregado';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Há % lote(s) com modo_identificacao diferente de agregado; migration abortada para não perder essa informação.', v_n;
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_lotes_valida_modo_identificacao ON public.lotes;
DROP FUNCTION IF EXISTS public.trg_lotes_valida_modo_identificacao();
DROP FUNCTION IF EXISTS public.definir_modo_identificacao(uuid, uuid, text);
ALTER TABLE public.lotes DROP CONSTRAINT IF EXISTS lotes_modo_identificacao_check;
ALTER TABLE public.lotes DROP COLUMN IF EXISTS modo_identificacao;
