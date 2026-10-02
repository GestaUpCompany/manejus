-- Exclusão de registro de abastecimento pelo painel (controller/admin).
-- Segue o padrão de excluir_registro_suplementacao: soft-delete com contexto
-- de auditoria e checagem de papel. O ajuste de estoque não é feito aqui:
-- a trigger trg_sync_baixa_abastecimento (AFTER UPDATE) detecta a transição
-- deleted_at null -> set, remove a movimentacao de baixa vinculada e a
-- trigger de saldo recalcula o saldo do tanque automaticamente.

CREATE OR REPLACE FUNCTION public.excluir_registro_abastecimento(
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
  v_is_controller boolean;
BEGIN
  -- Configurar contexto de auditoria
  PERFORM set_config('app.current_user_id', p_usuario_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(p_usuario_email, ''), true);

  -- Verificar permissão: apenas controller+ pode excluir
  SELECT EXISTS(
    SELECT 1 FROM usuario_fazenda uf
    WHERE uf.usuario_id = p_usuario_id
      AND uf.fazenda_id = p_fazenda_id
      AND uf.papel IN ('admin', 'controller')
      AND uf.ativo = true
  ) INTO v_is_controller;

  IF NOT v_is_controller THEN
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem excluir registros de abastecimento';
  END IF;

  -- Soft-delete (trigger de auditoria dispara automaticamente e a
  -- trg_sync_baixa_abastecimento estorna a baixa de estoque vinculada)
  UPDATE registros_abastecimento
  SET deleted_at = NOW(), updated_at = NOW()
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado ou já excluído';
  END IF;

  RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.excluir_registro_abastecimento(uuid, uuid, uuid, text) TO authenticated;
