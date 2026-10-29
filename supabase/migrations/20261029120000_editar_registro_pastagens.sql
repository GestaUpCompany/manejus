-- RPC para editar registros de pastagens no painel web (mesmo padrão de editar_registro_suplementacao).
--
-- Campos editáveis (whitelist): data, avaliacao_saida, escore_gado, escore_fezes, numero_pessoas_manejo.
-- Não move lote nem pasto: os triggers de movimentação de registros_pastagens são AFTER INSERT,
-- então o UPDATE aqui não reprocessa ocupações. Consequência: editar a data não ajusta
-- lote_pasto_historico nem tempo_ocupacao/tempo_vedacao já gravados.
--
-- Autorização: papel admin/controller na fazenda (usuario_fazenda), igual às demais RPCs de edição.

CREATE OR REPLACE FUNCTION public.editar_registro_pastagens(
  p_id uuid,
  p_fazenda_id uuid,
  p_usuario_id uuid,
  p_usuario_email text,
  p_campos jsonb
)
RETURNS public.registros_pastagens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old public.registros_pastagens%ROWTYPE;
  v_new public.registros_pastagens%ROWTYPE;
  v_filtered jsonb := '{}'::jsonb;
  v_campo text;
  v_campos_permitidos text[] := ARRAY['data','avaliacao_saida','escore_gado','escore_fezes','numero_pessoas_manejo'];
  v_auth_id uuid; v_auth_email text; v_auth_nome text;
  v_is_controller boolean;
BEGIN
  SELECT u.id, u.email, u.nome INTO v_auth_id, v_auth_email, v_auth_nome
    FROM public.usuarios u WHERE u.auth_id = auth.uid();
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  PERFORM set_config('app.current_user_id', v_auth_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(v_auth_email, ''), true);
  PERFORM set_config('app.current_user_nome', COALESCE(v_auth_nome, ''), true);

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_fazenda uf
    WHERE uf.usuario_id = v_auth_id AND uf.fazenda_id = p_fazenda_id
      AND uf.papel IN ('admin', 'controller') AND uf.ativo = true
  ) INTO v_is_controller;

  IF NOT v_is_controller THEN
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem editar registros de pastagens';
  END IF;

  SELECT * INTO v_old FROM public.registros_pastagens
    WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado ou já excluído';
  END IF;

  -- Avaliação do pasto de saída só existe quando a saída foi de pasto (não de curral)
  IF p_campos ? 'avaliacao_saida' AND p_campos->'avaliacao_saida' <> 'null'::jsonb THEN
    IF v_old.pasto_saida IS NULL THEN
      RAISE EXCEPTION 'Este registro não tem avaliação de pasto de saída (a saída foi de curral)';
    END IF;
    IF (p_campos->>'avaliacao_saida')::int NOT BETWEEN 1 AND 5 THEN
      RAISE EXCEPTION 'Avaliação do pasto de saída deve estar entre 1 e 5';
    END IF;
  END IF;

  FOR v_campo IN SELECT jsonb_object_keys(p_campos) LOOP
    IF v_campo = ANY(v_campos_permitidos) THEN
      v_filtered := v_filtered || jsonb_build_object(v_campo, p_campos->v_campo);
    END IF;
  END LOOP;

  v_new := jsonb_populate_record(v_old, v_filtered);

  UPDATE public.registros_pastagens
  SET data = v_new.data,
      avaliacao_saida = v_new.avaliacao_saida,
      escore_gado = v_new.escore_gado,
      escore_fezes = v_new.escore_fezes,
      numero_pessoas_manejo = v_new.numero_pessoas_manejo,
      updated_at = now()
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
  RETURNING * INTO v_new;

  RETURN v_new;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.editar_registro_pastagens(uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_registro_pastagens(uuid, uuid, uuid, text, jsonb) TO authenticated, service_role;
