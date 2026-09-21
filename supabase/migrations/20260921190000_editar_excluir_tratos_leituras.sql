-- Edição e exclusão administrativa de tratos e leituras de cocho pelo Painel Web.
-- Segue o padrão de editar_registro_suplementacao/excluir_registro_suplementacao:
-- RPCs SECURITY DEFINER com whitelist de campos via jsonb, verificação de papel
-- (admin/controller) em usuario_fazenda, soft delete via deleted_at e auditoria
-- automática via fn_audit_trigger usando o contexto app.current_user_*.

-- registros_leitura_cocho já possui trg_audit_registros_leitura_cocho.
-- registros_oferta_trato ainda não tinha trigger de auditoria; criamos aqui para
-- que edições/exclusões (e inserts vindos do PWA/painel) apareçam no audit_log.
DROP TRIGGER IF EXISTS trg_audit_registros_oferta_trato ON public.registros_oferta_trato;
CREATE TRIGGER trg_audit_registros_oferta_trato
  AFTER INSERT OR UPDATE OR DELETE ON public.registros_oferta_trato
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- ---------------------------------------------------------------------------
-- Leituras de cocho
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
BEGIN
  PERFORM set_config('app.current_user_id', p_usuario_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(p_usuario_email, ''), true);

  SELECT EXISTS(
    SELECT 1 FROM usuario_fazenda uf
    WHERE uf.usuario_id = p_usuario_id
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

  UPDATE registros_leitura_cocho SET
    data = v_new_rec.data,
    responsavel = v_new_rec.responsavel,
    pasto_curral = v_new_rec.pasto_curral,
    pasto_id = v_new_rec.pasto_id,
    lote = v_new_rec.lote,
    lote_id = v_new_rec.lote_id,
    leitura_cocho = v_new_rec.leitura_cocho,
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
BEGIN
  PERFORM set_config('app.current_user_id', p_usuario_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(p_usuario_email, ''), true);

  SELECT EXISTS(
    SELECT 1 FROM usuario_fazenda uf
    WHERE uf.usuario_id = p_usuario_id
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

-- ---------------------------------------------------------------------------
-- Oferta de tratos
-- ---------------------------------------------------------------------------

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
BEGIN
  PERFORM set_config('app.current_user_id', p_usuario_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(p_usuario_email, ''), true);

  SELECT EXISTS(
    SELECT 1 FROM usuario_fazenda uf
    WHERE uf.usuario_id = p_usuario_id
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
BEGIN
  PERFORM set_config('app.current_user_id', p_usuario_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(p_usuario_email, ''), true);

  SELECT EXISTS(
    SELECT 1 FROM usuario_fazenda uf
    WHERE uf.usuario_id = p_usuario_id
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

GRANT EXECUTE ON FUNCTION public.editar_registro_leitura_cocho(uuid, uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_registro_leitura_cocho(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.editar_registro_oferta_trato(uuid, uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_registro_oferta_trato(uuid, uuid, uuid, text) TO authenticated;
