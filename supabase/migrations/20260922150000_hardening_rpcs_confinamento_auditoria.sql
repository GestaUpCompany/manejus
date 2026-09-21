-- Hardening das RPCs administrativas e da auditoria do módulo de confinamento.
--
-- 1) As seis RPCs de editar/excluir resolvem o chamador via auth.uid() ->
--    usuarios.auth_id em vez de confiar em p_usuario_id/p_usuario_email, que
--    eram spoofable: qualquer autenticado podia declarar o usuario_id de um
--    controller e a auditoria registrava o e-mail forjado. Os parâmetros
--    permanecem na assinatura para compatibilidade com o painel, mas não são
--    mais usados para autorização nem para o contexto de auditoria.
-- 2) editar_registro_suplementacao passa a exigir papel admin/controller em
--    usuario_fazenda, como as demais (antes não verificava papel).
-- 3) fn_audit_trigger usa nome_usuario da própria linha como fallback quando
--    não há contexto de sessão, cobrindo writes diretos do PWA, cuja conta
--    compartilhada peao.* não identifica o funcionário.
-- 4) lancar_tratos_folha passa a resolver também registros soft-deleted do
--    mesmo curral/dia/ordem e os reativa explicitamente (deleted_at = NULL) no
--    ON CONFLICT, em vez de atualizar uma linha que permanecia invisível.
-- 5) editar_registro_leitura_cocho re-resolve nota_config_id quando a nota
--    muda, evitando link para o percentual da nota antiga.
-- 6) Remove a unique constraint por timestamp exato em registros_oferta_trato,
--    redundante com o índice único de dia operacional (curral, dia, ordem entre
--    registros ativos).

-- ---------------------------------------------------------------------------
-- 3) fn_audit_trigger: fallback para nome_usuario da linha
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id_text text := NULLIF(current_setting('app.current_user_id', true), '');
  v_usuario_id uuid := v_user_id_text::uuid;
  v_usuario_email text := NULLIF(current_setting('app.current_user_email', true), '');
  v_usuario_nome text := NULLIF(current_setting('app.current_user_nome', true), '');
  v_fazenda_id uuid := NULL;
  v_is_impersonation boolean := COALESCE(NULLIF(current_setting('app.is_impersonation', true), '')::boolean, false);
  v_imp_by_text text := NULLIF(current_setting('app.impersonated_by', true), '');
  v_impersonated_by uuid := v_imp_by_text::uuid;
  v_ip_address text := NULLIF(current_setting('app.ip_address', true), '');
  v_user_agent text := NULLIF(current_setting('app.user_agent', true), '');
  v_source_app text := NULLIF(current_setting('app.source_app', true), '');
  v_origin_page text := NULLIF(current_setting('app.origin_page', true), '');
  v_registro_id uuid := NULL;
  v_alteracoes jsonb := '{}'::jsonb;
  v_col text;
  v_old_json jsonb;
  v_new_json jsonb;
  v_noise_cols text[] := ARRAY['ultimo_acesso', 'updated_at', 'created_at'];
  v_is_soft_delete boolean := false;
  v_old_ativo boolean;
  v_new_ativo boolean;
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_fazenda_id := OLD.fazenda_id;
    ELSE
      v_fazenda_id := NEW.fazenda_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_fazenda_id := NULL;
  END;

  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_registro_id := OLD.id;
    ELSE
      v_registro_id := NEW.id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_registro_id := NULL;
  END;

  -- Fallback de identidade: writes diretos do PWA não setam contexto de sessão
  -- (conta compartilhada peao.*), mas a linha carrega nome_usuario do
  -- funcionário autenticado via PIN.
  IF v_usuario_nome IS NULL THEN
    BEGIN
      v_usuario_nome := NULLIF((
        CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END
      ) ->> 'nome_usuario', '');
    EXCEPTION WHEN OTHERS THEN
      v_usuario_nome := NULL;
    END;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_json := to_jsonb(OLD);
    v_new_json := to_jsonb(NEW);
    FOR v_col IN SELECT jsonb_object_keys(v_new_json) LOOP
      IF v_col = ANY(v_noise_cols) THEN
        CONTINUE;
      END IF;
      IF v_old_json ->> v_col IS DISTINCT FROM v_new_json ->> v_col THEN
        v_alteracoes := v_alteracoes || jsonb_build_object(v_col, jsonb_build_array(
          v_old_json -> v_col,
          v_new_json -> v_col
        ));
      END IF;
    END LOOP;
    IF v_alteracoes = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    -- Detectar soft delete: campo 'ativo' mudou de true para false
    BEGIN
      v_old_ativo := (v_old_json ->> 'ativo')::boolean;
      v_new_ativo := (v_new_json ->> 'ativo')::boolean;
      IF v_old_ativo = true AND v_new_ativo = false THEN
        v_is_soft_delete := true;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_is_soft_delete := false;
    END;
  END IF;

  INSERT INTO public.audit_log (
    usuario_id, usuario_email, usuario_nome,
    fazenda_id, tabela, operacao, registro_id,
    valor_anterior, valor_novo, alteracoes,
    is_impersonation, impersonated_by,
    ip_address, user_agent, source_app, origin_page,
    transaction_id, is_soft_delete,
    acao, dados_antigos, dados_novos, criado_em
  ) VALUES (
    v_usuario_id, v_usuario_email, v_usuario_nome,
    v_fazenda_id, TG_TABLE_NAME, TG_OP, v_registro_id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    CASE WHEN TG_OP = 'UPDATE' THEN v_alteracoes ELSE NULL END,
    v_is_impersonation, v_impersonated_by,
    NULLIF(v_ip_address, ''), NULLIF(v_user_agent, ''), NULLIF(v_source_app, ''), NULLIF(v_origin_page, ''),
    txid_current(), v_is_soft_delete,
    TG_OP,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4) lancar_tratos_folha: reativa registro soft-deleted do mesmo dia/ordem
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lancar_tratos_folha(p_registros jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_item jsonb;
  v_fazenda uuid;
  v_curral uuid;
  v_lote uuid;
  v_programacao uuid;
  v_data timestamptz;
  v_ordem integer;
  v_kg_plan numeric;
  v_kg_real numeric;
  v_leitura integer;
  v_id uuid;
  v_total integer := 0;
  v_auth_id uuid;
  v_auth_email text;
  v_auth_nome text;
BEGIN
  IF p_registros IS NULL
     OR jsonb_typeof(p_registros) <> 'array'
     OR jsonb_array_length(p_registros) = 0 THEN
    RAISE EXCEPTION 'Nenhum lançamento informado.';
  END IF;

  IF (SELECT count(DISTINCT item->>'fazenda_id')
        FROM jsonb_array_elements(p_registros) item) <> 1 THEN
    RAISE EXCEPTION 'Todos os lançamentos devem pertencer à mesma fazenda.';
  END IF;

  SELECT (item->>'fazenda_id')::uuid INTO v_fazenda
    FROM jsonb_array_elements(p_registros) item LIMIT 1;

  IF NOT public.user_has_fazenda_access(v_fazenda) THEN
    RAISE EXCEPTION 'Usuário sem acesso à fazenda informada.';
  END IF;

  -- Contexto de auditoria: registra o usuário real nos inserts/updates.
  SELECT u.id, u.email, u.nome INTO v_auth_id, v_auth_email, v_auth_nome
    FROM usuarios u
   WHERE u.auth_id = auth.uid();

  IF v_auth_id IS NOT NULL THEN
    PERFORM set_config('app.current_user_id', v_auth_id::text, true);
    PERFORM set_config('app.current_user_email', COALESCE(v_auth_email, ''), true);
    PERFORM set_config('app.current_user_nome', COALESCE(v_auth_nome, ''), true);
    PERFORM set_config('app.source_app', 'painel', true);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_registros) LOOP
    v_curral := (v_item->>'curral_id')::uuid;
    v_lote := nullif(v_item->>'lote_id', '')::uuid;
    v_programacao := nullif(v_item->>'programacao_id', '')::uuid;
    v_data := (v_item->>'data')::timestamptz;
    v_ordem := (v_item->>'ordem_trato')::integer;
    v_kg_plan := nullif(v_item->>'kg_planejado', '')::numeric;
    v_kg_real := (v_item->>'kg_ofertado_real')::numeric;
    v_leitura := nullif(v_item->>'leitura_cocho_nota', '')::integer;

    IF v_curral IS NULL OR v_data IS NULL OR v_ordem IS NULL OR v_ordem <= 0 THEN
      RAISE EXCEPTION 'Lançamento inválido: curral, data e ordem do trato são obrigatórios.';
    END IF;

    IF v_kg_real IS NULL OR v_kg_real < 0 OR (v_kg_plan IS NOT NULL AND v_kg_plan < 0) THEN
      RAISE EXCEPTION 'Quantidade de trato inválida: kg real é obrigatório e não pode ser negativo.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM currais WHERE id = v_curral AND fazenda_id = v_fazenda) THEN
      RAISE EXCEPTION 'Curral informado não pertence à fazenda.';
    END IF;

    IF v_lote IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM lotes WHERE id = v_lote AND fazenda_id = v_fazenda) THEN
      RAISE EXCEPTION 'Lote informado não pertence à fazenda.';
    END IF;

    IF v_programacao IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM programacao_tratos
                      WHERE id = v_programacao AND fazenda_id = v_fazenda) THEN
        RAISE EXCEPTION 'Programação informada não pertence à fazenda.';
      END IF;
      IF v_ordem > (SELECT quantidade_tratos FROM programacao_tratos
                     WHERE id = v_programacao) THEN
        RAISE EXCEPTION 'Ordem do trato excede a quantidade configurada na programação.';
      END IF;
    END IF;

    -- Resolve o registro lógico já existente (mesmo curral, dia operacional e
    -- ordem), incluindo soft-deleted: relançar a folha reativa o registro em
    -- vez de criar uma segunda identidade ou colidir com o id de uma linha
    -- excluída (que antes era atualizada mas continuava invisível).
    SELECT rot.id INTO v_id
      FROM registros_oferta_trato rot
     WHERE rot.curral_id = v_curral
       AND (rot.data AT TIME ZONE 'America/Cuiaba')::date
           = (v_data AT TIME ZONE 'America/Cuiaba')::date
       AND rot.ordem_trato = v_ordem
     ORDER BY (rot.deleted_at IS NULL) DESC, rot.created_at DESC
     LIMIT 1;

    v_id := COALESCE(v_id, nullif(v_item->>'id', '')::uuid, gen_random_uuid());

    INSERT INTO registros_oferta_trato (
      id, fazenda_id, curral_id, lote_id, data, ordem_trato,
      kg_planejado, kg_ofertado_real, leitura_cocho_nota,
      programacao_id, nome_usuario, sync_status, origem, local_id
    ) VALUES (
      v_id, v_fazenda, v_curral, v_lote, v_data, v_ordem,
      v_kg_plan, v_kg_real, v_leitura,
      v_programacao, v_item->>'nome_usuario', 'synced',
      coalesce(nullif(v_item->>'origem', ''), 'painel'),
      nullif(v_item->>'local_id', '')
    )
    ON CONFLICT (id) DO UPDATE SET
      lote_id = EXCLUDED.lote_id,
      kg_planejado = EXCLUDED.kg_planejado,
      kg_ofertado_real = EXCLUDED.kg_ofertado_real,
      leitura_cocho_nota = EXCLUDED.leitura_cocho_nota,
      programacao_id = EXCLUDED.programacao_id,
      nome_usuario = EXCLUDED.nome_usuario,
      deleted_at = NULL;

    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 1)+2) RPCs de suplementação: chamador real via auth.uid()
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.editar_registro_suplementacao(p_id uuid, p_fazenda_id uuid, p_usuario_id uuid, p_usuario_email text, p_campos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old registros_suplementacao%ROWTYPE;
  v_new_rec registros_suplementacao%ROWTYPE;
  v_filtered jsonb := '{}'::jsonb;
  v_campo text;
  v_campos_permitidos text[] := ARRAY['data','tratador','pasto','pasto_id','lote','lote_id','formulacao','categorias','kg_cocho','kg_deposito','n_cabecas','qtd_bezerros','leitura','escore_fezes','checklist'];
  v_old_lote_id uuid; v_old_formulacao text; v_new_lote_id uuid; v_new_formulacao text;
  v_auth_id uuid; v_auth_email text; v_auth_nome text;
  v_is_controller boolean;
BEGIN
  SELECT u.id, u.email, u.nome INTO v_auth_id, v_auth_email, v_auth_nome
    FROM usuarios u WHERE u.auth_id = auth.uid();
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  PERFORM set_config('app.current_user_id', v_auth_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(v_auth_email, ''), true);
  PERFORM set_config('app.current_user_nome', COALESCE(v_auth_nome, ''), true);

  SELECT EXISTS(
    SELECT 1 FROM usuario_fazenda uf
    WHERE uf.usuario_id = v_auth_id AND uf.fazenda_id = p_fazenda_id
      AND uf.papel IN ('admin', 'controller') AND uf.ativo = true
  ) INTO v_is_controller;

  IF NOT v_is_controller THEN
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem editar registros de suplementação';
  END IF;

  SELECT * INTO v_old FROM registros_suplementacao WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado ou já excluído'; END IF;
  v_old_lote_id := v_old.lote_id; v_old_formulacao := v_old.formulacao;
  FOR v_campo IN SELECT jsonb_object_keys(p_campos) LOOP
    IF v_campo = ANY(v_campos_permitidos) THEN v_filtered := v_filtered || jsonb_build_object(v_campo, p_campos->v_campo); END IF;
  END LOOP;
  v_new_rec := jsonb_populate_record(v_old, v_filtered);
  UPDATE registros_suplementacao SET data = v_new_rec.data, tratador = v_new_rec.tratador, pasto = v_new_rec.pasto, pasto_id = v_new_rec.pasto_id, lote = v_new_rec.lote, lote_id = v_new_rec.lote_id, formulacao = v_new_rec.formulacao, categorias = v_new_rec.categorias, kg_cocho = v_new_rec.kg_cocho, kg_deposito = v_new_rec.kg_deposito, n_cabecas = v_new_rec.n_cabecas, qtd_bezerros = v_new_rec.qtd_bezerros, leitura = v_new_rec.leitura, escore_fezes = v_new_rec.escore_fezes, checklist = v_new_rec.checklist, updated_at = NOW() WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL RETURNING * INTO v_new_rec;
  v_new_lote_id := v_new_rec.lote_id; v_new_formulacao := v_new_rec.formulacao;
  IF v_new_rec.data IS DISTINCT FROM v_old.data THEN PERFORM recalcular_pesos_suplementacao_historico(p_fazenda_id, v_new_lote_id); END IF;
  IF v_new_lote_id IS DISTINCT FROM v_old_lote_id OR v_new_formulacao IS DISTINCT FROM v_old_formulacao THEN PERFORM recalc_consumo_series(p_fazenda_id, v_old_lote_id, v_old_formulacao); END IF;
  PERFORM recalc_consumo_series(p_fazenda_id, v_new_lote_id, v_new_formulacao);
  SELECT * INTO v_new_rec FROM registros_suplementacao WHERE id = p_id;
  RETURN to_jsonb(v_new_rec);
END;
$function$;

CREATE OR REPLACE FUNCTION public.excluir_registro_suplementacao(p_id uuid, p_fazenda_id uuid, p_usuario_id uuid, p_usuario_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old registros_suplementacao%ROWTYPE;
  v_lote_id uuid;
  v_formulacao text;
  v_is_controller boolean;
  v_auth_id uuid; v_auth_email text; v_auth_nome text;
BEGIN
  SELECT u.id, u.email, u.nome INTO v_auth_id, v_auth_email, v_auth_nome
    FROM usuarios u WHERE u.auth_id = auth.uid();
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  PERFORM set_config('app.current_user_id', v_auth_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(v_auth_email, ''), true);
  PERFORM set_config('app.current_user_nome', COALESCE(v_auth_nome, ''), true);

  SELECT EXISTS(
    SELECT 1 FROM usuario_fazenda uf
    WHERE uf.usuario_id = v_auth_id AND uf.fazenda_id = p_fazenda_id AND uf.papel IN ('admin', 'controller') AND uf.ativo = true
  ) INTO v_is_controller;

  IF NOT v_is_controller THEN
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem excluir registros de suplementação';
  END IF;

  SELECT * INTO v_old FROM registros_suplementacao WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado ou já excluído'; END IF;

  v_lote_id := v_old.lote_id;
  v_formulacao := v_old.formulacao;

  UPDATE registros_suplementacao SET deleted_at = NOW(), updated_at = NOW() WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;

  PERFORM recalc_consumo_series(p_fazenda_id, v_lote_id, v_formulacao);

  RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 1)+5) RPCs de leitura de cocho e oferta de trato
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.editar_registro_leitura_cocho(
  p_id uuid,
  p_fazenda_id uuid,
  p_usuario_id uuid,
  p_usuario_email text,
  p_campos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old registros_leitura_cocho%ROWTYPE;
  v_new_rec registros_leitura_cocho%ROWTYPE;
  v_filtered jsonb := '{}'::jsonb;
  v_campo text;
  v_campos_permitidos text[] := ARRAY['data','responsavel','pasto_curral','pasto_id','lote','lote_id','leitura_cocho'];
  v_is_controller boolean;
  v_auth_id uuid; v_auth_email text; v_auth_nome text;
BEGIN
  SELECT u.id, u.email, u.nome INTO v_auth_id, v_auth_email, v_auth_nome
    FROM usuarios u WHERE u.auth_id = auth.uid();
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  PERFORM set_config('app.current_user_id', v_auth_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(v_auth_email, ''), true);
  PERFORM set_config('app.current_user_nome', COALESCE(v_auth_nome, ''), true);

  SELECT EXISTS(
    SELECT 1 FROM usuario_fazenda uf
    WHERE uf.usuario_id = v_auth_id
      AND uf.fazenda_id = p_fazenda_id
      AND uf.papel IN ('admin', 'controller')
      AND uf.ativo = true
  ) INTO v_is_controller;

  IF NOT v_is_controller THEN
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem editar leituras de cocho';
  END IF;

  SELECT * INTO v_old
  FROM registros_leitura_cocho
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado ou já excluído';
  END IF;

  FOR v_campo IN SELECT jsonb_object_keys(p_campos) LOOP
    IF v_campo = ANY(v_campos_permitidos) THEN
      v_filtered := v_filtered || jsonb_build_object(v_campo, p_campos->v_campo);
    END IF;
  END LOOP;

  v_new_rec := jsonb_populate_record(v_old, v_filtered);

  IF v_new_rec.leitura_cocho IS NOT NULL
     AND (v_new_rec.leitura_cocho < -1 OR v_new_rec.leitura_cocho > 3) THEN
    RAISE EXCEPTION 'Nota de leitura inválida: deve estar entre -1 e 3';
  END IF;

  IF v_new_rec.data IS NULL THEN
    RAISE EXCEPTION 'Data é obrigatória';
  END IF;

  -- Garante que lote/pasto informados pertencem à mesma fazenda
  IF v_new_rec.lote_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM lotes WHERE id = v_new_rec.lote_id AND fazenda_id = p_fazenda_id
  ) THEN
    RAISE EXCEPTION 'Lote não pertence a esta fazenda';
  END IF;

  IF v_new_rec.pasto_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM pastos WHERE id = v_new_rec.pasto_id AND fazenda_id = p_fazenda_id
  ) THEN
    RAISE EXCEPTION 'Pasto não pertence a esta fazenda';
  END IF;

  -- Se a nota mudou, re-resolve a configuração correspondente para não ficar
  -- apontando para o percentual da nota antiga.
  IF v_new_rec.leitura_cocho IS DISTINCT FROM v_old.leitura_cocho THEN
    SELECT nlc.id INTO v_new_rec.nota_config_id
    FROM notas_leitura_cocho_config nlc
    WHERE nlc.fazenda_id = p_fazenda_id
      AND nlc.nota = v_new_rec.leitura_cocho;
  END IF;

  UPDATE registros_leitura_cocho SET
    data = v_new_rec.data,
    responsavel = v_new_rec.responsavel,
    pasto_curral = v_new_rec.pasto_curral,
    pasto_id = v_new_rec.pasto_id,
    lote = v_new_rec.lote,
    lote_id = v_new_rec.lote_id,
    leitura_cocho = v_new_rec.leitura_cocho,
    nota_config_id = v_new_rec.nota_config_id,
    updated_at = NOW()
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
  RETURNING * INTO v_new_rec;

  RETURN to_jsonb(v_new_rec);
END;
$function$;

CREATE OR REPLACE FUNCTION public.excluir_registro_leitura_cocho(
  p_id uuid,
  p_fazenda_id uuid,
  p_usuario_id uuid,
  p_usuario_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old registros_leitura_cocho%ROWTYPE;
  v_is_controller boolean;
  v_auth_id uuid; v_auth_email text; v_auth_nome text;
BEGIN
  SELECT u.id, u.email, u.nome INTO v_auth_id, v_auth_email, v_auth_nome
    FROM usuarios u WHERE u.auth_id = auth.uid();
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  PERFORM set_config('app.current_user_id', v_auth_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(v_auth_email, ''), true);
  PERFORM set_config('app.current_user_nome', COALESCE(v_auth_nome, ''), true);

  SELECT EXISTS(
    SELECT 1 FROM usuario_fazenda uf
    WHERE uf.usuario_id = v_auth_id
      AND uf.fazenda_id = p_fazenda_id
      AND uf.papel IN ('admin', 'controller')
      AND uf.ativo = true
  ) INTO v_is_controller;

  IF NOT v_is_controller THEN
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem excluir leituras de cocho';
  END IF;

  SELECT * INTO v_old
  FROM registros_leitura_cocho
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado ou já excluído';
  END IF;

  UPDATE registros_leitura_cocho
  SET deleted_at = NOW(), updated_at = NOW()
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;

  RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.editar_registro_oferta_trato(
  p_id uuid,
  p_fazenda_id uuid,
  p_usuario_id uuid,
  p_usuario_email text,
  p_campos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old registros_oferta_trato%ROWTYPE;
  v_new_rec registros_oferta_trato%ROWTYPE;
  v_filtered jsonb := '{}'::jsonb;
  v_campo text;
  v_campos_permitidos text[] := ARRAY['data','ordem_trato','kg_planejado','kg_ofertado_real','leitura_cocho_nota','lote_id','curral_id'];
  v_is_controller boolean;
  v_auth_id uuid; v_auth_email text; v_auth_nome text;
BEGIN
  SELECT u.id, u.email, u.nome INTO v_auth_id, v_auth_email, v_auth_nome
    FROM usuarios u WHERE u.auth_id = auth.uid();
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  PERFORM set_config('app.current_user_id', v_auth_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(v_auth_email, ''), true);
  PERFORM set_config('app.current_user_nome', COALESCE(v_auth_nome, ''), true);

  SELECT EXISTS(
    SELECT 1 FROM usuario_fazenda uf
    WHERE uf.usuario_id = v_auth_id
      AND uf.fazenda_id = p_fazenda_id
      AND uf.papel IN ('admin', 'controller')
      AND uf.ativo = true
  ) INTO v_is_controller;

  IF NOT v_is_controller THEN
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem editar registros de trato';
  END IF;

  SELECT * INTO v_old
  FROM registros_oferta_trato
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado ou já excluído';
  END IF;

  FOR v_campo IN SELECT jsonb_object_keys(p_campos) LOOP
    IF v_campo = ANY(v_campos_permitidos) THEN
      v_filtered := v_filtered || jsonb_build_object(v_campo, p_campos->v_campo);
    END IF;
  END LOOP;

  v_new_rec := jsonb_populate_record(v_old, v_filtered);

  IF v_new_rec.data IS NULL THEN
    RAISE EXCEPTION 'Data é obrigatória';
  END IF;

  IF v_new_rec.ordem_trato IS NULL OR v_new_rec.ordem_trato < 1 THEN
    RAISE EXCEPTION 'Ordem do trato deve ser um número maior que zero';
  END IF;

  IF v_new_rec.kg_planejado IS NOT NULL AND v_new_rec.kg_planejado < 0 THEN
    RAISE EXCEPTION 'Kg planejado não pode ser negativo';
  END IF;

  IF v_new_rec.kg_ofertado_real IS NOT NULL AND v_new_rec.kg_ofertado_real < 0 THEN
    RAISE EXCEPTION 'Kg ofertado não pode ser negativo';
  END IF;

  IF v_new_rec.leitura_cocho_nota IS NOT NULL
     AND (v_new_rec.leitura_cocho_nota < -1 OR v_new_rec.leitura_cocho_nota > 3) THEN
    RAISE EXCEPTION 'Nota de leitura inválida: deve estar entre -1 e 3';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM currais WHERE id = v_new_rec.curral_id AND fazenda_id = p_fazenda_id
  ) THEN
    RAISE EXCEPTION 'Curral não pertence a esta fazenda';
  END IF;

  IF v_new_rec.lote_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM lotes WHERE id = v_new_rec.lote_id AND fazenda_id = p_fazenda_id
  ) THEN
    RAISE EXCEPTION 'Lote não pertence a esta fazenda';
  END IF;

  UPDATE registros_oferta_trato SET
    data = v_new_rec.data,
    ordem_trato = v_new_rec.ordem_trato,
    kg_planejado = v_new_rec.kg_planejado,
    kg_ofertado_real = v_new_rec.kg_ofertado_real,
    leitura_cocho_nota = v_new_rec.leitura_cocho_nota,
    lote_id = v_new_rec.lote_id,
    curral_id = v_new_rec.curral_id,
    updated_at = NOW()
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
  RETURNING * INTO v_new_rec;

  RETURN to_jsonb(v_new_rec);
END;
$function$;

CREATE OR REPLACE FUNCTION public.excluir_registro_oferta_trato(
  p_id uuid,
  p_fazenda_id uuid,
  p_usuario_id uuid,
  p_usuario_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old registros_oferta_trato%ROWTYPE;
  v_is_controller boolean;
  v_auth_id uuid; v_auth_email text; v_auth_nome text;
BEGIN
  SELECT u.id, u.email, u.nome INTO v_auth_id, v_auth_email, v_auth_nome
    FROM usuarios u WHERE u.auth_id = auth.uid();
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  PERFORM set_config('app.current_user_id', v_auth_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(v_auth_email, ''), true);
  PERFORM set_config('app.current_user_nome', COALESCE(v_auth_nome, ''), true);

  SELECT EXISTS(
    SELECT 1 FROM usuario_fazenda uf
    WHERE uf.usuario_id = v_auth_id
      AND uf.fazenda_id = p_fazenda_id
      AND uf.papel IN ('admin', 'controller')
      AND uf.ativo = true
  ) INTO v_is_controller;

  IF NOT v_is_controller THEN
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem excluir registros de trato';
  END IF;

  SELECT * INTO v_old
  FROM registros_oferta_trato
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado ou já excluído';
  END IF;

  UPDATE registros_oferta_trato
  SET deleted_at = NOW(), updated_at = NOW()
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;

  RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6) Constraint redundante por timestamp exato (substituída pelo índice de dia
--    operacional registros_oferta_trato_dia_operacional_uk)
-- ---------------------------------------------------------------------------

ALTER TABLE public.registros_oferta_trato
  DROP CONSTRAINT IF EXISTS registros_oferta_trato_curral_id_data_ordem_trato_key;
