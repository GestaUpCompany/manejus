-- RPCs de editar/excluir registros de clima + trigger de auditoria.
--
-- Segue o padrão hardenado de editar_registro_leitura_cocho /
-- excluir_registro_leitura_cocho (20260922150000): chamador resolvido via
-- auth.uid() -> usuarios.auth_id (p_usuario_id/p_usuario_email ficam na
-- assinatura só por compatibilidade), papel admin/controller exigido em
-- usuario_fazenda, whitelist de campos em p_campos, soft delete.
--
-- Campos editáveis: data, responsavel, medicoes, temperatura_media,
-- umidade_relativa, tempo_atual, esvaziou_pluviometros, choveu, observacao.
-- Não editáveis: identidade/autoria (id, fazenda_id, dispositivo_id,
-- nome_usuario) e metadados de sync (local_id, sync_status, version).
--
-- Quando medicoes é enviado, cada item é reconstruído apenas com as chaves
-- conhecidas (pluviometro_id/nome/localizacao, medicao, temperatura, horario)
-- e temperatura_media é recalculada como média das temperaturas válidas,
-- replicando a derivação que o PWA faz no lançamento.
--
-- Também adiciona trg_audit_registros_clima: a tabela era a única caderneta
-- editável pelo painel sem auditoria (as demais receberam trigger em
-- 20260807143135). fn_audit_trigger já tem fallback para nome_usuario da
-- linha, cobrindo writes diretos do PWA.

CREATE OR REPLACE FUNCTION public.editar_registro_clima(
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
  v_old registros_clima%ROWTYPE;
  v_new_rec registros_clima%ROWTYPE;
  v_filtered jsonb := '{}'::jsonb;
  v_campo text;
  v_campos_permitidos text[] := ARRAY['data','responsavel','medicoes','temperatura_media','umidade_relativa','tempo_atual','esvaziou_pluviometros','choveu','observacao'];
  v_tempo_valores text[] := ARRAY['sol','nublado','chuva_fraca','chuva_forte','temporal','vento_forte','frio','seco_poeira'];
  v_temp_media numeric;
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
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem editar registros de clima';
  END IF;

  SELECT * INTO v_old
  FROM registros_clima
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

  IF v_new_rec.responsavel IS NULL OR btrim(v_new_rec.responsavel) = '' THEN
    RAISE EXCEPTION 'Responsável é obrigatório';
  END IF;

  IF v_new_rec.tempo_atual IS NOT NULL
     AND NOT (v_new_rec.tempo_atual = ANY(v_tempo_valores)) THEN
    RAISE EXCEPTION 'Tempo atual inválido';
  END IF;

  IF v_new_rec.umidade_relativa IS NOT NULL
     AND (v_new_rec.umidade_relativa < 0 OR v_new_rec.umidade_relativa > 100) THEN
    RAISE EXCEPTION 'Umidade relativa deve estar entre 0 e 100';
  END IF;

  IF v_new_rec.temperatura_media IS NOT NULL
     AND (v_new_rec.temperatura_media < -60 OR v_new_rec.temperatura_media > 60) THEN
    RAISE EXCEPTION 'Temperatura média fora da faixa plausível';
  END IF;

  -- medicoes: força shape conhecido e valida valores
  IF p_campos ? 'medicoes' THEN
    IF v_new_rec.medicoes IS NOT NULL
       AND jsonb_typeof(v_new_rec.medicoes) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Medições devem ser um array';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'pluviometro_id', m->>'pluviometro_id',
      'pluviometro_nome', m->>'pluviometro_nome',
      'pluviometro_localizacao', m->>'pluviometro_localizacao',
      'medicao', NULLIF(m->>'medicao', '')::numeric,
      'temperatura', NULLIF(m->>'temperatura', '')::numeric,
      'horario', NULLIF(m->>'horario', '')
    )), '[]'::jsonb)
    INTO v_new_rec.medicoes
    FROM jsonb_array_elements(COALESCE(v_new_rec.medicoes, '[]'::jsonb)) m;

    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_new_rec.medicoes) m
      WHERE (m->>'medicao')::numeric < 0
    ) THEN
      RAISE EXCEPTION 'Medição de pluviômetro não pode ser negativa';
    END IF;

    -- temperatura_media é derivada das temperaturas das medições (mesma regra
    -- do PWA). Se nenhuma medição tem temperatura, preserva o valor enviado
    -- nos campos para não apagar registros antigos sem temperatura por
    -- pluviômetro.
    SELECT AVG((m->>'temperatura')::numeric)
    INTO v_temp_media
    FROM jsonb_array_elements(v_new_rec.medicoes) m
    WHERE m->>'temperatura' IS NOT NULL;

    IF v_temp_media IS NOT NULL THEN
      v_new_rec.temperatura_media := ROUND(v_temp_media, 1);
    END IF;
  END IF;

  UPDATE registros_clima SET
    data = v_new_rec.data,
    responsavel = v_new_rec.responsavel,
    medicoes = v_new_rec.medicoes,
    temperatura_media = v_new_rec.temperatura_media,
    umidade_relativa = v_new_rec.umidade_relativa,
    tempo_atual = v_new_rec.tempo_atual,
    esvaziou_pluviometros = v_new_rec.esvaziou_pluviometros,
    choveu = v_new_rec.choveu,
    observacao = v_new_rec.observacao,
    updated_at = NOW()
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
  RETURNING * INTO v_new_rec;

  RETURN to_jsonb(v_new_rec);
END;
$function$;

CREATE OR REPLACE FUNCTION public.excluir_registro_clima(
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
  v_old registros_clima%ROWTYPE;
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
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem excluir registros de clima';
  END IF;

  SELECT * INTO v_old
  FROM registros_clima
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado ou já excluído';
  END IF;

  UPDATE registros_clima
  SET deleted_at = NOW(), updated_at = NOW()
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;

  RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.editar_registro_clima(uuid, uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_registro_clima(uuid, uuid, uuid, text) TO authenticated;

DROP TRIGGER IF EXISTS trg_audit_registros_clima ON public.registros_clima;
CREATE TRIGGER trg_audit_registros_clima
  AFTER INSERT OR UPDATE OR DELETE ON public.registros_clima
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
