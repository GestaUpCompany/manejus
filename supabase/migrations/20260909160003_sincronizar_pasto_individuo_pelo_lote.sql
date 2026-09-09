-- ============================================================================
-- MIGRAÇÃO - Sincronização profissional de pasto entre lote e indivíduo
-- ============================================================================
-- Garante que individuos.pasto_atual sempre reflita o pasto do lote ao qual
-- o indivíduo pertence. Cobre:
--   1. Mudança de pasto de um lote (propaga para todos os indivíduos do lote).
--   2. Mudança de lote do indivíduo (atualiza o pasto conforme o novo lote).
--   3. Inserção de novo indivíduo com lote_atual preenchido.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Trigger: quando o pasto do lote muda, atualiza os indivíduos do lote
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_lotes_sincronizar_pasto_individuos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só executa se o pasto do lote realmente mudou (trata NULL corretamente)
  IF NEW.pasto_id IS DISTINCT FROM OLD.pasto_id THEN
    UPDATE public.individuos
    SET
      pasto_atual = NEW.pasto_id,
      updated_at = now()
    WHERE lote_atual = NEW.id
      AND fazenda_id = NEW.fazenda_id
      AND deleted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lotes_sincronizar_pasto_individuos ON public.lotes;
CREATE TRIGGER trg_lotes_sincronizar_pasto_individuos
AFTER UPDATE OF pasto_id ON public.lotes
FOR EACH ROW
EXECUTE FUNCTION public.trg_lotes_sincronizar_pasto_individuos();

-- ----------------------------------------------------------------------------
-- 2. Trigger: quando o indivíduo muda de lote ou é inserido, deriva o pasto
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_individuos_sincronizar_pasto_pelo_lote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pasto_id uuid;
BEGIN
  -- Se não há lote, o pasto fica nulo (fonte única de verdade é o lote)
  IF NEW.lote_atual IS NULL THEN
    IF NEW.pasto_atual IS DISTINCT FROM NULL THEN
      NEW.pasto_atual := NULL;
      NEW.updated_at := now();
    END IF;
    RETURN NEW;
  END IF;

  -- Busca o pasto atual do lote (ignora lotes excluídos)
  SELECT pasto_id INTO v_pasto_id
  FROM public.lotes
  WHERE id = NEW.lote_atual
    AND fazenda_id = NEW.fazenda_id
    AND deleted_at IS NULL;

  -- Se o lote não existe ou está excluído, limpa o pasto
  IF v_pasto_id IS NULL THEN
    IF NEW.pasto_atual IS DISTINCT FROM NULL THEN
      NEW.pasto_atual := NULL;
      NEW.updated_at := now();
    END IF;
    RETURN NEW;
  END IF;

  -- Sincroniza o pasto do indivíduo com o do lote, se necessário
  IF NEW.pasto_atual IS DISTINCT FROM v_pasto_id THEN
    NEW.pasto_atual := v_pasto_id;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_individuos_sincronizar_pasto_pelo_lote ON public.individuos;
CREATE TRIGGER trg_individuos_sincronizar_pasto_pelo_lote
BEFORE INSERT OR UPDATE OF lote_atual ON public.individuos
FOR EACH ROW
EXECUTE FUNCTION public.trg_individuos_sincronizar_pasto_pelo_lote();

-- ----------------------------------------------------------------------------
-- 3. Backfill: corrige eventuais desalinhamentos existentes
-- ----------------------------------------------------------------------------
UPDATE public.individuos i
SET
  pasto_atual = l.pasto_id,
  updated_at = now()
FROM public.lotes l
WHERE i.lote_atual = l.id
  AND i.fazenda_id = l.fazenda_id
  AND l.deleted_at IS NULL
  AND i.deleted_at IS NULL
  AND i.pasto_atual IS DISTINCT FROM l.pasto_id;

-- Indivíduos sem lote ou com lote excluído ficam com pasto nulo
UPDATE public.individuos
SET
  pasto_atual = NULL,
  updated_at = now()
WHERE deleted_at IS NULL
  AND (
    lote_atual IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.lotes l
      WHERE l.id = individuos.lote_atual
        AND l.fazenda_id = individuos.fazenda_id
        AND l.deleted_at IS NULL
    )
  )
  AND pasto_atual IS NOT NULL;
