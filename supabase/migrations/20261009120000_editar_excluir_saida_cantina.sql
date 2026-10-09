-- RPCs de editar/excluir saída de cantina (registros_alimentacao, modo cantina/marmita).
--
-- O estoque é corrigido pelo trigger trg_alimentacao_mov (20260922190000): em UPDATE de
-- itens_detalhe/modo/deleted_at ele soft-deleta as movimentações antigas do registro e
-- regera as baixas, e trg_update_estoque_cantina recalcula saldo e custo médio.
-- Estas RPCs só validam e gravam; não mexem em movimentacoes_cantina.
--
-- Padrão hardenado (igual a editar_registro_clima): chamador via auth.uid() ->
-- usuarios.auth_id, papel admin/controller em usuario_fazenda, whitelist em p_campos,
-- soft delete. Registros modo 'entrada' ficam de fora (têm tela própria).
--
-- Campos editáveis: data, observacao, itens_detalhe (só modo cantina), fornecedor,
-- quantidade_marmitas, preco_unitario, destinatario (só modo marmita).
-- itens (mapa "Nome (un)" -> quantidade, usado só para exibição) é reconstruído aqui a
-- partir de itens_detalhe, para os dois nunca divergirem.
--
-- Retorno: {registro, saldos_negativos:[{item_id,nome,estoque_atual}]} com os itens
-- controlados cujo saldo ficou negativo após a operação (a UI mostra um aviso).

CREATE OR REPLACE FUNCTION public.editar_registro_saida_cantina(
  p_id uuid,
  p_fazenda_id uuid,
  p_campos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old registros_alimentacao%ROWTYPE;
  v_new registros_alimentacao%ROWTYPE;
  v_filtered jsonb := '{}'::jsonb;
  v_campo text;
  v_campos_cantina text[] := ARRAY['data','observacao','itens_detalhe'];
  v_campos_marmita text[] := ARRAY['data','observacao','fornecedor','quantidade_marmitas','preco_unitario','destinatario'];
  v_permitidos text[];
  v_is_controller boolean;
  v_auth_id uuid; v_auth_email text; v_auth_nome text;
  v_detalhe jsonb;
  v_itens jsonb;
  v_elem jsonb;
  v_cat itens_cantina%ROWTYPE;
  v_item_id uuid;
  v_q numeric;
  v_vistos uuid[] := ARRAY[]::uuid[];
  v_afetados uuid[] := ARRAY[]::uuid[];
  v_negativos jsonb;
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
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem editar saídas de cantina';
  END IF;

  SELECT * INTO v_old
  FROM registros_alimentacao
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
    AND COALESCE(modo, 'cantina') IN ('cantina', 'marmita');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado, já excluído ou não é uma saída de cantina';
  END IF;

  v_permitidos := CASE WHEN COALESCE(v_old.modo, 'cantina') = 'marmita' THEN v_campos_marmita ELSE v_campos_cantina END;

  FOR v_campo IN SELECT jsonb_object_keys(COALESCE(p_campos, '{}'::jsonb)) LOOP
    IF v_campo = ANY(v_permitidos) THEN
      v_filtered := v_filtered || jsonb_build_object(v_campo, p_campos->v_campo);
    END IF;
  END LOOP;

  v_new := jsonb_populate_record(v_old, v_filtered);

  IF v_new.data IS NULL THEN
    RAISE EXCEPTION 'Data é obrigatória';
  END IF;

  IF COALESCE(v_old.modo, 'cantina') = 'marmita' THEN
    IF v_new.fornecedor IS NULL OR btrim(v_new.fornecedor) = '' THEN
      RAISE EXCEPTION 'Fornecedor é obrigatório';
    END IF;
    IF v_new.quantidade_marmitas IS NULL OR v_new.quantidade_marmitas <= 0 THEN
      RAISE EXCEPTION 'Quantidade de marmitas deve ser maior que zero';
    END IF;
    IF v_new.preco_unitario IS NULL OR v_new.preco_unitario < 0 THEN
      RAISE EXCEPTION 'Preço unitário inválido';
    END IF;
    IF v_new.destinatario IS NULL OR btrim(v_new.destinatario) = '' THEN
      RAISE EXCEPTION 'Destinatário é obrigatório';
    END IF;
  ELSIF v_filtered ? 'itens_detalhe' THEN
    v_detalhe := v_new.itens_detalhe;
    IF v_detalhe IS NULL OR jsonb_typeof(v_detalhe) <> 'array' OR jsonb_array_length(v_detalhe) = 0 THEN
      RAISE EXCEPTION 'Informe pelo menos um item';
    END IF;

    v_itens := '{}'::jsonb;
    v_detalhe := '[]'::jsonb;
    FOR v_elem IN SELECT e FROM jsonb_array_elements(v_new.itens_detalhe) e LOOP
      BEGIN
        v_item_id := NULLIF(v_elem->>'itemId', '')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Item inválido na lista';
      END;
      IF v_item_id IS NULL THEN
        RAISE EXCEPTION 'Item sem identificador';
      END IF;
      IF v_item_id = ANY(v_vistos) THEN
        RAISE EXCEPTION 'Item repetido na lista';
      END IF;
      v_vistos := v_vistos || v_item_id;

      SELECT * INTO v_cat FROM itens_cantina
      WHERE id = v_item_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item não encontrado nesta fazenda';
      END IF;

      IF COALESCE(v_elem->>'quantidade', '') !~ '^\d+([.,]\d+)?$' THEN
        RAISE EXCEPTION 'Quantidade inválida para o item %', v_cat.nome;
      END IF;
      v_q := REPLACE(v_elem->>'quantidade', ',', '.')::numeric;
      IF v_q <= 0 THEN
        RAISE EXCEPTION 'Quantidade de % deve ser maior que zero', v_cat.nome;
      END IF;

      v_detalhe := v_detalhe || jsonb_build_array(
        v_elem || jsonb_build_object(
          'itemId', v_item_id,
          'nome', v_cat.nome,
          'unidade_medida', v_cat.unidade_medida,
          'quantidade', v_q::text
        )
      );
      v_itens := v_itens || jsonb_build_object(v_cat.nome || ' (' || v_cat.unidade_medida || ')', v_q::text);
    END LOOP;

    v_new.itens_detalhe := v_detalhe;
    v_new.itens := v_itens;
  END IF;

  UPDATE registros_alimentacao SET
    data = v_new.data,
    observacao = v_new.observacao,
    itens = v_new.itens,
    itens_detalhe = v_new.itens_detalhe,
    fornecedor = v_new.fornecedor,
    quantidade_marmitas = v_new.quantidade_marmitas,
    preco_unitario = v_new.preco_unitario,
    destinatario = v_new.destinatario,
    updated_at = NOW()
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
  RETURNING * INTO v_new;

  -- itens afetados = antigos + novos (o trigger já regerou as movimentações)
  SELECT COALESCE(array_agg(DISTINCT (e->>'itemId')::uuid), ARRAY[]::uuid[]) INTO v_afetados
  FROM jsonb_array_elements(
    COALESCE(v_old.itens_detalhe, '[]'::jsonb) || COALESCE(v_new.itens_detalhe, '[]'::jsonb)
  ) e
  WHERE e->>'itemId' ~ '^[0-9a-fA-F-]{36}$';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('item_id', i.id, 'nome', i.nome, 'estoque_atual', i.estoque_atual)), '[]'::jsonb)
  INTO v_negativos
  FROM itens_cantina i
  WHERE i.id = ANY(v_afetados) AND i.fazenda_id = p_fazenda_id
    AND i.controla_estoque AND i.estoque_atual < 0;

  RETURN jsonb_build_object('registro', to_jsonb(v_new), 'saldos_negativos', v_negativos);
END;
$function$;

CREATE OR REPLACE FUNCTION public.excluir_registro_saida_cantina(
  p_id uuid,
  p_fazenda_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old registros_alimentacao%ROWTYPE;
  v_is_controller boolean;
  v_auth_id uuid; v_auth_email text; v_auth_nome text;
  v_afetados uuid[] := ARRAY[]::uuid[];
  v_negativos jsonb;
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
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem excluir saídas de cantina';
  END IF;

  SELECT * INTO v_old
  FROM registros_alimentacao
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
    AND COALESCE(modo, 'cantina') IN ('cantina', 'marmita');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado, já excluído ou não é uma saída de cantina';
  END IF;

  UPDATE registros_alimentacao
  SET deleted_at = NOW(), updated_at = NOW()
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;

  SELECT COALESCE(array_agg(DISTINCT (e->>'itemId')::uuid), ARRAY[]::uuid[]) INTO v_afetados
  FROM jsonb_array_elements(COALESCE(v_old.itens_detalhe, '[]'::jsonb)) e
  WHERE e->>'itemId' ~ '^[0-9a-fA-F-]{36}$';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('item_id', i.id, 'nome', i.nome, 'estoque_atual', i.estoque_atual)), '[]'::jsonb)
  INTO v_negativos
  FROM itens_cantina i
  WHERE i.id = ANY(v_afetados) AND i.fazenda_id = p_fazenda_id
    AND i.controla_estoque AND i.estoque_atual < 0;

  RETURN jsonb_build_object('success', true, 'id', p_id, 'saldos_negativos', v_negativos);
END;
$function$;

REVOKE ALL ON FUNCTION public.editar_registro_saida_cantina(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.excluir_registro_saida_cantina(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_registro_saida_cantina(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_registro_saida_cantina(uuid, uuid) TO authenticated;
