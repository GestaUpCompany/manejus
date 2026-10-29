-- Lotação calculada no banco: ua_ha e kg_ha do pasto ocupado e do lote que o ocupa.
-- Mesma regra de v_lote_pasto_ocupacao_atual.taxa_lotacao_ua_ha: peso = Σ(quant_atual × peso_vivo_atual_kg_cab)
-- das categorias ativas (fallback: cabecas_entrada × peso_vivo_medio_entrada_kg); UA = peso / 450;
-- ua_ha = UA / area_util_ha; kg_ha = peso / area_util_ha. Sem ocupação em pasto (ou sem área) fica NULL.
-- Curral não tem área útil: NULL.

ALTER TABLE public.pastos
  ADD COLUMN IF NOT EXISTS ua_ha numeric(10,2),
  ADD COLUMN IF NOT EXISTS kg_ha numeric(10,2);

-- Recalcula lotes.ua_ha/kg_ha e, se o lote ocupa pasto, também pastos.ua_ha/kg_ha desse pasto.
CREATE OR REPLACE FUNCTION public.recalcular_lotacao_lote(p_lote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pasto_id uuid;
  v_cabecas integer;
  v_peso_medio numeric;
  v_area numeric;
  v_peso_total numeric;
  v_ua numeric;
  v_kg numeric;
BEGIN
  IF p_lote_id IS NULL THEN
    RETURN;
  END IF;

  SELECT h.pasto_id, h.cabecas_entrada, h.peso_vivo_medio_entrada_kg
    INTO v_pasto_id, v_cabecas, v_peso_medio
    FROM lote_pasto_historico h
   WHERE h.lote_id = p_lote_id
     AND h.data_hora_saida IS NULL
     AND h.pasto_id IS NOT NULL
   ORDER BY h.data_hora_entrada DESC
   LIMIT 1;

  IF v_pasto_id IS NOT NULL THEN
    SELECT p.area_util_ha INTO v_area FROM pastos p WHERE p.id = v_pasto_id;
  END IF;

  IF v_pasto_id IS NOT NULL AND v_area > 0 THEN
    SELECT COALESCE(
      (SELECT SUM(lc.quant_atual::numeric * lc.peso_vivo_atual_kg_cab)
         FROM lote_categorias lc
        WHERE lc.lote_id = p_lote_id
          AND lc.ativo = true
          AND lc.quant_atual > 0
          AND lc.peso_vivo_atual_kg_cab IS NOT NULL),
      v_cabecas::numeric * v_peso_medio)
    INTO v_peso_total;

    v_ua := ROUND(v_peso_total / 450.0 / v_area, 2);
    v_kg := ROUND(v_peso_total / v_area, 2);
  ELSE
    v_ua := NULL;
    v_kg := NULL;
  END IF;

  UPDATE lotes SET ua_ha = v_ua, kg_ha = v_kg WHERE id = p_lote_id;

  IF v_pasto_id IS NOT NULL THEN
    UPDATE pastos SET ua_ha = v_ua, kg_ha = v_kg WHERE id = v_pasto_id;
  END IF;
END;
$$;

-- Limpa ou recalcula o pasto a partir do lote que o ocupa agora (se houver).
CREATE OR REPLACE FUNCTION public.recalcular_lotacao_pasto(p_pasto_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lote_id uuid;
BEGIN
  IF p_pasto_id IS NULL THEN
    RETURN;
  END IF;

  SELECT h.lote_id INTO v_lote_id
    FROM lote_pasto_historico h
   WHERE h.pasto_id = p_pasto_id
     AND h.data_hora_saida IS NULL
   ORDER BY h.data_hora_entrada DESC
   LIMIT 1;

  IF v_lote_id IS NULL THEN
    UPDATE pastos SET ua_ha = NULL, kg_ha = NULL WHERE id = p_pasto_id;
  ELSE
    PERFORM public.recalcular_lotacao_lote(v_lote_id);
  END IF;
END;
$$;

-- Ocupação entrou, saiu ou trocou de pasto: recalcula o pasto novo, o antigo e o lote.
CREATE OR REPLACE FUNCTION public.trg_lotacao_lote_pasto_historico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.pasto_id IS NOT NULL AND OLD.pasto_id IS DISTINCT FROM NEW.pasto_id THEN
    PERFORM public.recalcular_lotacao_pasto(OLD.pasto_id);
  END IF;
  IF NEW.pasto_id IS NOT NULL THEN
    PERFORM public.recalcular_lotacao_pasto(NEW.pasto_id);
  END IF;
  PERFORM public.recalcular_lotacao_lote(NEW.lote_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_lotacao_lote_pasto_historico ON public.lote_pasto_historico;
CREATE TRIGGER trg_lotacao_lote_pasto_historico
  AFTER INSERT OR UPDATE OF data_hora_saida, pasto_id, cabecas_entrada, peso_vivo_medio_entrada_kg
  ON public.lote_pasto_historico
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_lotacao_lote_pasto_historico();

-- Peso e quantidade das categorias (inclusive a atualização diária do cron) recalculam o lote.
CREATE OR REPLACE FUNCTION public.trg_lotacao_lote_categorias()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalcular_lotacao_lote(COALESCE(NEW.lote_id, OLD.lote_id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_lotacao_lote_categorias ON public.lote_categorias;
CREATE TRIGGER trg_lotacao_lote_categorias
  AFTER INSERT OR UPDATE OF quant_atual, peso_vivo_atual_kg_cab, ativo OR DELETE
  ON public.lote_categorias
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_lotacao_lote_categorias();

-- Mudança de área útil do pasto recalcula a lotação do pasto.
CREATE OR REPLACE FUNCTION public.trg_lotacao_pasto_area()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalcular_lotacao_pasto(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_lotacao_pasto_area ON public.pastos;
CREATE TRIGGER trg_lotacao_pasto_area
  AFTER UPDATE OF area_util_ha ON public.pastos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_lotacao_pasto_area();

-- Sem backfill aqui: a carga inicial dos registros existentes é dado operacional (ver procedimento de escrita).
