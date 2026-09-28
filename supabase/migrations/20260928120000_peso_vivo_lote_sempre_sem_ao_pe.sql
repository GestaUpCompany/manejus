-- ============================================================================
-- peso_vivo_kg do escopo 'lote': média ponderada SEM categorias ao pé sempre
-- ============================================================================
-- Contexto: consumo por cabeça usa denominador (n_cabecas - qtd_bezerros), ou
-- seja, o numerador já é "por adulto". Mas o peso de base para %PV vinha sendo
-- a média ponderada de TODAS as categorias quando o lote não tinha dieta creep
-- (exceção introduzida em 20260923190000 para preservar comportamento legado).
-- Isso misturava bases: kg por adulto dividido por peso diluído por bezerros,
-- inflando o %PV (ex.: Brilhante, Lote 05: exibia ~2,07% onde o correto é
-- 288 kg ÷ 35 vacas = 7,29 kg MS ÷ 457 kg = 1,595% PV).
--
-- Decisão: a base de peso do escopo 'lote' é sempre a média ponderada das
-- categorias não-ao-pé, com ou sem dieta creep. Escopo 'creep' inalterado.
--
-- Sem backfill nesta migration: o cron update_dados_lotes e os próximos
-- inserts/edits já regravam peso_vivo_kg via triggers existentes.
-- ============================================================================

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
          -- Categorias ao pé nunca entram na base de peso do escopo 'lote':
          -- o numerador de consumo já exclui bezerros (n_cabecas - qtd_bezerros)
          AND lower(unaccent(trim(lc.categoria))) NOT IN ('bezerro ao pe', 'bezerra ao pe')
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
