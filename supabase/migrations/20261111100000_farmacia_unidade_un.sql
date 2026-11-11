-- Farmácia: unidade "un" (unidade) para o conteúdo do medicamento (ex.: implante, 1 un por embalagem).
-- Antes só aceitava mL e mg, então um cadastro com UN era recusado no sync.
-- A função de conversão dose -> estoque passa a reconhecer "un" na dose, igual a mL e mg.
-- Rollback: volte a constraint para ('mL','mg') e a regex sem "un" (versão de 20261021120000_farmacia_baixa_enfermaria.sql).

ALTER TABLE public.medicamentos
  DROP CONSTRAINT IF EXISTS medicamentos_conteudo_check;
ALTER TABLE public.medicamentos
  ADD CONSTRAINT medicamentos_conteudo_check CHECK (
    (conteudo_por_unidade IS NULL AND conteudo_unidade IS NULL)
    OR (conteudo_por_unidade > 0 AND conteudo_unidade IN ('mL', 'mg', 'un'))
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
  v_match := regexp_match(coalesce(p_dose, ''), '^\s*(\d+(?:[.,]\d+)?)\s*(ml|mg|un)?\s*$', 'i');
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
