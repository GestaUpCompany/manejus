-- ============================================================================
-- Ajuste de quantidade: só altera categorias que já existem no lote
-- ============================================================================
-- A criação de categoria pelo ajuste sai do escopo: categorias entram só pelo fluxo normal
-- (cadastro e edição do lote). A RPC passa a recusar categoria inexistente e perde o p_peso_kg,
-- que só servia à criação. A fórmula de calculate_quant_atual não muda.
-- Rollback: supabase/rollbacks/20261030120000_ajuste_quantidade_so_categoria_existente_rollback.sql
-- ============================================================================

DROP FUNCTION IF EXISTS public.ajustar_quantidade_lote_categoria(uuid, uuid, text, integer, text, uuid, text, numeric);

CREATE OR REPLACE FUNCTION public.ajustar_quantidade_lote_categoria(
  p_fazenda_id uuid,
  p_lote_id uuid,
  p_categoria text,
  p_nova_quantidade integer,
  p_observacao text,
  p_usuario_id uuid,
  p_usuario_email text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_is_controller boolean;
  v_lote_nome text;
  v_categoria text := LOWER(TRIM(COALESCE(p_categoria, '')));
  v_antes integer;
  v_delta integer;
  v_agora timestamptz := now();
  v_responsavel text;
  v_mov_id uuid;
  v_depois integer;
BEGIN
  PERFORM set_config('app.current_user_id', p_usuario_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(p_usuario_email, ''), true);

  SELECT EXISTS(
    SELECT 1 FROM usuario_fazenda uf
    WHERE uf.usuario_id = p_usuario_id AND uf.fazenda_id = p_fazenda_id
      AND uf.papel IN ('admin', 'controller') AND uf.ativo = true
  ) INTO v_is_controller;
  IF NOT v_is_controller THEN
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem ajustar quantidades';
  END IF;

  IF v_categoria = '' THEN RAISE EXCEPTION 'Informe a categoria'; END IF;
  IF p_nova_quantidade IS NULL OR p_nova_quantidade < 0 THEN
    RAISE EXCEPTION 'A nova quantidade deve ser zero ou maior';
  END IF;
  IF p_observacao IS NULL OR LENGTH(TRIM(p_observacao)) = 0 THEN
    RAISE EXCEPTION 'Informe o motivo do ajuste';
  END IF;

  SELECT nome INTO v_lote_nome FROM lotes
  WHERE id = p_lote_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote não encontrado nesta fazenda'; END IF;

  -- Só categoria já existente no lote: a criação não faz parte do ajuste.
  IF NOT EXISTS (
    SELECT 1 FROM lote_categorias
    WHERE lote_id = p_lote_id AND LOWER(categoria) = v_categoria AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Categoria % não existe neste lote', v_categoria;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(nome), ''), p_usuario_email) INTO v_responsavel
  FROM usuarios WHERE id = p_usuario_id;

  v_antes := calculate_quant_atual(p_lote_id, v_categoria);
  v_delta := p_nova_quantidade - v_antes;
  IF v_delta = 0 THEN RAISE EXCEPTION 'A quantidade informada já é a atual (%)', v_antes; END IF;

  INSERT INTO registros_movimentacao (
    fazenda_id, data, lote_origem_id, lote_origem, categoria, numero_cabecas,
    motivo_movimentacao, tipo_entrada, tipo_saida, observacao, responsavel, nome_usuario
  ) VALUES (
    p_fazenda_id, v_agora, p_lote_id, v_lote_nome, v_categoria, ABS(v_delta),
    'Ajuste',
    CASE WHEN v_delta > 0 THEN 'Ajuste' END,
    CASE WHEN v_delta < 0 THEN 'Ajuste' END,
    TRIM(p_observacao), v_responsavel, v_responsavel
  ) RETURNING id INTO v_mov_id;

  -- O trigger de INSERT já recalcula; a releitura confirma o resultado e blinda contra divergência.
  v_depois := calculate_quant_atual(p_lote_id, v_categoria);
  UPDATE lote_categorias SET quant_atual = v_depois
  WHERE lote_id = p_lote_id AND LOWER(categoria) = v_categoria AND ativo = true;

  IF v_depois <> p_nova_quantidade THEN
    RAISE EXCEPTION 'Ajuste não refletiu na quantidade (esperado %, obtido %)', p_nova_quantidade, v_depois;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'movimentacao_id', v_mov_id, 'categoria', v_categoria,
    'quantidade_anterior', v_antes, 'quantidade_atual', v_depois, 'delta', v_delta
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ajustar_quantidade_lote_categoria(uuid, uuid, text, integer, text, uuid, text) TO authenticated;
