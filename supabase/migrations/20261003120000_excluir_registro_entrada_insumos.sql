-- Exclusão de entrada de insumos pelo painel (controller/admin).
-- Segue o padrão de excluir_registro_abastecimento: soft-delete do cabeçalho
-- com contexto de auditoria e checagem de papel. Os itens não têm deleted_at,
-- então são removidos fisicamente; a trg_entrada_insumos_itens_mov (TG_OP =
-- 'DELETE') soft-deleta as movimentações espelhadas e update_estoque_suplemento
-- recalcula saldo e custo médio de cada item afetado.
--
-- Também endurece trg_entrada_insumos_itens_mov com guard `r.deleted_at IS
-- NULL`: sem isso, um re-sync tardio do PWA (upsert por local_id) recriaria o
-- item e a movimentação de uma entrada já excluída.

CREATE OR REPLACE FUNCTION public.excluir_registro_entrada_insumos(
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
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem excluir registros de entrada de insumos';
  END IF;

  -- Soft-delete do cabeçalho (trigger de auditoria dispara automaticamente)
  UPDATE registros_entrada_insumos
  SET deleted_at = NOW(), updated_at = NOW()
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado ou já excluído';
  END IF;

  -- Remover itens: o DELETE dispara trg_entrada_insumos_itens_mov, que
  -- soft-deleta as movimentações espelhadas e recalcula saldo/WAC
  DELETE FROM entrada_insumos_itens WHERE entrada_id = p_id;

  RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.excluir_registro_entrada_insumos(uuid, uuid, uuid, text) TO authenticated;

-- Guard: não espelhar item cujo cabeçalho está soft-deletado (re-sync tardio)
CREATE OR REPLACE FUNCTION public.trg_entrada_insumos_itens_mov()
RETURNS TRIGGER AS $$
DECLARE
  v_fazenda_id uuid;
  v_data date;
  v_item_tipo text;
  v_item_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.movimentacoes_estoque_suplementos
    SET deleted_at = NOW()
    WHERE registro_origem_id = OLD.id AND deleted_at IS NULL;
    RETURN OLD;
  END IF;

  SELECT r.fazenda_id, r.data_entrada
  INTO v_fazenda_id, v_data
  FROM public.registros_entrada_insumos r
  WHERE r.id = NEW.entrada_id
    AND r.deleted_at IS NULL;

  IF v_fazenda_id IS NULL THEN
    -- Cabeçalho ainda não sincronizado ou excluído; nada a espelhar
    RETURN NEW;
  END IF;

  -- Retry de upsert idêntico: no-op
  IF TG_OP = 'UPDATE'
     AND OLD.entrada_id IS NOT DISTINCT FROM NEW.entrada_id
     AND OLD.insumo_id IS NOT DISTINCT FROM NEW.insumo_id
     AND OLD.formulacao_id IS NOT DISTINCT FROM NEW.formulacao_id
     AND OLD.quantidade IS NOT DISTINCT FROM NEW.quantidade
     AND OLD.valor_unitario IS NOT DISTINCT FROM NEW.valor_unitario
     AND OLD.valor_total IS NOT DISTINCT FROM NEW.valor_total THEN
    RETURN NEW;
  END IF;

  IF NEW.insumo_id IS NOT NULL THEN
    v_item_tipo := 'insumo';
    v_item_id := NEW.insumo_id;
  ELSIF NEW.formulacao_id IS NOT NULL THEN
    v_item_tipo := 'formulacao';
    v_item_id := NEW.formulacao_id;
  END IF;

  -- Alvo mudou ou ficou nulo: remover movimentações que não espelham o item
  UPDATE public.movimentacoes_estoque_suplementos
  SET deleted_at = NOW()
  WHERE registro_origem_id = NEW.id
    AND deleted_at IS NULL
    AND (item_tipo IS DISTINCT FROM v_item_tipo OR item_id IS DISTINCT FROM v_item_id);

  IF v_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Espelha valores na movimentação existente (reaviva se estava deletada)
  UPDATE public.movimentacoes_estoque_suplementos
  SET quantidade = NEW.quantidade,
      custo_unitario = NEW.valor_unitario,
      valor_total = NEW.valor_total,
      data = v_data,
      deleted_at = NULL
  WHERE registro_origem_id = NEW.id
    AND item_tipo = v_item_tipo
    AND item_id = v_item_id
    AND tipo_movimentacao = 'entrada';

  IF NOT FOUND THEN
    PERFORM public.inserir_movimentacao_estoque(
      v_fazenda_id,
      v_item_tipo,
      v_item_id,
      'entrada',
      NEW.quantidade,
      p_custo_unitario := NEW.valor_unitario,
      p_valor_total := NEW.valor_total,
      p_origem := 'entrada_insumos',
      p_registro_origem_id := NEW.id,
      p_data := v_data
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public';
