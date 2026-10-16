-- Corrige o texto do ajuste de inventário de 20261016180000: conta os animais confirmados do lote/categoria
-- (v_depois), não só os novos. Rollback: DROP da função (ver 20261016170000).

CREATE OR REPLACE FUNCTION public.identificar_animais_lote(
  p_fazenda_id uuid,
  p_lote_id uuid,
  p_categoria text,
  p_animais jsonb,
  p_raca_padrao text DEFAULT NULL,
  p_confirmar boolean DEFAULT false,
  p_ajustar_excesso boolean DEFAULT false,
  p_data date DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_data date;
  v_slug text;
  v_cat public.categorias_animais%ROWTYPE;
  v_lc public.lote_categorias%ROWTYPE;
  v_el jsonb;
  v_linha integer;
  v_erros jsonb := '[]'::jsonb;
  v_validos jsonb := '[]'::jsonb;
  v_row jsonb;
  v_brinco text;
  v_chip text;
  v_manejo text;
  v_prov text;
  v_sisbov text;
  v_pnib text;
  v_sexo text;
  v_raca text;
  v_peso text;
  v_nasc text;
  v_disp text;
  v_dtid text;
  v_msg text;
  v_seen_brinco text[] := '{}';
  v_seen_chip text[] := '{}';
  v_seen_manejo text[] := '{}';
  v_seen_sisbov text[] := '{}';
  v_confirmados integer;
  v_novos integer;
  v_depois integer;
  v_excesso integer;
  v_quant integer;
  v_nome_usuario text;
  v_peso_medio numeric;
  v_ajuste_id uuid;
BEGIN
  IF public.caller_is_peao() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação restrita ao painel de gestão');
  END IF;
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda');
  END IF;
  IF p_animais IS NULL OR jsonb_typeof(p_animais) <> 'array' OR jsonb_array_length(p_animais) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Informe ao menos um animal');
  END IF;
  IF jsonb_array_length(p_animais) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No máximo 2000 animais por vez');
  END IF;

  v_data := COALESCE(p_data, v_hoje);
  IF v_data > v_hoje THEN
    RETURN jsonb_build_object('success', false, 'error', 'A data não pode ser futura');
  END IF;

  v_slug := public.categoria_canonica(p_categoria);
  IF v_slug IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Categoria não reconhecida');
  END IF;
  SELECT * INTO v_cat FROM public.categorias_animais WHERE slug = v_slug;

  SELECT lc.* INTO v_lc
  FROM public.lote_categorias lc JOIN public.lotes l ON l.id = lc.lote_id
  WHERE lc.lote_id = p_lote_id AND l.fazenda_id = p_fazenda_id
    AND lower(btrim(lc.categoria)) = v_slug AND lc.ativo = true
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'O lote não tem essa categoria ativa');
  END IF;
  v_quant := COALESCE(v_lc.quant_atual, 0);

  SELECT count(*) INTO v_confirmados
  FROM public.individuos i
  WHERE i.fazenda_id = p_fazenda_id AND i.lote_atual = p_lote_id AND i.deleted_at IS NULL AND i.status = 'Vivo'
    AND i.localizacao_incerta_desde IS NULL AND public.categoria_canonica(i.categoria) = v_slug;

  -- ---- validação linha a linha (nada é gravado aqui) ----
  FOR v_el, v_linha IN SELECT value, ordinality FROM jsonb_array_elements(p_animais) WITH ORDINALITY LOOP
    v_msg := NULL;
    v_brinco := NULLIF(btrim(v_el ->> 'id_brinco'), '');
    v_chip := NULLIF(btrim(v_el ->> 'id_chip'), '');
    v_manejo := NULLIF(btrim(v_el ->> 'id_manejo'), '');
    v_prov := NULLIF(btrim(v_el ->> 'id_provisorio_cria'), '');
    v_sisbov := NULLIF(btrim(v_el ->> 'codigo_sisbov'), '');
    v_pnib := NULLIF(btrim(v_el ->> 'codigo_pnib'), '');
    v_sexo := COALESCE(NULLIF(btrim(v_el ->> 'sexo'), ''), v_cat.sexo);
    v_raca := COALESCE(NULLIF(btrim(v_el ->> 'raca'), ''), NULLIF(btrim(p_raca_padrao), ''));
    v_peso := NULLIF(replace(btrim(COALESCE(v_el ->> 'peso_atual_kg', '')), ',', '.'), '');
    v_nasc := NULLIF(btrim(COALESCE(v_el ->> 'data_nascimento', '')), '');
    v_disp := NULLIF(btrim(COALESCE(v_el ->> 'dispositivo_tipo', '')), '');
    v_dtid := NULLIF(btrim(COALESCE(v_el ->> 'data_identificacao', '')), '');

    IF v_brinco IS NULL AND v_chip IS NULL AND v_manejo IS NULL AND v_prov IS NULL THEN
      v_msg := 'Informe brinco, chip, ID de manejo ou ID provisório';
    ELSIF v_sexo IS NULL OR v_sexo NOT IN ('Macho', 'Fêmea') THEN
      v_msg := 'Informe o sexo (Macho ou Fêmea)';
    ELSIF v_raca IS NULL THEN
      v_msg := 'Informe a raça (ou uma raça padrão)';
    ELSIF v_peso IS NOT NULL AND v_peso !~ '^[0-9]+(\.[0-9]+)?$' THEN
      v_msg := 'Peso inválido';
    ELSIF v_nasc IS NOT NULL AND (v_nasc !~ '^\d{4}-\d{2}-\d{2}$' OR v_nasc::date > v_hoje) THEN
      v_msg := 'Data de nascimento inválida ou futura (use AAAA-MM-DD)';
    ELSIF v_dtid IS NOT NULL AND (v_dtid !~ '^\d{4}-\d{2}-\d{2}$' OR v_dtid::date > v_hoje) THEN
      v_msg := 'Data de identificação inválida ou futura (use AAAA-MM-DD)';
    ELSIF v_sisbov IS NOT NULL AND v_sisbov !~ '^076[0-9]{12}$' THEN
      v_msg := 'Código SISBOV deve ter 15 dígitos e começar com 076';
    ELSIF v_disp IS NOT NULL AND v_disp NOT IN ('brinco', 'brinco_eletronico', 'botton', 'bolus', 'outro') THEN
      v_msg := 'Dispositivo inválido';
    ELSIF v_brinco IS NOT NULL AND upper(v_brinco) = ANY (v_seen_brinco) THEN
      v_msg := 'Brinco repetido nesta lista';
    ELSIF v_chip IS NOT NULL AND upper(v_chip) = ANY (v_seen_chip) THEN
      v_msg := 'Chip repetido nesta lista';
    ELSIF v_manejo IS NOT NULL AND upper(v_manejo) = ANY (v_seen_manejo) THEN
      v_msg := 'ID de manejo repetido nesta lista';
    ELSIF v_sisbov IS NOT NULL AND v_sisbov = ANY (v_seen_sisbov) THEN
      v_msg := 'Código SISBOV repetido nesta lista';
    ELSIF v_brinco IS NOT NULL AND EXISTS (SELECT 1 FROM public.individuos x WHERE x.fazenda_id = p_fazenda_id AND x.deleted_at IS NULL AND upper(x.id_brinco) = upper(v_brinco)) THEN
      v_msg := 'Brinco já cadastrado nesta fazenda';
    ELSIF v_chip IS NOT NULL AND EXISTS (SELECT 1 FROM public.individuos x WHERE x.fazenda_id = p_fazenda_id AND x.deleted_at IS NULL AND upper(x.id_chip) = upper(v_chip)) THEN
      v_msg := 'Chip já cadastrado nesta fazenda';
    ELSIF v_manejo IS NOT NULL AND EXISTS (SELECT 1 FROM public.individuos x WHERE x.fazenda_id = p_fazenda_id AND x.deleted_at IS NULL AND upper(x.id_manejo) = upper(v_manejo)) THEN
      v_msg := 'ID de manejo já cadastrado nesta fazenda';
    ELSIF v_sisbov IS NOT NULL AND EXISTS (SELECT 1 FROM public.individuos x WHERE x.deleted_at IS NULL AND x.codigo_sisbov = v_sisbov) THEN
      v_msg := 'Código SISBOV já cadastrado em outro animal';
    END IF;

    IF v_msg IS NOT NULL THEN
      v_erros := v_erros || jsonb_build_object('linha', v_linha, 'mensagem', v_msg);
    ELSE
      IF v_brinco IS NOT NULL THEN v_seen_brinco := v_seen_brinco || upper(v_brinco); END IF;
      IF v_chip IS NOT NULL THEN v_seen_chip := v_seen_chip || upper(v_chip); END IF;
      IF v_manejo IS NOT NULL THEN v_seen_manejo := v_seen_manejo || upper(v_manejo); END IF;
      IF v_sisbov IS NOT NULL THEN v_seen_sisbov := v_seen_sisbov || v_sisbov; END IF;
      v_validos := v_validos || jsonb_build_object(
        'id_brinco', v_brinco, 'id_chip', v_chip, 'id_manejo', v_manejo, 'id_provisorio_cria', v_prov,
        'sexo', v_sexo, 'raca', v_raca, 'peso_atual_kg', v_peso, 'data_nascimento', v_nasc,
        'codigo_sisbov', v_sisbov, 'codigo_pnib', v_pnib, 'dispositivo_tipo', v_disp, 'data_identificacao', v_dtid);
    END IF;
  END LOOP;

  v_novos := jsonb_array_length(v_validos);
  v_depois := v_confirmados + v_novos;
  v_excesso := GREATEST(v_depois - v_quant, 0);

  IF NOT p_confirmar THEN
    RETURN jsonb_build_object('success', true, 'aplicado', false, 'criar', v_novos, 'erros', v_erros,
      'quant_atual', v_quant, 'confirmados_antes', v_confirmados, 'confirmados_depois', v_depois, 'excesso', v_excesso);
  END IF;

  IF jsonb_array_length(v_erros) > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Corrija as linhas com erro antes de gravar', 'erros', v_erros);
  END IF;
  IF v_excesso > 0 AND NOT p_ajustar_excesso THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Há mais animais identificados do que cabeças no lote (excesso de ' || v_excesso || '). Confirme o ajuste do agregado para gravar.',
      'excesso', v_excesso, 'quant_atual', v_quant, 'confirmados_depois', v_depois);
  END IF;

  -- ---- grava: indivíduos sem movimentação ----
  INSERT INTO public.individuos (
    fazenda_id, id_brinco, id_chip, id_manejo, id_provisorio_cria, sexo, raca, categoria, lote_atual, status, origem,
    peso_atual_kg, peso_atual_origem, peso_atual_data, data_nascimento, codigo_sisbov, codigo_pnib, dispositivo_tipo,
    data_identificacao, estrategia_nutricional_tipo, estrategia_nutricional_nome, gmd_kg_cab_dia, peso_meta_kg, estrategia_nutricional_id
  )
  SELECT p_fazenda_id, x.id_brinco, x.id_chip, x.id_manejo, x.id_provisorio_cria, x.sexo, x.raca, v_cat.nome, p_lote_id, 'Vivo', 'Cadastro Manual',
         NULLIF(x.peso_atual_kg, '')::numeric,
         CASE WHEN NULLIF(x.peso_atual_kg, '') IS NOT NULL THEN 'manual' END,
         CASE WHEN NULLIF(x.peso_atual_kg, '') IS NOT NULL THEN v_hoje END,
         NULLIF(x.data_nascimento, '')::date, x.codigo_sisbov, x.codigo_pnib, x.dispositivo_tipo,
         NULLIF(x.data_identificacao, '')::date,
         CASE WHEN v_lc.estrategia_nutricional ILIKE '%Proteico%' OR v_lc.estrategia_nutricional ILIKE '%Proteinado%' THEN 'Proteico-Energético' ELSE 'Ração' END,
         v_lc.estrategia_nutricional,
         CASE WHEN v_lc.gmd ~ '^\s*[0-9]+([.,][0-9]+)?\s*$' THEN replace(btrim(v_lc.gmd), ',', '.')::numeric END,
         v_lc.peso_vivo_meta_kg_cab, v_lc.formulacao_id
  FROM jsonb_to_recordset(v_validos) AS x(
    id_brinco text, id_chip text, id_manejo text, id_provisorio_cria text, sexo text, raca text, peso_atual_kg text,
    data_nascimento text, codigo_sisbov text, codigo_pnib text, dispositivo_tipo text, data_identificacao text);

  -- ---- ajuste do agregado só para o excesso, explicitamente confirmado ----
  IF v_excesso > 0 THEN
    SELECT u.nome INTO v_nome_usuario FROM public.usuarios u WHERE u.auth_id = auth.uid() LIMIT 1;
    v_peso_medio := v_lc.peso_vivo_atual_kg_cab;
    INSERT INTO public.registros_movimentacao (
      fazenda_id, nome_usuario, data, lote_origem, numero_cabecas, peso_vivo_atual_kg,
      motivo_movimentacao, subtipo, causa_observacao, categoria, lote_origem_id
    ) VALUES (
      p_fazenda_id, COALESCE(v_nome_usuario, 'Painel'), public.data_movimentacao_individuo(v_data, v_lc),
      (SELECT nome FROM public.lotes WHERE id = p_lote_id), v_excesso, v_peso_medio,
      'Entrada', NULL,
      'Ajuste de inventário: ' || v_depois || ' animal(is) identificado(s) e confirmado(s) para ' || v_quant || ' cabeça(s) contadas no lote',
      v_lc.categoria, p_lote_id
    ) RETURNING id INTO v_ajuste_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'aplicado', true, 'criados', v_novos,
    'quant_atual', v_quant + v_excesso, 'confirmados_depois', v_depois, 'excesso', v_excesso,
    'ajuste_movimentacao_id', v_ajuste_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.identificar_animais_lote(uuid, uuid, text, jsonb, text, boolean, boolean, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.identificar_animais_lote(uuid, uuid, text, jsonb, text, boolean, boolean, date) TO authenticated;
