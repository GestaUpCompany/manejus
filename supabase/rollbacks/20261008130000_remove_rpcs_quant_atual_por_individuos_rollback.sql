-- ROLLBACK de 20261008130000_remove_rpcs_quant_atual_por_individuos.sql
-- NÃO fica em supabase/migrations/ de propósito. Recria as duas RPCs como estavam (corpos originais).
-- ATENÇÃO: ambas já falhavam com 42P10 (ON CONFLICT sem o predicado do índice parcial) e, se forem
-- "consertadas", sobrescrevem lote_categorias.quant_atual com a contagem de indivíduos.

CREATE OR REPLACE FUNCTION public.update_quant_atual_with_data(p_lote_id uuid, p_categoria character varying, p_raca character varying DEFAULT NULL::character varying, p_sexo character varying DEFAULT NULL::character varying)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
    v_quant_atual INTEGER;
    v_sexo_normalizado VARCHAR;
BEGIN
  PERFORM public.guard_w_lote(p_lote_id);
    -- Normalizar sexo para maiúscula
    v_sexo_normalizado := CASE
        WHEN p_sexo IS NOT NULL THEN INITCAP(p_sexo)
        ELSE NULL
    END;

    -- Calcular a quantidade atual para o lote e categoria
    SELECT COALESCE(SUM(CASE
        WHEN i.categoria = p_categoria THEN 1
        ELSE 0
    END), 0)
    INTO v_quant_atual
    FROM public.lotes l
    LEFT JOIN public.individuos i ON l.id = i.lote_atual AND i.deleted_at IS NULL
    WHERE l.id = p_lote_id AND l.deleted_at IS NULL;

    -- Atualizar ou inserir na lote_categorias com raça e sexo normalizados
    INSERT INTO public.lote_categorias (
        lote_id,
        categoria,
        quant_atual,
        raca,
        sexo,
        ativo
    )
    VALUES (
        p_lote_id,
        p_categoria,
        v_quant_atual,
        p_raca,
        v_sexo_normalizado,
        true
    )
    ON CONFLICT (lote_id, categoria)
    DO UPDATE SET
        quant_atual = EXCLUDED.quant_atual,
        raca = COALESCE(EXCLUDED.raca, lote_categorias.raca),
        sexo = COALESCE(EXCLUDED.sexo, lote_categorias.sexo),
        updated_at = NOW();
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_quant_atual(p_lote_id uuid, p_categoria character varying)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
    v_quant_atual INTEGER;
BEGIN
    -- Calcular a quantidade atual para o lote e categoria
    SELECT COALESCE(SUM(CASE
        WHEN lc.categoria = p_categoria THEN 1
        ELSE 0
    END), 0)
    INTO v_quant_atual
    FROM public.lotes l
    LEFT JOIN public.individuos i ON l.id = i.lote_atual AND i.deleted_at IS NULL
    LEFT JOIN public.lote_categorias lc ON l.id = lc.lote_id AND lc.categoria = p_categoria AND lc.ativo = true
    WHERE l.id = p_lote_id AND l.deleted_at IS NULL;

    -- Atualizar ou inserir na lote_categorias
    INSERT INTO public.lote_categorias (lote_id, categoria, quant_atual, ativo)
    VALUES (p_lote_id, p_categoria, v_quant_atual, true)
    ON CONFLICT (lote_id, categoria)
    DO UPDATE SET
        quant_atual = EXCLUDED.quant_atual,
        updated_at = NOW();
END;
$function$;

-- Estado de privilégios da Fase 5 (sem EXECUTE para PUBLIC/anon)
REVOKE EXECUTE ON FUNCTION public.update_quant_atual_with_data(uuid, character varying, character varying, character varying) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_quant_atual(uuid, character varying) FROM PUBLIC, anon;
