-- iniciar_plano_lote: peso_inicio_kg_cab da personalização nunca nasce nulo quando a categoria tem peso de entrada.
--
-- Problema: no ramo retroativo, quando falta peso de entrada, GMD ou data de pesagem, v_peso_inicio recebia
-- lote_categorias.peso_vivo_atual_kg_cab, que pode ser NULL (categoria sem GMD na formulação nunca teve peso projetado).
-- A personalização nascia com peso_inicio_kg_cab NULL. O PWA descartava a categoria da projeção do PV médio.
-- Ex.: "Lote Atual P1" (vaca, GMD 1,2, peso_vivo_atual NULL) em 2026-11-09.
--
-- Correção: v_peso_inicio cai para peso_entrada_kg_cab quando o peso atual é NULL (só a personalização muda;
-- lote_categorias.peso_vivo_atual_kg_cab continua como antes, porque os relatórios tratam NULL como dado faltante).
-- Corpo idêntico ao vigente (20260923130000) fora das duas linhas marcadas com "-- FIX".

CREATE OR REPLACE FUNCTION public.iniciar_plano_lote(p_lote_id uuid, p_plano_id uuid DEFAULT NULL::uuid, p_retroativo boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plano RECORD;
  v_lote RECORD;
  v_fazenda_id uuid;
  v_cat RECORD;
  v_gmd numeric;
  v_form RECORD;
  v_data_inicio_plano date;
  v_peso_inicio numeric;
  v_peso_projetado numeric;
  v_dias integer;
  v_data_cat date;
BEGIN
  PERFORM public.guard_w_lote(p_lote_id);
  SELECT * INTO v_lote FROM public.lotes WHERE id = p_lote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote nao encontrado'; END IF;
  v_fazenda_id := v_lote.fazenda_id;

  IF p_plano_id IS NULL THEN
    SELECT * INTO v_plano FROM public.planos_nutricionais
      WHERE lote_id = p_lote_id AND data_fim IS NULL AND data_inicio IS NULL
      ORDER BY ordem ASC LIMIT 1;
  ELSE
    SELECT * INTO v_plano FROM public.planos_nutricionais
      WHERE id = p_plano_id AND lote_id = p_lote_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nenhum plano disponivel para iniciar'; END IF;

  IF p_retroativo THEN
    SELECT MIN(data_pesagem) INTO v_data_inicio_plano
    FROM public.lote_categorias
    WHERE lote_id = p_lote_id AND ativo = true AND data_fim IS NULL
      AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerro ao pe'
      AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerra ao pe'
      AND data_pesagem IS NOT NULL;
    v_data_inicio_plano := COALESCE(v_data_inicio_plano, CURRENT_DATE);
  ELSE
    v_data_inicio_plano := CURRENT_DATE;
  END IF;

  UPDATE public.planos_nutricionais
  SET ativo = true, data_inicio = v_data_inicio_plano, data_fim = NULL
  WHERE id = v_plano.id;

  UPDATE public.lotes SET formulacao_id = v_plano.formulacao_id WHERE id = p_lote_id;
  SELECT * INTO v_form FROM public.formulacoes WHERE id = v_plano.formulacao_id;

  FOR v_cat IN SELECT * FROM public.lote_categorias
    WHERE lote_id = p_lote_id AND ativo = true AND data_fim IS NULL
      AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerro ao pe'
      AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerra ao pe'
  LOOP
    SELECT fcg.gmd INTO v_gmd FROM public.formulacao_categorias_gmd fcg
    WHERE fcg.formulacao_id = v_plano.formulacao_id
      AND LOWER(TRIM(fcg.categoria)) = LOWER(TRIM(v_cat.categoria));
    IF NOT FOUND THEN v_gmd := NULL; END IF;

    IF v_gmd IS NOT NULL AND v_lote.destino = 'enfermaria' THEN
      v_gmd := v_gmd * 0.5;
    END IF;

    IF p_retroativo THEN
      v_data_cat := v_cat.data_pesagem;
      v_peso_inicio := v_cat.peso_entrada_kg_cab;
      IF v_gmd IS NOT NULL AND v_peso_inicio IS NOT NULL AND v_data_cat IS NOT NULL THEN
        v_dias := GREATEST((CURRENT_DATE - v_data_cat)::integer, 0);
        v_peso_projetado := v_peso_inicio + (v_gmd * v_dias);
      ELSE
        v_peso_projetado := v_cat.peso_vivo_atual_kg_cab;
        v_peso_inicio := COALESCE(v_cat.peso_vivo_atual_kg_cab, v_cat.peso_entrada_kg_cab); -- FIX
      END IF;
    ELSE
      v_peso_inicio := COALESCE(v_cat.peso_vivo_atual_kg_cab, v_cat.peso_entrada_kg_cab); -- FIX
      v_peso_projetado := v_cat.peso_vivo_atual_kg_cab;
    END IF;

    UPDATE public.lote_categorias
    SET formulacao_id = v_plano.formulacao_id,
        estrategia_nutricional = v_form.nome,
        peso_vivo_meta_kg_cab = v_plano.peso_meta_kg,
        gmd = CASE WHEN v_gmd IS NOT NULL THEN v_gmd::text ELSE NULL END,
        consumo_meta_porcentagem_pesovivo = v_form.consumo_ms_percent_pv,
        peso_vivo_atual_kg_cab = v_peso_projetado,
        data_ajuste_peso = CASE
          WHEN p_retroativo AND (v_cat.data_pesagem IS NULL OR v_cat.peso_entrada_kg_cab IS NULL OR v_gmd IS NULL) THEN CURRENT_DATE
          ELSE NULL
        END,
        data_notificacao_meta = NULL,
        data_notificacao_periodo = NULL
    WHERE id = v_cat.id;

    INSERT INTO public.plano_categoria_personalizacao
      (plano_id, lote_categoria_id, periodo_dias, peso_meta_kg, peso_inicio_kg_cab, ativo)
    VALUES (v_plano.id, v_cat.id, v_plano.periodo_dias, v_plano.peso_meta_kg, v_peso_inicio, true)
    ON CONFLICT (plano_id, lote_categoria_id) DO UPDATE
    SET ativo = true,
        peso_inicio_kg_cab = EXCLUDED.peso_inicio_kg_cab,
        periodo_dias = EXCLUDED.periodo_dias,
        peso_meta_kg = EXCLUDED.peso_meta_kg;

    PERFORM public.criar_snapshot_entrada(
      v_plano.id,
      v_cat.id,
      CASE WHEN p_retroativo THEN 'inicio_lote_retroativo' ELSE 'inicio_lote' END
    );
  END LOOP;
END;
$function$;
