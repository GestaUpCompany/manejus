-- ============================================================================
-- Produção de produto final passa a carregar custo real
--
-- Antes: trg_saida_insumos_itens_mov inseria 'producao' com custo_unitario NULL.
-- recalcular_custo_medio_item preserva o WAC quando producao não tem custo,
-- então formulacoes.custo_unitario ficava sempre 0 e o valor em estoque de
-- produtos finais saía zerado no painel.
--
-- Agora: cada linha de saida_insumos_itens gera uma producao cuja quantidade é
-- a participação do insumo na mistura (kg). Atribuir o WAC atual do insumo
-- (insumos.custo_unitario, R$/kg) como custo dessa producao faz a média
-- ponderada das produções resultar no custo/kg real do produto final.
-- NULLIF(..., 0) mantém NULL quando o insumo não tem custo registrado,
-- preservando o comportamento anterior de não diluir o WAC.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_saida_insumos_itens_mov()
RETURNS TRIGGER AS $$
DECLARE
  v_fazenda_id uuid;
  v_data date;
  v_formulacao_id uuid;
  v_controla_estoque boolean;
  v_custo_insumo numeric;
  v_componente record;
BEGIN
  -- Buscar fazenda_id, data e formulacao_id do cabeçalho
  SELECT r.fazenda_id, r.data_producao, r.formulacao_id
  INTO v_fazenda_id, v_data, v_formulacao_id
  FROM public.registros_saida_insumos r
  WHERE r.id = COALESCE(NEW.saida_id, OLD.saida_id);

  IF TG_OP = 'DELETE' THEN
    -- Estorno da baixa do insumo
    PERFORM public.inserir_movimentacao_estoque(
      v_fazenda_id, 'insumo', OLD.insumo_id, 'estorno', OLD.quantidade,
      p_origem := 'saida_insumos', p_registro_origem_id := OLD.id, p_data := v_data
    );
    -- Estorno da produção do produto final (se aplicável)
    IF v_formulacao_id IS NOT NULL THEN
      SELECT f.controla_estoque INTO v_controla_estoque
      FROM public.formulacoes f WHERE f.id = v_formulacao_id;
      IF COALESCE(v_controla_estoque, false) THEN
        PERFORM public.inserir_movimentacao_estoque(
          v_fazenda_id, 'formulacao', v_formulacao_id, 'estorno', OLD.quantidade,
          p_origem := 'saida_insumos', p_registro_origem_id := OLD.id, p_data := v_data
        );
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Estornar item antigo
    PERFORM public.inserir_movimentacao_estoque(
      v_fazenda_id, 'insumo', OLD.insumo_id, 'estorno', OLD.quantidade,
      p_origem := 'saida_insumos', p_registro_origem_id := OLD.id, p_data := v_data
    );
  END IF;

  -- Baixa do insumo
  PERFORM public.inserir_movimentacao_estoque(
    v_fazenda_id, 'insumo', NEW.insumo_id, 'baixa', NEW.quantidade,
    p_origem := 'saida_insumos', p_registro_origem_id := NEW.id, p_data := v_data
  );

  -- Produção do produto final (se controla_estoque = true)
  -- custo_unitario = WAC atual do insumo consumido (R$/kg)
  IF v_formulacao_id IS NOT NULL THEN
    SELECT f.controla_estoque INTO v_controla_estoque
    FROM public.formulacoes f WHERE f.id = v_formulacao_id;
    IF COALESCE(v_controla_estoque, false) THEN
      SELECT NULLIF(i.custo_unitario, 0) INTO v_custo_insumo
      FROM public.insumos i WHERE i.id = NEW.insumo_id;
      PERFORM public.inserir_movimentacao_estoque(
        v_fazenda_id, 'formulacao', v_formulacao_id, 'producao', NEW.quantidade,
        p_custo_unitario := v_custo_insumo,
        p_origem := 'saida_insumos', p_registro_origem_id := NEW.id, p_data := v_data
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
