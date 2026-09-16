-- Revisao do fluxo de almoxarifado: unidade de medida.
--
-- Antes: itens_almoxarifado.unidade era livre para edicao mesmo com estoque e
-- historico. Trocar m -> un reescrevia o sentido de todo o historico, porque
-- movimentacoes_almoxarifado nao guardava a unidade do momento do lancamento.
--
-- Agora:
-- 1. movimentacoes_almoxarifado.unidade guarda snapshot da unidade do item no
--    momento do lancamento (trigger BEFORE INSERT + backfill dos existentes).
-- 2. Trocar unidade de item com movimentacao ativa ou estoque <> 0 e bloqueado
--    por trigger: a unidade base passa a ser imutavel uma vez transacionada.

ALTER TABLE public.movimentacoes_almoxarifado
  ADD COLUMN IF NOT EXISTS unidade text;

UPDATE public.movimentacoes_almoxarifado m
SET unidade = i.unidade
FROM public.itens_almoxarifado i
WHERE m.item_id = i.id
  AND m.unidade IS NULL;

CREATE OR REPLACE FUNCTION public.mov_almox_snapshot_unidade()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.unidade IS NULL THEN
    SELECT unidade INTO NEW.unidade
    FROM public.itens_almoxarifado
    WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mov_almox_snapshot_unidade ON public.movimentacoes_almoxarifado;
CREATE TRIGGER trg_mov_almox_snapshot_unidade
BEFORE INSERT ON public.movimentacoes_almoxarifado
FOR EACH ROW EXECUTE FUNCTION public.mov_almox_snapshot_unidade();

CREATE OR REPLACE FUNCTION public.itens_almox_bloquear_troca_unidade()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.unidade IS DISTINCT FROM OLD.unidade
     AND (OLD.estoque_atual <> 0 OR EXISTS (
       SELECT 1
       FROM public.movimentacoes_almoxarifado
       WHERE item_id = OLD.id
         AND deleted_at IS NULL
     )) THEN
    RAISE EXCEPTION 'Unidade de medida nao pode ser alterada: o item ja possui estoque ou movimentacoes. Cadastre um novo item.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_itens_almox_bloqueia_unidade ON public.itens_almoxarifado;
CREATE TRIGGER trg_itens_almox_bloqueia_unidade
BEFORE UPDATE OF unidade ON public.itens_almoxarifado
FOR EACH ROW EXECUTE FUNCTION public.itens_almox_bloquear_troca_unidade();

NOTIFY pgrst, 'reload schema';
