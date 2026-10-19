-- ============================================================================
-- Edição de plano nutricional com histórico, e correções do alinhamento anterior
-- ============================================================================
-- Princípio: os relatórios mostram o que é vigente; toda edição preserva o
-- estado anterior numa tabela de histórico (planos_nutricionais_edicoes),
-- gravada só pelas RPCs. O snapshot de entrada continua sendo o que o PDF lê,
-- por isso é atualizado com o valor vigente; o valor antigo fica no histórico.
--
-- 1) planos_nutricionais_edicoes: histórico append-only (antes/depois).
--    Tabela própria porque planos_nutricionais_snapshots só aceita 'entrada' e
--    'saida' (CHECK) e o Histórico de Planos trata qualquer outro tipo como saída.
-- 2) _aplicar_personalizacao_categoria: novo parâmetro p_registrar_historico.
--    Nova flag zera data_notificacao_meta / data_notificacao_periodo quando meta
--    ou período da categoria mudam (senão o aviso do novo valor nunca dispara).
--    No ato de iniciar/migrar (false) a entrada é corrigida sem histórico; em
--    edição posterior (true) grava o histórico.
-- 3) editar_plano_lote: edição de plano da fila ou vigente. No vigente só mudam
--    período e peso meta; o novo valor vai para as categorias cujo valor ainda
--    era o do plano (as personalizadas à mão ficam como estão).
-- 4) _ativar_plano_nas_categorias: zera as flags de notificação (iniciar já
--    fazia; migrar e avanço da fila não).
-- 5) _encerrar_plano_lote: progresso do snapshot de saída pela meta da
--    categoria (antes usava sempre a meta do plano).
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1) Histórico de edições
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.planos_nutricionais_edicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id),
  lote_id uuid,
  plano_id uuid NOT NULL,
  lote_categoria_id uuid,
  origem text NOT NULL,
  antes jsonb NOT NULL,
  depois jsonb NOT NULL,
  usuario_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.planos_nutricionais_edicoes IS
'Histórico append-only das edições de planos nutricionais. lote_categoria_id nulo = campos do plano; preenchido = período/peso meta da categoria. antes/depois guardam os valores. Sem FK para plano/lote/categoria para sobreviver a exclusões.';

CREATE INDEX IF NOT EXISTS idx_planos_edicoes_plano ON public.planos_nutricionais_edicoes (plano_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_planos_edicoes_lote ON public.planos_nutricionais_edicoes (lote_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_planos_edicoes_fazenda ON public.planos_nutricionais_edicoes (fazenda_id);

ALTER TABLE public.planos_nutricionais_edicoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY planos_nutricionais_edicoes_leitura ON public.planos_nutricionais_edicoes FOR SELECT TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

REVOKE ALL ON public.planos_nutricionais_edicoes FROM anon;
REVOKE ALL ON public.planos_nutricionais_edicoes FROM authenticated;
GRANT SELECT ON public.planos_nutricionais_edicoes TO authenticated;

-- --------------------------------------------------------------------------
-- 2) Personalização de categoria com histórico e reset das flags
-- --------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._aplicar_personalizacao_categoria(uuid, uuid, integer, numeric);

CREATE OR REPLACE FUNCTION public._aplicar_personalizacao_categoria(
  p_plano_id uuid, p_lote_categoria_id uuid, p_periodo_dias integer, p_peso_meta_kg numeric,
  p_registrar_historico boolean DEFAULT false
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plano RECORD;
  v_cat RECORD;
  v_pcp RECORD;
  v_entrada RECORD;
  v_periodo integer;
  v_meta numeric;
  v_meta_mudou boolean;
  v_periodo_mudou boolean;
BEGIN
  SELECT * INTO v_plano FROM public.planos_nutricionais WHERE id = p_plano_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plano nao encontrado'; END IF;
  IF NOT (v_plano.ativo = true AND v_plano.data_fim IS NULL) THEN
    RAISE EXCEPTION 'A personalizacao so vale para o plano vigente do lote';
  END IF;

  SELECT * INTO v_cat FROM public.lote_categorias
  WHERE id = p_lote_categoria_id AND lote_id = v_plano.lote_id AND ativo = true AND data_fim IS NULL
    AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerro ao pe'
    AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerra ao pe';
  IF NOT FOUND THEN RAISE EXCEPTION 'Categoria nao pertence ao lote do plano ou nao aceita plano'; END IF;

  SELECT * INTO v_pcp FROM public.plano_categoria_personalizacao
  WHERE plano_id = p_plano_id AND lote_categoria_id = p_lote_categoria_id;

  v_periodo := COALESCE(p_periodo_dias, v_pcp.periodo_dias, v_plano.periodo_dias);
  v_meta := COALESCE(p_peso_meta_kg, v_pcp.peso_meta_kg, v_plano.peso_meta_kg);
  IF v_periodo IS NULL OR v_periodo <= 0 THEN RAISE EXCEPTION 'Periodo deve ser maior que zero'; END IF;
  IF v_meta IS NULL OR v_meta <= 0 THEN RAISE EXCEPTION 'Peso meta deve ser maior que zero'; END IF;

  v_meta_mudou := v_cat.peso_vivo_meta_kg_cab IS DISTINCT FROM v_meta OR v_pcp.peso_meta_kg IS DISTINCT FROM v_meta;
  v_periodo_mudou := v_pcp.periodo_dias IS DISTINCT FROM v_periodo;

  IF p_registrar_historico AND (v_meta_mudou OR v_periodo_mudou) THEN
    SELECT s.snapshot->>'peso_vivo_meta_kg_cab' AS meta, s.metricas_derivadas->>'progresso_meta_percent' AS progresso
    INTO v_entrada
    FROM public.planos_nutricionais_snapshots s
    WHERE s.plano_nutricional_id = p_plano_id AND s.lote_categoria_id = p_lote_categoria_id AND s.tipo_snapshot = 'entrada'
    ORDER BY s.created_at DESC LIMIT 1;

    INSERT INTO public.planos_nutricionais_edicoes
      (fazenda_id, lote_id, plano_id, lote_categoria_id, origem, antes, depois, usuario_id)
    SELECT l.fazenda_id, v_plano.lote_id, p_plano_id, p_lote_categoria_id, 'edicao_categoria',
      jsonb_build_object(
        'periodo_dias', v_pcp.periodo_dias,
        'peso_meta_kg', v_pcp.peso_meta_kg,
        'peso_vivo_meta_kg_cab', v_cat.peso_vivo_meta_kg_cab,
        'snapshot_entrada_peso_meta', v_entrada.meta,
        'snapshot_entrada_progresso', v_entrada.progresso
      ),
      jsonb_build_object(
        'periodo_dias', v_periodo,
        'peso_meta_kg', v_meta,
        'peso_vivo_meta_kg_cab', v_meta
      ),
      auth.uid()
    FROM public.lotes l WHERE l.id = v_plano.lote_id;
  END IF;

  -- peso_inicio_kg_cab nao e alterado aqui: so muda quando o plano e iniciado/migrado.
  INSERT INTO public.plano_categoria_personalizacao (plano_id, lote_categoria_id, periodo_dias, peso_meta_kg, ativo)
  VALUES (p_plano_id, p_lote_categoria_id, v_periodo, v_meta, true)
  ON CONFLICT (plano_id, lote_categoria_id) DO UPDATE
  SET periodo_dias = EXCLUDED.periodo_dias,
      peso_meta_kg = EXCLUDED.peso_meta_kg,
      ativo = true;

  -- Novo valor de meta/periodo: libera o aviso de "atingido" para o valor novo.
  UPDATE public.lote_categorias
  SET peso_vivo_meta_kg_cab = v_meta,
      data_notificacao_meta = CASE WHEN v_meta_mudou THEN NULL ELSE data_notificacao_meta END,
      data_notificacao_periodo = CASE WHEN v_periodo_mudou THEN NULL ELSE data_notificacao_periodo END
  WHERE id = p_lote_categoria_id;

  UPDATE public.planos_nutricionais_snapshots
  SET snapshot = jsonb_set(snapshot, '{peso_vivo_meta_kg_cab}', to_jsonb(v_meta)),
      metricas_derivadas = jsonb_set(
        metricas_derivadas, '{progresso_meta_percent}',
        to_jsonb((COALESCE((metricas_derivadas->>'peso_vivo_medio_lote')::numeric, v_cat.peso_vivo_atual_kg_cab, 0) / v_meta) * 100)
      )
  WHERE plano_nutricional_id = p_plano_id
    AND lote_categoria_id = p_lote_categoria_id
    AND tipo_snapshot = 'entrada';
END;
$function$;

-- Card "Personalização" do modal do lote: edição posterior, com histórico
CREATE OR REPLACE FUNCTION public.salvar_personalizacao_categoria(
  p_fazenda_id uuid, p_plano_id uuid, p_lote_categoria_id uuid, p_periodo_dias integer, p_peso_meta_kg numeric
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.guard_w_fazenda(p_fazenda_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.planos_nutricionais pn
    JOIN public.lotes l ON l.id = pn.lote_id
    WHERE pn.id = p_plano_id AND l.fazenda_id = p_fazenda_id
  ) THEN
    RAISE EXCEPTION 'Plano nao encontrado nesta fazenda';
  END IF;
  PERFORM public._aplicar_personalizacao_categoria(p_plano_id, p_lote_categoria_id, p_periodo_dias, p_peso_meta_kg, true);
END;
$function$;

-- --------------------------------------------------------------------------
-- 3) Edição de plano (fila ou vigente)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.editar_plano_lote(
  p_fazenda_id uuid, p_plano_id uuid, p_nome text, p_formulacao_id uuid,
  p_periodo_dias integer, p_peso_meta_kg numeric
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old RECORD;
  v_pcp RECORD;
  v_vigente boolean;
  v_nome text;
  v_form uuid;
  v_periodo integer;
  v_meta numeric;
  v_novo_periodo integer;
  v_nova_meta numeric;
BEGIN
  PERFORM public.guard_w_fazenda(p_fazenda_id);

  SELECT pn.* INTO v_old
  FROM public.planos_nutricionais pn
  JOIN public.lotes l ON l.id = pn.lote_id
  WHERE pn.id = p_plano_id AND l.fazenda_id = p_fazenda_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plano nao encontrado nesta fazenda'; END IF;
  IF v_old.data_fim IS NOT NULL THEN RAISE EXCEPTION 'Plano encerrado nao pode ser editado'; END IF;

  v_vigente := v_old.ativo = true;
  v_periodo := COALESCE(p_periodo_dias, v_old.periodo_dias);
  v_meta := COALESCE(p_peso_meta_kg, v_old.peso_meta_kg);
  IF v_periodo IS NULL OR v_periodo <= 0 THEN RAISE EXCEPTION 'Periodo deve ser maior que zero'; END IF;
  IF v_meta IS NULL OR v_meta <= 0 THEN RAISE EXCEPTION 'Peso meta deve ser maior que zero'; END IF;

  IF v_vigente THEN
    IF (p_nome IS NOT NULL AND btrim(p_nome) <> v_old.nome)
       OR (p_formulacao_id IS NOT NULL AND p_formulacao_id <> v_old.formulacao_id) THEN
      RAISE EXCEPTION 'No plano vigente so periodo e peso meta podem ser alterados';
    END IF;
    v_nome := v_old.nome;
    v_form := v_old.formulacao_id;
  ELSE
    v_nome := COALESCE(NULLIF(btrim(p_nome), ''), v_old.nome);
    v_form := COALESCE(p_formulacao_id, v_old.formulacao_id);
    IF v_form <> v_old.formulacao_id AND NOT EXISTS (
      SELECT 1 FROM public.formulacoes f
      WHERE f.id = v_form AND f.fazenda_id = p_fazenda_id AND f.ativo = true
        AND COALESCE(f.e_premix, false) = false AND COALESCE(f.e_creep, false) = false
    ) THEN
      RAISE EXCEPTION 'Formulacao invalida, inativa, creep/premix ou de outra fazenda';
    END IF;
  END IF;

  IF v_nome = v_old.nome AND v_form = v_old.formulacao_id
     AND v_periodo = v_old.periodo_dias AND v_meta = v_old.peso_meta_kg THEN
    RETURN;
  END IF;

  INSERT INTO public.planos_nutricionais_edicoes
    (fazenda_id, lote_id, plano_id, lote_categoria_id, origem, antes, depois, usuario_id)
  VALUES (
    p_fazenda_id, v_old.lote_id, p_plano_id, NULL,
    CASE WHEN v_vigente THEN 'edicao_plano_vigente' ELSE 'edicao_plano_fila' END,
    jsonb_build_object('nome', v_old.nome, 'formulacao_id', v_old.formulacao_id,
                       'periodo_dias', v_old.periodo_dias, 'peso_meta_kg', v_old.peso_meta_kg),
    jsonb_build_object('nome', v_nome, 'formulacao_id', v_form,
                       'periodo_dias', v_periodo, 'peso_meta_kg', v_meta),
    auth.uid()
  );

  UPDATE public.planos_nutricionais
  SET nome = v_nome, formulacao_id = v_form, periodo_dias = v_periodo, peso_meta_kg = v_meta
  WHERE id = p_plano_id;

  -- Plano vigente: o novo valor vai para as categorias cujo valor ainda era o do plano.
  -- Categorias personalizadas à mão (valor diferente do plano antigo) ficam como estão.
  IF v_vigente AND (v_periodo <> v_old.periodo_dias OR v_meta <> v_old.peso_meta_kg) THEN
    FOR v_pcp IN
      SELECT p.* FROM public.plano_categoria_personalizacao p
      JOIN public.lote_categorias lc ON lc.id = p.lote_categoria_id
      WHERE p.plano_id = p_plano_id AND p.ativo = true
        AND lc.ativo = true AND lc.data_fim IS NULL
        AND LOWER(unaccent(lc.categoria)) NOT ILIKE 'bezerro ao pe'
        AND LOWER(unaccent(lc.categoria)) NOT ILIKE 'bezerra ao pe'
    LOOP
      v_novo_periodo := CASE WHEN v_pcp.periodo_dias IS NOT DISTINCT FROM v_old.periodo_dias THEN v_periodo ELSE v_pcp.periodo_dias END;
      v_nova_meta := CASE WHEN v_pcp.peso_meta_kg IS NOT DISTINCT FROM v_old.peso_meta_kg THEN v_meta ELSE v_pcp.peso_meta_kg END;
      IF v_novo_periodo IS DISTINCT FROM v_pcp.periodo_dias OR v_nova_meta IS DISTINCT FROM v_pcp.peso_meta_kg THEN
        PERFORM public._aplicar_personalizacao_categoria(p_plano_id, v_pcp.lote_categoria_id, v_novo_periodo, v_nova_meta, true);
      END IF;
    END LOOP;
  END IF;
END;
$function$;

-- --------------------------------------------------------------------------
-- 4) Ativar plano: zera as flags de notificação (como o iniciar já fazia)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ativar_plano_nas_categorias(p_lote_id uuid, p_plano_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plano RECORD;
  v_lote RECORD;
  v_form RECORD;
  v_cat RECORD;
  v_gmd numeric;
BEGIN
  SELECT * INTO v_plano FROM public.planos_nutricionais WHERE id = p_plano_id AND lote_id = p_lote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plano nao encontrado para este lote'; END IF;
  SELECT * INTO v_lote FROM public.lotes WHERE id = p_lote_id;

  UPDATE public.lotes SET formulacao_id = v_plano.formulacao_id WHERE id = p_lote_id;
  SELECT * INTO v_form FROM public.formulacoes WHERE id = v_plano.formulacao_id;

  FOR v_cat IN SELECT * FROM public.lote_categorias
    WHERE lote_id = p_lote_id AND ativo = true AND data_fim IS NULL
      AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerro ao pe'
      AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerra ao pe'
  LOOP
    SELECT fcg.gmd INTO v_gmd FROM public.formulacao_categorias_gmd fcg
    WHERE fcg.formulacao_id = v_plano.formulacao_id AND LOWER(TRIM(fcg.categoria)) = LOWER(TRIM(v_cat.categoria));
    IF NOT FOUND THEN v_gmd := NULL; END IF;
    IF v_gmd IS NOT NULL AND v_lote.destino = 'enfermaria' THEN
      v_gmd := v_gmd * 0.5;
    END IF;

    UPDATE public.lote_categorias
    SET formulacao_id = v_plano.formulacao_id,
        estrategia_nutricional = v_form.nome,
        peso_vivo_meta_kg_cab = v_plano.peso_meta_kg,
        gmd = CASE WHEN v_gmd IS NOT NULL THEN v_gmd::text ELSE NULL END,
        consumo_meta_porcentagem_pesovivo = v_form.consumo_ms_percent_pv,
        data_notificacao_meta = NULL,
        data_notificacao_periodo = NULL
    WHERE id = v_cat.id;

    INSERT INTO public.plano_categoria_personalizacao
      (plano_id, lote_categoria_id, periodo_dias, peso_meta_kg, peso_inicio_kg_cab, ativo)
    VALUES (v_plano.id, v_cat.id, v_plano.periodo_dias, v_plano.peso_meta_kg, v_cat.peso_vivo_atual_kg_cab, true)
    ON CONFLICT (plano_id, lote_categoria_id) DO UPDATE
    SET ativo = true,
        periodo_dias = EXCLUDED.periodo_dias,
        peso_meta_kg = EXCLUDED.peso_meta_kg,
        peso_inicio_kg_cab = EXCLUDED.peso_inicio_kg_cab;

    PERFORM public.criar_snapshot_entrada(v_plano.id, v_cat.id, p_motivo);
  END LOOP;
END;
$function$;

-- --------------------------------------------------------------------------
-- 5) Encerrar: progresso do snapshot de saída pela meta da categoria
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._encerrar_plano_lote(p_lote_id uuid, p_destino_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plano RECORD; v_proximo_plano RECORD; v_lote RECORD; v_fazenda_id uuid; v_cat RECORD;
  v_snapshot jsonb; v_metricas jsonb; v_duracao integer; v_ganho_peso numeric;
  v_gmd_realizado numeric; v_gmd_planejado numeric; v_prod_arroba_lote numeric;
  v_mortalidade numeric; v_peso_inicio numeric; v_rc_inicio numeric;
  v_peso_atual numeric; v_rc_atual numeric; v_quant_atual integer;
  v_quant_inicial integer; v_morte integer; v_tem_proximo boolean; v_meta_cat numeric;
BEGIN
  SELECT * INTO v_lote FROM public.lotes WHERE id = p_lote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote nao encontrado'; END IF;
  v_fazenda_id := v_lote.fazenda_id;

  SELECT * INTO v_plano FROM public.planos_nutricionais WHERE lote_id = p_lote_id AND ativo = true AND data_fim IS NULL LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nenhum plano vigente encontrado para este lote'; END IF;

  IF p_destino_id IS NOT NULL THEN
    SELECT * INTO v_proximo_plano FROM public.planos_nutricionais
    WHERE id = p_destino_id AND lote_id = p_lote_id AND data_fim IS NULL AND id <> v_plano.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Plano destino invalido para este lote'; END IF;
  END IF;

  FOR v_cat IN SELECT * FROM public.lote_categorias
    WHERE lote_id = p_lote_id AND ativo = true AND data_fim IS NULL
      AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerro ao pe'
      AND LOWER(unaccent(categoria)) NOT ILIKE 'bezerra ao pe'
  LOOP
    SELECT to_jsonb(lc.*) INTO v_snapshot FROM public.lote_categorias lc WHERE lc.id = v_cat.id;
    SELECT COALESCE(lc.peso_vivo_atual_kg_cab, 0), COALESCE(lc.rc_final, 0), COALESCE(lc.quant_atual, 0), COALESCE(lc.quant_inicial, 0), COALESCE(lc.morte, 0)
    INTO v_peso_atual, v_rc_atual, v_quant_atual, v_quant_inicial, v_morte
    FROM public.lote_categorias lc WHERE lc.id = v_cat.id;

    v_peso_inicio := COALESCE(v_plano.peso_inicio_kg_cab, v_cat.peso_entrada_kg_cab, 0);
    v_rc_inicio := COALESCE(v_plano.rc_inicio, v_cat.rc_inicial, 0);
    v_duracao := COALESCE((CURRENT_DATE - v_plano.data_inicio)::integer, 0);
    -- meta efetiva da categoria (personalizada ou do plano)
    v_meta_cat := COALESCE(v_cat.peso_vivo_meta_kg_cab, v_plano.peso_meta_kg);

    SELECT fcg.gmd INTO v_gmd_planejado FROM public.formulacao_categorias_gmd fcg
    WHERE fcg.formulacao_id = v_plano.formulacao_id AND LOWER(TRIM(fcg.categoria)) = LOWER(TRIM(v_cat.categoria));
    IF NOT FOUND THEN v_gmd_planejado := NULL; END IF;

    v_ganho_peso := v_peso_atual - v_peso_inicio;
    IF v_ganho_peso > 0 AND v_duracao > 0 THEN v_gmd_realizado := v_ganho_peso / v_duracao; ELSE v_gmd_realizado := 0; END IF;
    IF v_quant_inicial > 0 THEN v_mortalidade := (v_morte::numeric / v_quant_inicial) * 100; ELSE v_mortalidade := 0; END IF;
    IF v_rc_atual > 0 AND v_quant_atual > 0 THEN v_prod_arroba_lote := ((v_peso_atual * (v_rc_atual / 100)) / 15) * v_quant_atual; ELSE v_prod_arroba_lote := 0; END IF;

    SELECT jsonb_build_object(
      'progresso_meta_percent', CASE WHEN COALESCE(v_meta_cat, 0) > 0 THEN (v_peso_atual / v_meta_cat) * 100 ELSE 0 END,
      'ganho_arroba_cab', CASE WHEN v_rc_atual > 0 AND v_rc_inicio > 0 THEN ((v_peso_atual * (v_rc_atual / 100)) / 15) - ((v_peso_inicio * (v_rc_inicio / 100)) / 15) ELSE 0 END,
      'peso_vivo_medio_lote', v_peso_atual, 'peso_inicial_kg_cab', v_peso_inicio,
      'rc_inicio', v_rc_inicio, 'rc_atual', v_rc_atual,
      'quant_inicial', v_quant_inicial, 'quant_atual', v_quant_atual, 'morte', v_morte
    ) INTO v_metricas FROM public.lote_categorias lc WHERE lc.id = v_cat.id;

    INSERT INTO public.planos_nutricionais_snapshots
      (plano_nutricional_id, lote_categoria_id, fazenda_id, snapshot, metricas_derivadas, duracao_dias, ganho_peso_total_kg_cab, gmd_realizado, gmd_planejado, producao_arroba_lote, mortalidade_percent, motivo_migracao, plano_anterior_id, plano_posterior_id, tipo_snapshot)
    VALUES (v_plano.id, v_cat.id, v_fazenda_id, v_snapshot, v_metricas, v_duracao, v_ganho_peso, v_gmd_realizado, v_gmd_planejado, v_prod_arroba_lote, v_mortalidade, 'encerramento_lote', v_plano.id, NULL, 'saida');

    UPDATE public.lote_categorias SET formulacao_id = NULL, estrategia_nutricional = NULL, peso_vivo_meta_kg_cab = NULL, gmd = NULL, consumo_meta_porcentagem_pesovivo = NULL WHERE id = v_cat.id;
  END LOOP;

  UPDATE public.planos_nutricionais SET ativo = false, data_fim = CURRENT_DATE WHERE id = v_plano.id;
  UPDATE public.plano_categoria_personalizacao SET ativo = false WHERE plano_id = v_plano.id;

  IF p_destino_id IS NOT NULL THEN
    v_tem_proximo := true;
  ELSE
    SELECT * INTO v_proximo_plano FROM public.planos_nutricionais
    WHERE lote_id = p_lote_id AND ordem > v_plano.ordem AND data_inicio IS NULL AND data_fim IS NULL ORDER BY ordem ASC LIMIT 1;
    v_tem_proximo := FOUND;
  END IF;

  IF v_tem_proximo THEN
    UPDATE public.planos_nutricionais SET ativo = true, data_inicio = CURRENT_DATE, data_fim = NULL WHERE id = v_proximo_plano.id;
    PERFORM public._ativar_plano_nas_categorias(p_lote_id, v_proximo_plano.id, 'migracao_lote');
  ELSE
    UPDATE public.lotes SET formulacao_id = NULL WHERE id = p_lote_id;
  END IF;
END;
$function$;

-- Grants
REVOKE EXECUTE ON FUNCTION public._aplicar_personalizacao_categoria(uuid, uuid, integer, numeric, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.editar_plano_lote(uuid, uuid, text, uuid, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_plano_lote(uuid, uuid, text, uuid, integer, numeric) TO authenticated;
