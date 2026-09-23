-- ============================================================================
-- CREEP FEEDING — peso_vivo_kg da linha 'lote' preserva comportamento legado
--            quando o lote NÃO tem dieta creep vinculada
-- ============================================================================
-- A versão 20260923140000 passou a excluir categorias bezerro(a) ao pé da média
-- ponderada do escopo 'lote' incondicionalmente. Para lotes com ao pé mas SEM
-- dieta creep, isso mudava o peso_vivo_kg gravado nos registros novos em
-- relação à série histórica (que sempre incluiu todas as categorias).
--
-- Correção: a exclusão só se aplica quando o lote tem dieta creep vinculada
-- (categoria ao pé ativa com formulacao_id para formulação e_creep — o vínculo
-- é garantido por fn_lote_categoria_creep_integrity). Sem dieta, a média volta
-- a iterar todas as categorias, igual à versão 20260826120000.
CREATE OR REPLACE FUNCTION public.recalcular_peso_vivo_lote(
  p_lote_id uuid,
  p_ajuste_manual boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_plano_id uuid;
  v_data_inicio date;
  v_formulacao_id uuid;
  v_tem_plano boolean;
  v_tem_creep boolean;
  reg RECORD;
  cat RECORD;
  v_total_peso numeric;
  v_total_cabecas integer;
  v_cat_peso numeric;
  v_dias integer;
  v_peso_ponderado numeric;
BEGIN
  SELECT id, data_inicio, formulacao_id
  INTO v_plano_id, v_data_inicio, v_formulacao_id
  FROM planos_nutricionais
  WHERE lote_id = p_lote_id
    AND ativo = true
    AND data_fim IS NULL
  LIMIT 1;

  v_tem_plano := FOUND;

  -- Dieta creep vinculada? Só então as categorias ao pé saem da média do lote.
  SELECT EXISTS (
    SELECT 1
    FROM lote_categorias lc
    JOIN formulacoes f ON f.id = lc.formulacao_id AND f.e_creep = true
    WHERE lc.lote_id = p_lote_id
      AND lc.ativo = true
      AND lc.data_fim IS NULL
      AND lower(unaccent(trim(lc.categoria))) IN ('bezerro ao pe', 'bezerra ao pe')
  ) INTO v_tem_creep;

  FOR reg IN
    SELECT id, (data AT TIME ZONE 'America/Cuiaba')::date AS data_reg, escopo
    FROM registros_suplementacao
    WHERE lote_id = p_lote_id
      AND deleted_at IS NULL
  LOOP
    v_total_peso := 0;
    v_total_cabecas := 0;

    IF reg.escopo = 'creep' THEN
      -- Média ponderada das categorias bezerro(a) ao pé (GMD próprio em lc.gmd)
      FOR cat IN
        SELECT lc.quant_atual, lc.peso_vivo_atual_kg_cab, lc.data_ajuste_peso,
               NULLIF(lc.gmd, '')::numeric AS gmd_cat
        FROM lote_categorias lc
        WHERE lc.lote_id = p_lote_id
          AND lc.ativo = true
          AND lc.data_fim IS NULL
          AND lc.quant_atual > 0
          AND lower(unaccent(trim(lc.categoria))) IN ('bezerro ao pe', 'bezerra ao pe')
      LOOP
        IF cat.peso_vivo_atual_kg_cab IS NULL THEN
          CONTINUE;
        END IF;
        IF cat.gmd_cat IS NOT NULL THEN
          IF p_ajuste_manual AND cat.data_ajuste_peso IS NOT NULL THEN
            v_dias := (reg.data_reg - cat.data_ajuste_peso)::integer;
          ELSE
            v_dias := (reg.data_reg - CURRENT_DATE)::integer;
          END IF;
          v_cat_peso := cat.peso_vivo_atual_kg_cab + cat.gmd_cat * v_dias;
        ELSE
          v_cat_peso := cat.peso_vivo_atual_kg_cab;
        END IF;
        v_total_peso := v_total_peso + (v_cat_peso * cat.quant_atual);
        v_total_cabecas := v_total_cabecas + cat.quant_atual;
      END LOOP;
    ELSE
      -- escopo 'lote': exige plano ativo (comportamento anterior)
      IF NOT v_tem_plano THEN
        CONTINUE;
      END IF;

      FOR cat IN
        SELECT
          lc.id,
          lc.categoria,
          lc.quant_atual,
          lc.peso_vivo_atual_kg_cab,
          lc.data_ajuste_peso,
          COALESCE(pcp.peso_inicio_kg_cab, lc.peso_entrada_kg_cab) AS peso_inicio_cat,
          fcg.gmd AS gmd_cat
        FROM lote_categorias lc
        LEFT JOIN plano_categoria_personalizacao pcp
          ON pcp.plano_id = v_plano_id
          AND pcp.lote_categoria_id = lc.id
          AND pcp.ativo = true
        LEFT JOIN formulacao_categorias_gmd fcg
          ON fcg.formulacao_id = v_formulacao_id
          AND LOWER(TRIM(fcg.categoria)) = LOWER(TRIM(lc.categoria))
        WHERE lc.lote_id = p_lote_id
          AND lc.ativo = true
          AND lc.data_fim IS NULL
          AND lc.quant_atual > 0
          -- Ao pé só sai da média quando o lote tem dieta creep vinculada;
          -- sem dieta, itera todas as categorias como a versão anterior.
          AND (NOT v_tem_creep
               OR lower(unaccent(trim(lc.categoria))) NOT IN ('bezerro ao pe', 'bezerra ao pe'))
      LOOP
        IF cat.data_ajuste_peso IS NOT NULL AND cat.peso_vivo_atual_kg_cab IS NOT NULL AND cat.gmd_cat IS NOT NULL THEN
          IF p_ajuste_manual THEN
            v_dias := (reg.data_reg - cat.data_ajuste_peso)::integer;
          ELSE
            v_dias := (reg.data_reg - CURRENT_DATE)::integer;
          END IF;
          v_cat_peso := cat.peso_vivo_atual_kg_cab + cat.gmd_cat * v_dias;
        ELSIF cat.peso_inicio_cat IS NOT NULL AND v_data_inicio IS NOT NULL AND cat.gmd_cat IS NOT NULL THEN
          v_dias := GREATEST((reg.data_reg - v_data_inicio)::integer, 0);
          v_cat_peso := cat.peso_inicio_cat + cat.gmd_cat * v_dias;
        ELSE
          v_cat_peso := COALESCE(cat.peso_vivo_atual_kg_cab, cat.peso_inicio_cat, 0);
        END IF;

        v_total_peso := v_total_peso + (v_cat_peso * cat.quant_atual);
        v_total_cabecas := v_total_cabecas + cat.quant_atual;
      END LOOP;
    END IF;

    IF v_total_cabecas > 0 THEN
      v_peso_ponderado := v_total_peso / v_total_cabecas;

      UPDATE registros_suplementacao
      SET peso_vivo_kg = ROUND(v_peso_ponderado, 2),
          updated_at = NOW()
      WHERE id = reg.id
        AND peso_vivo_kg IS DISTINCT FROM ROUND(v_peso_ponderado, 2);
    END IF;
  END LOOP;
END;
$function$;
