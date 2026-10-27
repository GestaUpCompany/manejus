-- ============================================================================
-- RPCs do histórico de dietas
-- ============================================================================
-- 1) salvar_formulacao: salva a dieta (linha, insumos, GMD por categoria) numa
--    única transação e registra UMA versão no fim. Antes o painel fazia várias
--    requisições separadas (update, delete+insert da junção, delete+insert do
--    GMD), cada uma com commit próprio.
-- 2) linha_nutricional_lote: cruza os planos do lote com as versões da dieta
--    vigentes em cada intervalo (base da linha de vida nutricional do lote).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.salvar_formulacao(
  p_fazenda_id uuid,
  p_formulacao_id uuid,
  p_dados jsonb,
  p_insumos jsonb,
  p_categorias_gmd jsonb,
  p_motivo text DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid := p_formulacao_id;
  v_premix boolean := COALESCE((p_dados->>'e_premix')::boolean, false);
  v_item jsonb;
  v_idx integer;
BEGIN
  PERFORM public.guard_w_fazenda(p_fazenda_id);

  IF v_id IS NULL THEN
    INSERT INTO public.formulacoes (
      fazenda_id, nome, descricao, tipo, consumo_ms_percent_pv, gmd, ativo,
      e_premix, e_creep, sistema_producao, forma_fornecimento, kg_por_saco,
      categoria_inferida_automaticamente, categoria_inferida_observacao
    ) VALUES (
      p_fazenda_id,
      p_dados->>'nome',
      NULLIF(p_dados->>'descricao', ''),
      NULLIF(p_dados->>'tipo', ''),
      (p_dados->>'consumo_ms_percent_pv')::numeric,
      (p_dados->>'gmd')::numeric,
      COALESCE((p_dados->>'ativo')::boolean, true),
      v_premix,
      COALESCE((p_dados->>'e_creep')::boolean, false),
      NULLIF(p_dados->>'sistema_producao', ''),
      COALESCE(p_dados->>'forma_fornecimento', 'granel'),
      (p_dados->>'kg_por_saco')::numeric,
      false,
      NULL
    )
    RETURNING id INTO v_id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.formulacoes WHERE id = v_id AND fazenda_id = p_fazenda_id) THEN
      RAISE EXCEPTION 'Formulacao nao encontrada nesta fazenda';
    END IF;

    UPDATE public.formulacoes
    SET nome = p_dados->>'nome',
        descricao = NULLIF(p_dados->>'descricao', ''),
        tipo = NULLIF(p_dados->>'tipo', ''),
        consumo_ms_percent_pv = (p_dados->>'consumo_ms_percent_pv')::numeric,
        gmd = (p_dados->>'gmd')::numeric,
        ativo = COALESCE((p_dados->>'ativo')::boolean, true),
        e_premix = v_premix,
        e_creep = COALESCE((p_dados->>'e_creep')::boolean, false),
        sistema_producao = NULLIF(p_dados->>'sistema_producao', ''),
        forma_fornecimento = COALESCE(p_dados->>'forma_fornecimento', 'granel'),
        kg_por_saco = (p_dados->>'kg_por_saco')::numeric,
        categoria_inferida_automaticamente = false,
        categoria_inferida_observacao = NULL
    WHERE id = v_id;
  END IF;

  -- Composição: troca atômica (o trigger da junção recalcula os derivados)
  DELETE FROM public.formulacao_insumos WHERE formulacao_id = v_id;
  FOR v_item, v_idx IN
    SELECT e.value, (e.ordinality - 1)::integer
    FROM jsonb_array_elements(COALESCE(p_insumos, '[]'::jsonb)) WITH ORDINALITY AS e(value, ordinality)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.insumos WHERE id = (v_item->>'insumo_id')::uuid AND fazenda_id = p_fazenda_id
    ) THEN
      RAISE EXCEPTION 'Insumo % nao pertence a esta fazenda', v_item->>'insumo_id';
    END IF;
    INSERT INTO public.formulacao_insumos (formulacao_id, insumo_id, formula_teor_ms, ordem)
    VALUES (v_id, (v_item->>'insumo_id')::uuid, (v_item->>'formula_teor_ms')::numeric, v_idx);
  END LOOP;

  -- GMD por categoria (premix não tem)
  IF NOT v_premix THEN
    DELETE FROM public.formulacao_categorias_gmd WHERE formulacao_id = v_id;
    FOR v_item, v_idx IN
      SELECT e.value, (e.ordinality - 1)::integer
      FROM jsonb_array_elements(COALESCE(p_categorias_gmd, '[]'::jsonb)) WITH ORDINALITY AS e(value, ordinality)
    LOOP
      INSERT INTO public.formulacao_categorias_gmd (formulacao_id, categoria, gmd, ordem)
      VALUES (v_id, lower(btrim(v_item->>'categoria')), (v_item->>'gmd')::numeric, v_idx);
    END LOOP;
  END IF;

  PERFORM public._registrar_versao_formulacao(v_id, 'edicao_dieta', NULL, p_motivo);
  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.salvar_formulacao(uuid, uuid, jsonb, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_formulacao(uuid, uuid, jsonb, jsonb, jsonb, text) TO authenticated;

-- --------------------------------------------------------------------------
-- Linha de vida nutricional do lote
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.linha_nutricional_lote(p_fazenda_id uuid, p_lote_id uuid)
 RETURNS TABLE (
   plano_id uuid,
   plano_nome text,
   formulacao_id uuid,
   plano_inicio date,
   plano_fim date,
   versao integer,
   segmento_inicio timestamptz,
   segmento_fim timestamptz,
   origem text,
   motivo text,
   dados jsonb,
   composicao jsonb,
   categorias_gmd jsonb
 )
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_admin_user() OR public.caller_has_fazenda_access(p_fazenda_id)) THEN
    RAISE EXCEPTION 'Sem acesso a esta fazenda';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lotes WHERE id = p_lote_id AND fazenda_id = p_fazenda_id) THEN
    RAISE EXCEPTION 'Lote nao encontrado nesta fazenda';
  END IF;

  RETURN QUERY
  SELECT pn.id, pn.nome, pn.formulacao_id, pn.data_inicio, pn.data_fim,
         v.versao,
         GREATEST(v.vigente_desde, (pn.data_inicio::timestamp AT TIME ZONE 'America/Cuiaba')),
         LEAST(COALESCE(v.vigente_ate, 'infinity'::timestamptz),
               COALESCE(((pn.data_fim + 1)::timestamp AT TIME ZONE 'America/Cuiaba'), 'infinity'::timestamptz)),
         v.origem, v.motivo, v.dados, v.composicao, v.categorias_gmd
  FROM public.planos_nutricionais pn
  JOIN public.formulacoes_versoes v
    ON v.formulacao_id = pn.formulacao_id
   AND v.vigente_desde < COALESCE(((pn.data_fim + 1)::timestamp AT TIME ZONE 'America/Cuiaba'), 'infinity'::timestamptz)
   AND COALESCE(v.vigente_ate, 'infinity'::timestamptz) > (pn.data_inicio::timestamp AT TIME ZONE 'America/Cuiaba')
  WHERE pn.lote_id = p_lote_id
    AND pn.data_inicio IS NOT NULL
  ORDER BY pn.data_inicio, v.vigente_desde;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.linha_nutricional_lote(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.linha_nutricional_lote(uuid, uuid) TO authenticated;
