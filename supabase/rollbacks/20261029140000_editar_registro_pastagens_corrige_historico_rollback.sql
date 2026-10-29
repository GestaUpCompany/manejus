-- Rollback de 20261029140000_editar_registro_pastagens_corrige_historico.sql
-- Restaura as travas originais do histórico e a versão anterior de editar_registro_pastagens
-- (20261029120000), e remove os helpers. Não desfaz correções de histórico já feitas.

CREATE OR REPLACE FUNCTION public.proteger_lote_pasto_historico_update()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF (
    OLD.id IS DISTINCT FROM NEW.id OR
    OLD.lote_id IS DISTINCT FROM NEW.lote_id OR
    OLD.pasto_id IS DISTINCT FROM NEW.pasto_id OR
    OLD.data_hora_entrada IS DISTINCT FROM NEW.data_hora_entrada OR
    OLD.cabecas_entrada IS DISTINCT FROM NEW.cabecas_entrada OR
    OLD.peso_vivo_medio_entrada_kg IS DISTINCT FROM NEW.peso_vivo_medio_entrada_kg OR
    OLD.modulo_id IS DISTINCT FROM NEW.modulo_id OR
    OLD.created_at IS DISTINCT FROM NEW.created_at
  ) THEN
    RAISE EXCEPTION 'Não é permitido alterar campos de entrada do histórico. Apenas data_hora_saida, cabecas_saida, peso_vivo_medio_saida_kg, desvio_tempo_ocupacao_percent, taxa_lotacao_ua_ha e meta_intervalo_ocupacao_dias podem ser atualizados.';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.proteger_lote_modulo_historico_update()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF (
    OLD.id IS DISTINCT FROM NEW.id OR
    OLD.lote_id IS DISTINCT FROM NEW.lote_id OR
    OLD.modulo_id IS DISTINCT FROM NEW.modulo_id OR
    OLD.data_hora_entrada IS DISTINCT FROM NEW.data_hora_entrada OR
    OLD.cabecas_entrada IS DISTINCT FROM NEW.cabecas_entrada OR
    OLD.peso_vivo_medio_entrada_kg IS DISTINCT FROM NEW.peso_vivo_medio_entrada_kg OR
    OLD.created_at IS DISTINCT FROM NEW.created_at
  ) THEN
    RAISE EXCEPTION 'Não é permitido alterar campos de entrada do histórico de módulo. Apenas data_hora_saida, cabecas_saida, peso_vivo_medio_saida_kg, desvio_tempo_ocupacao_percent, taxa_lotacao_ua_ha e meta_intervalo_ocupacao_dias podem ser atualizados.';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

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

DROP FUNCTION IF EXISTS public._corrigir_historico_movimento_pastagem(public.registros_pastagens, timestamptz);
DROP FUNCTION IF EXISTS public._formatar_tempo_pastagens(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public._desvio_ocupacao_pastagens(timestamptz, timestamptz, integer);
