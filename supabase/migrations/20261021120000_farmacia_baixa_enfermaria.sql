-- Baixa automática do estoque da farmácia a cada registro de Enfermaria (fase 2 da Farmácia).
--
-- Cada item de registros_enfermaria.medicamentos traz medicamentoId e doseAplicada (texto: "20 ml",
-- "1,5 mg" ou só "15", que vale ml). O trigger converte a dose para a unidade de estoque do
-- medicamento e grava uma 'baixa' em movimentacoes_farmacia (origem 'enfermaria', registro_origem_id
-- = id do registro). Conversão (farmacia_dose_para_estoque):
--   * estoque em mL/L (dose em ml) ou g/kg (dose em mg): conversão direta;
--   * estoque em frasco/dose/caixa/un: usa conteudo_por_unidade + conteudo_unidade (mL ou mg) do
--     medicamento, desde que a unidade do conteúdo seja a mesma da dose (20 ml ÷ 500 mL = 0,04 frasco);
--   * sem conversão possível ou sem controla_estoque: não baixa (o registro da Enfermaria segue normal).
-- Registros antigos não geram baixa retroativa (o trigger só age em INSERT/UPDATE/DELETE futuros).
-- Editar ou excluir o registro estorna (soft delete) a baixa antiga e gera a nova; baixas da Enfermaria
-- são idempotentes pelo índice uq_mov_farmacia_registro_med_tipo_ativo.
--
-- Também impede trocar medicamentos.unidade depois que há lançamento (o histórico ficaria errado).
-- Rollback: supabase/rollbacks/20261021120000_farmacia_baixa_enfermaria_rollback.sql

ALTER TABLE public.medicamentos
  ADD COLUMN IF NOT EXISTS conteudo_por_unidade numeric(12,3),
  ADD COLUMN IF NOT EXISTS conteudo_unidade text;

ALTER TABLE public.medicamentos
  DROP CONSTRAINT IF EXISTS medicamentos_conteudo_check;
ALTER TABLE public.medicamentos
  ADD CONSTRAINT medicamentos_conteudo_check CHECK (
    (conteudo_por_unidade IS NULL AND conteudo_unidade IS NULL)
    OR (conteudo_por_unidade > 0 AND conteudo_unidade IN ('mL', 'mg'))
  );

CREATE OR REPLACE FUNCTION public.farmacia_dose_para_estoque(
  p_dose text,
  p_unidade_estoque text,
  p_conteudo numeric,
  p_conteudo_unidade text
) RETURNS numeric AS $$
DECLARE
  v_match text[];
  v_num numeric;
  v_un text;
  v_estoque text := lower(coalesce(p_unidade_estoque, ''));
BEGIN
  v_match := regexp_match(coalesce(p_dose, ''), '^\s*(\d+(?:[.,]\d+)?)\s*(ml|mg)?\s*$', 'i');
  IF v_match IS NULL THEN RETURN NULL; END IF;
  v_num := replace(v_match[1], ',', '.')::numeric;
  v_un := lower(coalesce(v_match[2], 'ml'));
  IF v_num <= 0 THEN RETURN NULL; END IF;

  IF v_estoque = 'ml' AND v_un = 'ml' THEN RETURN v_num; END IF;
  IF v_estoque = 'l' AND v_un = 'ml' THEN RETURN v_num / 1000; END IF;
  IF v_estoque = 'g' AND v_un = 'mg' THEN RETURN v_num / 1000; END IF;
  IF v_estoque = 'kg' AND v_un = 'mg' THEN RETURN v_num / 1000000; END IF;

  IF v_estoque IN ('ml', 'l', 'g', 'kg') THEN RETURN NULL; END IF;
  IF p_conteudo IS NOT NULL AND p_conteudo > 0 AND lower(coalesce(p_conteudo_unidade, '')) = v_un THEN
    RETURN v_num / p_conteudo;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.trg_enfermaria_baixa_farmacia()
RETURNS trigger AS $$
DECLARE
  v_item record;
  v_med record;
  v_qtd numeric;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.medicamentos IS NOT DISTINCT FROM NEW.medicamentos
     AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at
     AND OLD.data IS NOT DISTINCT FROM NEW.data THEN
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE public.movimentacoes_farmacia
    SET deleted_at = now(), updated_at = now()
    WHERE registro_origem_id = OLD.id AND origem = 'enfermaria' AND deleted_at IS NULL;
  END IF;
  IF TG_OP = 'DELETE' OR NEW.deleted_at IS NOT NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  FOR v_item IN
    SELECT i.value->>'medicamentoId' AS mid_txt,
           array_agg(i.value->>'doseAplicada') AS doses
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(NEW.medicamentos) = 'array' THEN NEW.medicamentos ELSE '[]'::jsonb END
         ) i
    GROUP BY 1
  LOOP
    BEGIN
      SELECT id, unidade, conteudo_por_unidade, conteudo_unidade INTO v_med
      FROM public.medicamentos
      WHERE id = NULLIF(v_item.mid_txt, '')::uuid
        AND fazenda_id = NEW.fazenda_id AND controla_estoque AND deleted_at IS NULL;
    EXCEPTION WHEN invalid_text_representation THEN
      CONTINUE;
    END;
    IF v_med.id IS NULL THEN CONTINUE; END IF;

    SELECT COALESCE(SUM(public.farmacia_dose_para_estoque(d, v_med.unidade, v_med.conteudo_por_unidade, v_med.conteudo_unidade)), 0)
    INTO v_qtd
    FROM unnest(v_item.doses) AS d;
    v_qtd := ROUND(v_qtd, 3);
    IF v_qtd <= 0 THEN CONTINUE; END IF;

    INSERT INTO public.movimentacoes_farmacia
      (fazenda_id, medicamento_id, tipo_movimentacao, quantidade, origem, registro_origem_id, data, nome_usuario, observacao)
    VALUES
      (NEW.fazenda_id, v_med.id, 'baixa', v_qtd, 'enfermaria', NEW.id,
       (NEW.data AT TIME ZONE 'America/Cuiaba')::date, NEW.nome_usuario, 'Baixa automática da Enfermaria');
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enfermaria_baixa_farmacia ON public.registros_enfermaria;
CREATE TRIGGER trg_enfermaria_baixa_farmacia
  AFTER INSERT OR UPDATE OR DELETE ON public.registros_enfermaria
  FOR EACH ROW EXECUTE FUNCTION public.trg_enfermaria_baixa_farmacia();

CREATE OR REPLACE FUNCTION public.medicamentos_bloquear_troca_unidade()
RETURNS trigger AS $$
BEGIN
  IF NEW.unidade IS DISTINCT FROM OLD.unidade
     AND EXISTS (SELECT 1 FROM public.movimentacoes_farmacia WHERE medicamento_id = NEW.id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'A unidade de medida não pode ser alterada depois que o medicamento tem lançamentos de estoque.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_medicamentos_bloquear_troca_unidade ON public.medicamentos;
CREATE TRIGGER trg_medicamentos_bloquear_troca_unidade
  BEFORE UPDATE OF unidade ON public.medicamentos
  FOR EACH ROW EXECUTE FUNCTION public.medicamentos_bloquear_troca_unidade();
