-- ============================================================================
-- Fase 5.3 (segurança): RPCs de escrita/exclusão com checagem de tenant e de identidade
-- ============================================================================
-- Achado: 18 RPCs SECURITY DEFINER de escrita/exclusão eram executáveis por `anon` e recebiam do
-- chamador o id do objeto, a fazenda e o usuário, sem validar nada. Com a chave anon (embutida no
-- bundle do PWA), qualquer pessoa podia transferir lotes, aprovar solicitações, corrigir pesos,
-- excluir registros, mexer em planos nutricionais, gravar config e criar notificações em nome de
-- outro usuário em QUALQUER fazenda.
--
-- Ação:
--  1. Helpers `guard_w_*` (levantam 42501). Só valem para chamadas de CLIENTE: role do JWT
--     anon/authenticated E pg_trigger_depth() = 0. Chamadas internas (service_role, cron, sessão sem JWT,
--     função chamada por trigger) passam, para não quebrar gatilhos e rotinas existentes.
--       guard_w_fazenda(uuid)          -> admin OU acesso à fazenda
--       guard_w_lote(uuid)             -> fazenda do lote
--       guard_w_lote_categoria(uuid)   -> fazenda do lote da categoria
--       guard_w_solicitacao(uuid)      -> fazenda da solicitação
--       guard_w_usuario(uuid)          -> p_usuario_id tem de ser a identidade do chamador (auth.uid()
--                                          ou o usuarios.id cujo auth_id = auth.uid()); NULL passa
--  2. Guarda injetada no topo de cada função (corpo original preservado). O tenant vem do OBJETO alvo,
--     nunca do parâmetro de fazenda sozinho.
--  3. REVOKE EXECUTE FROM PUBLIC, anon (authenticated e service_role mantidos).
--
-- Decisões:
--  * transferir_lote_entre_fazendas: exige acesso à fazenda de ORIGEM do lote (o corpo já valida que
--    destino está no mesmo grupo).
--  * registrar_push_subscription: fazenda + funcionario_id precisa ser da mesma fazenda.
--  * remover_push_subscription: só apaga linhas de fazendas a que o chamador tem acesso.
--  * Limite conhecido: o papel em usuario_fazenda dos peões é 'controller' (mesmo dos gestores), então a
--    checagem "apenas controller+" dentro de excluir_registro_* não separa peão de gestor. Separação por
--    papel é item à parte (BACKLOG). p_usuario_email/p_nome_usuario seguem como texto informado.
-- Rollback: supabase/rollbacks/20261007263000_fase5_3_rpcs_escrita_authz_rollback.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helpers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_w_is_client()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT coalesce(auth.role(), '') IN ('anon', 'authenticated') AND pg_trigger_depth() = 0;
$$;

CREATE OR REPLACE FUNCTION public.guard_w_fazenda(p_fazenda_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.guard_w_is_client() THEN
    RETURN true;
  END IF;
  IF p_fazenda_id IS NULL OR NOT (public.is_admin_user() OR public.caller_has_fazenda_access(p_fazenda_id)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_w_lote(p_lote_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.guard_w_is_client() THEN
    RETURN true;
  END IF;
  RETURN public.guard_w_fazenda((SELECT l.fazenda_id FROM public.lotes l WHERE l.id = p_lote_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_w_lote_categoria(p_lote_categoria_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.guard_w_is_client() THEN
    RETURN true;
  END IF;
  RETURN public.guard_w_fazenda((
    SELECT l.fazenda_id
    FROM public.lote_categorias lc
    JOIN public.lotes l ON l.id = lc.lote_id
    WHERE lc.id = p_lote_categoria_id
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_w_solicitacao(p_solicitacao_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.guard_w_is_client() THEN
    RETURN true;
  END IF;
  RETURN public.guard_w_fazenda((SELECT s.fazenda_id FROM public.solicitacoes_novo_lote s WHERE s.id = p_solicitacao_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_w_usuario(p_usuario_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.guard_w_is_client() OR p_usuario_id IS NULL THEN
    RETURN true;
  END IF;
  IF p_usuario_id = auth.uid()
     OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_usuario_id AND u.auth_id = auth.uid()) THEN
    RETURN true;
  END IF;
  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.guard_w_is_client(), public.guard_w_fazenda(uuid), public.guard_w_lote(uuid),
  public.guard_w_lote_categoria(uuid), public.guard_w_solicitacao(uuid), public.guard_w_usuario(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.guard_w_is_client(), public.guard_w_fazenda(uuid), public.guard_w_lote(uuid),
  public.guard_w_lote_categoria(uuid), public.guard_w_solicitacao(uuid), public.guard_w_usuario(uuid)
TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Injeta a guarda no topo de cada função (corpo original preservado)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  def text;
  novo text;
  guarda text;
  v_total int := 0;
  v_esperado constant int := 18;
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prosecdef
      AND p.proname = ANY (ARRAY[
        'aprovar_solicitacao_novo_lote','rejeitar_solicitacao_novo_lote','transferir_lote_entre_fazendas',
        'corrigir_peso_categoria','recategorizar_lote_categoria','iniciar_plano_lote','encerrar_plano_lote',
        'migrar_plano_lote','migrar_plano_nutricional','encerrar_plano_nutricional','criar_snapshot_entrada',
        'excluir_registro_abastecimento','excluir_registro_entrada_insumos','gerar_notificacoes_recategorizacao',
        'salvar_notificacoes_config','registrar_push_subscription','remover_push_subscription',
        'update_quant_atual_with_data'
      ])
  LOOP
    def := pg_get_functiondef(r.oid);
    IF position('guard_w_' IN def) > 0 THEN
      RAISE EXCEPTION 'Fase 5.3: % já tem guarda (migration reaplicada?)', r.sig;
    END IF;

    guarda := CASE r.proname
      WHEN 'aprovar_solicitacao_novo_lote' THEN
        E'  PERFORM public.guard_w_solicitacao(p_solicitacao_id);\n  PERFORM public.guard_w_usuario(p_usuario_id);\n'
      WHEN 'rejeitar_solicitacao_novo_lote' THEN
        E'  PERFORM public.guard_w_solicitacao(p_solicitacao_id);\n  PERFORM public.guard_w_usuario(p_usuario_id);\n'
      WHEN 'transferir_lote_entre_fazendas' THEN
        E'  PERFORM public.guard_w_lote(p_lote_origem_id);\n'
      WHEN 'corrigir_peso_categoria' THEN
        E'  PERFORM public.guard_w_lote_categoria(p_lote_categoria_id);\n  PERFORM public.guard_w_usuario(p_usuario_id);\n'
      WHEN 'recategorizar_lote_categoria' THEN
        E'  PERFORM public.guard_w_lote_categoria(p_lote_categoria_origem_id);\n  PERFORM public.guard_w_usuario(p_usuario_id);\n'
      WHEN 'iniciar_plano_lote' THEN E'  PERFORM public.guard_w_lote(p_lote_id);\n'
      WHEN 'encerrar_plano_lote' THEN E'  PERFORM public.guard_w_lote(p_lote_id);\n'
      WHEN 'migrar_plano_lote' THEN E'  PERFORM public.guard_w_lote(p_lote_id);\n'
      WHEN 'migrar_plano_nutricional' THEN E'  PERFORM public.guard_w_lote_categoria(p_lote_categoria_id);\n'
      WHEN 'encerrar_plano_nutricional' THEN E'  PERFORM public.guard_w_lote_categoria(p_lote_categoria_id);\n'
      WHEN 'criar_snapshot_entrada' THEN E'  PERFORM public.guard_w_lote_categoria(p_lote_categoria_id);\n'
      WHEN 'excluir_registro_abastecimento' THEN
        E'  PERFORM public.guard_w_fazenda(p_fazenda_id);\n  PERFORM public.guard_w_usuario(p_usuario_id);\n'
      WHEN 'excluir_registro_entrada_insumos' THEN
        E'  PERFORM public.guard_w_fazenda(p_fazenda_id);\n  PERFORM public.guard_w_usuario(p_usuario_id);\n'
      WHEN 'gerar_notificacoes_recategorizacao' THEN
        E'  PERFORM public.guard_w_fazenda(p_fazenda_id);\n  PERFORM public.guard_w_usuario(p_usuario_id);\n'
      WHEN 'salvar_notificacoes_config' THEN E'  PERFORM public.guard_w_fazenda(p_fazenda_id);\n'
      WHEN 'registrar_push_subscription' THEN
        E'  PERFORM public.guard_w_fazenda(p_fazenda_id);\n'
        || E'  IF p_funcionario_id IS NOT NULL AND public.guard_w_is_client()\n'
        || E'     AND NOT EXISTS (SELECT 1 FROM public.funcionarios fu WHERE fu.id = p_funcionario_id AND fu.fazenda_id = p_fazenda_id) THEN\n'
        || E'    RAISE EXCEPTION ''forbidden'' USING ERRCODE = ''42501'';\n'
        || E'  END IF;\n'
      WHEN 'remover_push_subscription' THEN NULL  -- tratado abaixo (filtro no DELETE)
      WHEN 'update_quant_atual_with_data' THEN E'  PERFORM public.guard_w_lote(p_lote_id);\n'
    END;

    IF r.proname = 'remover_push_subscription' THEN
      novo := replace(def,
        'WHERE dispositivo_id = p_dispositivo_id AND endpoint = p_endpoint;',
        E'WHERE dispositivo_id = p_dispositivo_id AND endpoint = p_endpoint\n'
        || E'    AND (NOT public.guard_w_is_client() OR public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));');
    ELSE
      IF position(E'\nBEGIN\n' IN def) = 0 THEN
        RAISE EXCEPTION 'Fase 5.3: % sem BEGIN', r.sig;
      END IF;
      -- regexp_replace sem flag g: só o primeiro BEGIN (corpo pode ter blocos aninhados)
      novo := regexp_replace(def, E'\nBEGIN\n', E'\nBEGIN\n' || guarda);
    END IF;

    IF novo = def OR position('guard_w_' IN novo) = 0 THEN
      RAISE EXCEPTION 'Fase 5.3: % não foi alterada (padrão não encontrado)', r.sig;
    END IF;

    EXECUTE novo;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    v_total := v_total + 1;
  END LOOP;

  IF v_total <> v_esperado THEN
    RAISE EXCEPTION 'Fase 5.3: esperava % funções, encontrei %', v_esperado, v_total;
  END IF;
END $$;
