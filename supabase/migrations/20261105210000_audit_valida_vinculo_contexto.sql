-- fn_audit_trigger: só aceita a identidade do contexto de sessão (app.current_user_*) se o usuário
-- tiver vínculo ativo com a fazenda da linha gravada.
--
-- Motivo: set_audit_context grava o contexto com escopo de SESSÃO (is_local = false) na conexão
-- do pool. Uma gravação posterior feita na mesma conexão (sem contexto próprio, ex.: PWA) herdava
-- a identidade de quem definiu o contexto antes. Em 30 dias, 67 gravações de movimentação tinham
-- identidade sem vínculo com a fazenda gravada (22 contas, todas origem web).
--
-- Regra nova: se o contexto aponta para um usuário sem vínculo ativo com NEW.fazenda_id/OLD.fazenda_id,
-- a identidade vem nula e cai no fallback já existente (nome_usuario da própria linha).
-- Impersonação não é validada aqui: ela já é checada em set_audit_context via impersonation_sessions.
--
-- Limitação conhecida: se o contexto herdado for de OUTRO usuário com vínculo na MESMA fazenda,
-- a validação não detecta. Isso depende de o painel limpar o contexto após cada escrita
-- (clearAuditContext), o que é tratado no código do painel.

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
  v_vinculo_ok boolean;
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

  -- Validação de vínculo: contexto herdado de outra requisição não pode atribuir autoria
  -- a um usuário sem vínculo ativo com a fazenda da linha.
  IF v_usuario_id IS NOT NULL AND v_fazenda_id IS NOT NULL AND NOT v_is_impersonation THEN
    SELECT EXISTS (
      SELECT 1 FROM public.usuario_fazenda uf
      WHERE uf.usuario_id = v_usuario_id
        AND uf.fazenda_id = v_fazenda_id
        AND uf.ativo = true
    ) INTO v_vinculo_ok;
    IF NOT v_vinculo_ok THEN
      v_usuario_id := NULL;
      v_usuario_email := NULL;
      v_usuario_nome := NULL;
    END IF;
  END IF;

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

  -- dados_antigos/dados_novos ficam NULL: eram duplicatas de valor_anterior/
  -- valor_novo que dobravam o tamanho de cada linha sem consumidor (a RPC
  -- get_audit_log lê apenas valor_* e alteracoes)
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
    NULL, NULL,
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;
