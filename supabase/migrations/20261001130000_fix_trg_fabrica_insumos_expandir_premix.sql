-- A função expandir_insumo(uuid, numeric) foi renomeada para
-- expandir_premix_componentes(uuid, numeric, integer), mas o corpo do trigger
-- trg_fabrica_confinamento_insumos_mov ficou chamando o nome antigo.
-- Resultado: todo INSERT em registros_fabrica_confinamento_insumos falhava com
-- 42883 (function does not exist) e nenhuma baixa de estoque era gerada.
-- A assinatura de retorno é a mesma (insumo_id uuid, quantidade numeric).

CREATE OR REPLACE FUNCTION public.trg_fabrica_confinamento_insumos_mov()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_fazenda_id uuid;
  v_data date;
  v_kg_total numeric;
  v_componente record;
  v_keep uuid[] := '{}';
BEGIN
  SELECT r.fazenda_id, r.data
  INTO v_fazenda_id, v_data
  FROM public.registros_fabrica_confinamento r
  WHERE r.id = COALESCE(NEW.registro_id, OLD.registro_id);

  IF v_fazenda_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE public.movimentacoes_estoque_suplementos
    SET deleted_at = NOW()
    WHERE registro_origem_id = OLD.id AND deleted_at IS NULL;
    RETURN OLD;
  END IF;

  -- Retry de upsert idêntico: no-op
  IF TG_OP = 'UPDATE'
     AND OLD.registro_id IS NOT DISTINCT FROM NEW.registro_id
     AND OLD.insumo_id IS NOT DISTINCT FROM NEW.insumo_id
     AND OLD.kg_produzido IS NOT DISTINCT FROM NEW.kg_produzido
     AND OLD.kg_previsto IS NOT DISTINCT FROM NEW.kg_previsto THEN
    RETURN NEW;
  END IF;

  v_kg_total := COALESCE(NEW.kg_produzido, NEW.kg_previsto, 0);

  FOR v_componente IN
    SELECT * FROM public.expandir_premix_componentes(NEW.insumo_id, v_kg_total)
  LOOP
    UPDATE public.movimentacoes_estoque_suplementos
    SET quantidade = v_componente.quantidade,
        data = v_data,
        deleted_at = NULL
    WHERE registro_origem_id = NEW.id
      AND item_tipo = 'insumo'
      AND item_id = v_componente.insumo_id
      AND tipo_movimentacao = 'baixa';

    IF NOT FOUND THEN
      PERFORM public.inserir_movimentacao_estoque(
        v_fazenda_id,
        'insumo',
        v_componente.insumo_id,
        'baixa',
        v_componente.quantidade,
        p_origem := 'fabrica_confinamento',
        p_registro_origem_id := NEW.id,
        p_data := v_data
      );
    END IF;

    v_keep := v_keep || v_componente.insumo_id;
  END LOOP;

  -- Componentes que saíram da expansão
  UPDATE public.movimentacoes_estoque_suplementos
  SET deleted_at = NOW()
  WHERE registro_origem_id = NEW.id
    AND deleted_at IS NULL
    AND (item_tipo <> 'insumo' OR NOT (item_id = ANY(v_keep)));

  RETURN NEW;
END;
$function$;
