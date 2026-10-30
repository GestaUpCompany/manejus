-- Reverte a 20261030120000: volta a RPC com criação de categoria e p_peso_kg (versão de 20261030110000).
DROP FUNCTION IF EXISTS public.ajustar_quantidade_lote_categoria(uuid, uuid, text, integer, text, uuid, text);

CREATE OR REPLACE FUNCTION public.ajustar_quantidade_lote_categoria(
  p_fazenda_id uuid,
  p_lote_id uuid,
  p_categoria text,
  p_nova_quantidade integer,
  p_observacao text,
  p_usuario_id uuid,
  p_usuario_email text,
  p_peso_kg numeric DEFAULT NULL
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
  v_lc lote_categorias%ROWTYPE;
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

  SELECT COALESCE(NULLIF(TRIM(nome), ''), p_usuario_email) INTO v_responsavel
  FROM usuarios WHERE id = p_usuario_id;

  SELECT * INTO v_lc FROM lote_categorias
  WHERE lote_id = p_lote_id AND LOWER(categoria) = v_categoria AND ativo = true
  LIMIT 1;

  IF FOUND THEN
    v_antes := calculate_quant_atual(p_lote_id, v_categoria);
    v_delta := p_nova_quantidade - v_antes;
    IF v_delta = 0 THEN RAISE EXCEPTION 'A quantidade informada já é a atual (%)', v_antes; END IF;
  ELSE
    IF p_nova_quantidade = 0 THEN RAISE EXCEPTION 'Categoria % não existe neste lote', v_categoria; END IF;
    v_antes := 0;
    v_delta := p_nova_quantidade;
    INSERT INTO lote_categorias (
      lote_id, categoria, quant_inicial, quant_base, quant_atual,
      data_pesagem, data_ajuste_peso, peso_entrada_kg_cab, peso_vivo_atual_kg_cab, ativo, created_at
    ) VALUES (
      p_lote_id, v_categoria, p_nova_quantidade, 0, p_nova_quantidade,
      (v_agora)::date, (v_agora)::date, p_peso_kg, p_peso_kg, true, v_agora
    );
  END IF;

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

GRANT EXECUTE ON FUNCTION public.ajustar_quantidade_lote_categoria(uuid, uuid, text, integer, text, uuid, text, numeric) TO authenticated;
