-- ============================================================================
-- Idade atual das categorias: colunas, trigger e cron diário
-- ============================================================================
-- lote_categorias.idade (meses) é a idade na data-base (data da pesagem/entrada) e não envelhecia.
-- Mantemos `idade` como está (PWA, relatórios e cópias seguem iguais) e adicionamos:
--   idade_data_ref : data em que `idade` era verdadeira
--   idade_atual    : idade + meses completos decorridos desde idade_data_ref (recalculada todo dia)
-- Trigger: ao inserir com idade (sem idade_data_ref) ou ao mudar `idade`, define idade_data_ref =
-- COALESCE(data_pesagem, hoje em Cuiabá) e recalcula idade_atual. Se o chamador informar idade_data_ref
-- (ex.: cópia de categoria), ela é respeitada.
-- Cron: atualizar_idade_categorias() às 03:00 de Cuiabá (07:00 UTC), só toca linhas que mudam.
-- Backfill dos dados existentes: pontual, via MCP, com autorização escopada (não faz parte da migration).
-- Rollback: supabase/rollbacks/20261013120000_idade_atual_categorias_rollback.sql
-- ============================================================================

ALTER TABLE public.lote_categorias
  ADD COLUMN IF NOT EXISTS idade_data_ref date,
  ADD COLUMN IF NOT EXISTS idade_atual integer;

COMMENT ON COLUMN public.lote_categorias.idade_data_ref IS 'Data em que lote_categorias.idade (meses) era verdadeira (data da pesagem/entrada).';
COMMENT ON COLUMN public.lote_categorias.idade_atual IS 'Idade em meses hoje = idade + meses completos desde idade_data_ref. Recalculada pelo cron atualizar_idade_categorias().';

CREATE OR REPLACE FUNCTION public.calcular_idade_atual(p_idade integer, p_ref date)
RETURNS integer
LANGUAGE sql
STABLE
SET "TimeZone" TO 'America/Cuiaba'
AS $$
  SELECT CASE
    WHEN p_idade IS NULL OR p_ref IS NULL THEN NULL
    WHEN p_ref >= CURRENT_DATE THEN p_idade
    ELSE p_idade + (EXTRACT(YEAR FROM age(CURRENT_DATE, p_ref)) * 12 + EXTRACT(MONTH FROM age(CURRENT_DATE, p_ref)))::int
  END
$$;

CREATE OR REPLACE FUNCTION public.fn_lote_categorias_idade_ref()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $$
BEGIN
  IF NEW.idade IS NULL THEN
    NEW.idade_data_ref := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.idade_data_ref IS NULL THEN
      NEW.idade_data_ref := COALESCE(NEW.data_pesagem, CURRENT_DATE);
    END IF;
  ELSIF NEW.idade IS DISTINCT FROM OLD.idade
        AND NEW.idade_data_ref IS NOT DISTINCT FROM OLD.idade_data_ref THEN
    NEW.idade_data_ref := COALESCE(NEW.data_pesagem, CURRENT_DATE);
  ELSIF NEW.idade_data_ref IS NULL THEN
    NEW.idade_data_ref := COALESCE(NEW.data_pesagem, CURRENT_DATE);
  END IF;

  NEW.idade_atual := public.calcular_idade_atual(NEW.idade, NEW.idade_data_ref);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lote_categorias_idade_ref ON public.lote_categorias;
CREATE TRIGGER trg_lote_categorias_idade_ref
  BEFORE INSERT OR UPDATE OF idade, idade_data_ref ON public.lote_categorias
  FOR EACH ROW EXECUTE FUNCTION public.fn_lote_categorias_idade_ref();

CREATE OR REPLACE FUNCTION public.atualizar_idade_categorias()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $$
DECLARE
  v_linhas integer;
BEGIN
  UPDATE lote_categorias lc
  SET idade_atual = public.calcular_idade_atual(lc.idade, lc.idade_data_ref)
  WHERE lc.ativo = true
    AND lc.data_fim IS NULL
    AND lc.idade IS NOT NULL
    AND lc.idade_data_ref IS NOT NULL
    AND lc.idade_atual IS DISTINCT FROM public.calcular_idade_atual(lc.idade, lc.idade_data_ref);

  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RETURN v_linhas;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.atualizar_idade_categorias() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_idade_categorias() TO service_role;
REVOKE EXECUTE ON FUNCTION public.calcular_idade_atual(integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_idade_atual(integer, date) TO authenticated, service_role;

SELECT cron.schedule('atualizar-idade-categorias', '0 7 * * *', 'SELECT public.atualizar_idade_categorias();');
