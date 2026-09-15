-- ============================================================================
-- MIGRAÇÃO E - Triggers de movimentação de estoque
-- Triggers nas tabelas de itens (não no cabeçalho) para garantir que os itens
-- já existem quando o trigger dispara. Cada trigger insere movimentações em
-- movimentacoes_estoque_suplementos, que por sua vez dispara o trigger WAC.
-- ============================================================================

-- ==================== FUNÇÃO: expandir premix em componentes atômicos ====================
-- Se o insumo é premix gerado (tem formulacao_origem_id), expande nos componentes
-- da formulação de origem recursivamente (limite 3 níveis).
-- Se o insumo é normal ou premix comprado pronto (sem formulacao_origem_id),
-- retorna o próprio insumo com a quantidade original.
CREATE OR REPLACE FUNCTION public.expandir_premix_componentes(
  p_insumo_id uuid,
  p_quantidade numeric,
  p_profundidade int DEFAULT 0
) RETURNS TABLE (insumo_id uuid, quantidade numeric) AS $$
DECLARE
  v_formulacao_origem_id uuid;
  v_componente record;
  v_qtd_ms numeric;
  v_qtd_mn numeric;
  v_teor_ms numeric;
  v_sub_result record;
BEGIN
  -- Limite de recursão para evitar loops infinitos
  IF p_profundidade > 3 THEN
    RETURN NEXT;
    RETURN;
  END IF;

  -- Verificar se o insumo é premix gerado
  SELECT i.formulacao_origem_id
  INTO v_formulacao_origem_id
  FROM public.insumos i
  WHERE i.id = p_insumo_id;

  IF v_formulacao_origem_id IS NULL THEN
    -- Insumo normal ou premix comprado pronto: retornar como está
    RETURN QUERY SELECT p_insumo_id, p_quantidade;
    RETURN;
  END IF;

  -- Premix gerado: expandir nos componentes da formulação de origem
  FOR v_componente IN
    SELECT fi.insumo_id, fi.formula_teor_ms, COALESCE(i.teor_ms, 0) AS teor_ms
    FROM public.formulacao_insumos fi
    JOIN public.insumos i ON i.id = fi.insumo_id
    WHERE fi.formulacao_id = v_formulacao_origem_id
  LOOP
    -- Quantidade de MS do componente = Q * (participacao / 100)
    v_qtd_ms := p_quantidade * (COALESCE(v_componente.formula_teor_ms, 0) / 100.0);

    -- Converter MS -> MN: Q_mn = Q_ms / (teor_ms / 100)
    -- Se teor_ms for 0 ou null, usar Q_ms diretamente (assumir participação direta em MN)
    IF COALESCE(v_componente.teor_ms, 0) > 0 THEN
      v_qtd_mn := v_qtd_ms / (v_componente.teor_ms / 100.0);
    ELSE
      v_qtd_mn := v_qtd_ms;
    END IF;

    -- Recursão: se o componente também é premix gerado, expandir
    FOR v_sub_result IN
      SELECT * FROM public.expandir_premix_componentes(
        v_componente.insumo_id,
        v_qtd_mn,
        p_profundidade + 1
      )
    LOOP
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.expandir_premix_componentes IS
  'Expande premix gerado (insumo com formulacao_origem_id) nos componentes atômicos recursivamente. Limite 3 níveis.';

-- ==================== FUNÇÃO HELPER: inserir movimentação idempotente ====================
-- Insere movimentação com ON CONFLICT DO NOTHING para idempotência do sync.
CREATE OR REPLACE FUNCTION public.inserir_movimentacao_estoque(
  p_fazenda_id uuid,
  p_item_tipo text,
  p_item_id uuid,
  p_tipo_movimentacao text,
  p_quantidade numeric,
  p_custo_unitario numeric DEFAULT NULL,
  p_valor_total numeric DEFAULT NULL,
  p_origem text DEFAULT NULL,
  p_registro_origem_id uuid DEFAULT NULL,
  p_data date DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_local_id text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO public.movimentacoes_estoque_suplementos (
    fazenda_id, item_tipo, item_id, tipo_movimentacao, quantidade,
    custo_unitario, valor_total, origem, registro_origem_id, data,
    observacao, local_id
  ) VALUES (
    p_fazenda_id, p_item_tipo, p_item_id, p_tipo_movimentacao, p_quantidade,
    p_custo_unitario, p_valor_total, p_origem, p_registro_origem_id, p_data,
    p_observacao, p_local_id
  )
  ON CONFLICT (registro_origem_id, item_tipo, item_id, tipo_movimentacao) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ==================== TRIGGER: entrada_insumos_itens -> entrada ====================
CREATE OR REPLACE FUNCTION public.trg_entrada_insumos_itens_mov()
RETURNS TRIGGER AS $$
DECLARE
  v_fazenda_id uuid;
  v_data date;
  v_item_tipo text;
  v_item_id uuid;
BEGIN
  -- Buscar fazenda_id e data do cabeçalho
  SELECT r.fazenda_id, r.data_entrada
  INTO v_fazenda_id, v_data
  FROM public.registros_entrada_insumos r
  WHERE r.id = COALESCE(NEW.entrada_id, OLD.entrada_id);

  IF TG_OP = 'DELETE' THEN
    -- Estorno: inserir movimentação de estorno
    IF OLD.insumo_id IS NOT NULL THEN
      PERFORM public.inserir_movimentacao_estoque(
        v_fazenda_id, 'insumo', OLD.insumo_id, 'estorno', OLD.quantidade,
        p_origem := 'entrada_insumos', p_registro_origem_id := OLD.id, p_data := v_data
      );
    ELSIF OLD.formulacao_id IS NOT NULL THEN
      PERFORM public.inserir_movimentacao_estoque(
        v_fazenda_id, 'formulacao', OLD.formulacao_id, 'estorno', OLD.quantidade,
        p_origem := 'entrada_insumos', p_registro_origem_id := OLD.id, p_data := v_data
      );
    END IF;
    RETURN OLD;
  END IF;

  -- Determinar tipo e id do item
  IF NEW.insumo_id IS NOT NULL THEN
    v_item_tipo := 'insumo';
    v_item_id := NEW.insumo_id;
  ELSIF NEW.formulacao_id IS NOT NULL THEN
    v_item_tipo := 'formulacao';
    v_item_id := NEW.formulacao_id;
  ELSE
    RETURN NEW; -- sem item alvo, nada a fazer
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Estornar o item antigo e inserir o novo
    IF OLD.insumo_id IS NOT NULL THEN
      PERFORM public.inserir_movimentacao_estoque(
        v_fazenda_id, 'insumo', OLD.insumo_id, 'estorno', OLD.quantidade,
        p_origem := 'entrada_insumos', p_registro_origem_id := OLD.id, p_data := v_data
      );
    ELSIF OLD.formulacao_id IS NOT NULL THEN
      PERFORM public.inserir_movimentacao_estoque(
        v_fazenda_id, 'formulacao', OLD.formulacao_id, 'estorno', OLD.quantidade,
        p_origem := 'entrada_insumos', p_registro_origem_id := OLD.id, p_data := v_data
      );
    END IF;
  END IF;

  -- Inserir movimentação de entrada
  PERFORM public.inserir_movimentacao_estoque(
    v_fazenda_id, v_item_tipo, v_item_id, 'entrada', NEW.quantidade,
    p_custo_unitario := NEW.valor_unitario,
    p_valor_total := NEW.valor_total,
    p_origem := 'entrada_insumos',
    p_registro_origem_id := NEW.id,
    p_data := v_data
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_entrada_insumos_itens_mov ON public.entrada_insumos_itens;
CREATE TRIGGER trg_entrada_insumos_itens_mov
  AFTER INSERT OR UPDATE OR DELETE ON public.entrada_insumos_itens
  FOR EACH ROW EXECUTE FUNCTION public.trg_entrada_insumos_itens_mov();

-- ==================== TRIGGER: saida_insumos_itens -> baixa + producao ====================
CREATE OR REPLACE FUNCTION public.trg_saida_insumos_itens_mov()
RETURNS TRIGGER AS $$
DECLARE
  v_fazenda_id uuid;
  v_data date;
  v_formulacao_id uuid;
  v_controla_estoque boolean;
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
  IF v_formulacao_id IS NOT NULL THEN
    SELECT f.controla_estoque INTO v_controla_estoque
    FROM public.formulacoes f WHERE f.id = v_formulacao_id;
    IF COALESCE(v_controla_estoque, false) THEN
      PERFORM public.inserir_movimentacao_estoque(
        v_fazenda_id, 'formulacao', v_formulacao_id, 'producao', NEW.quantidade,
        p_origem := 'saida_insumos', p_registro_origem_id := NEW.id, p_data := v_data
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_saida_insumos_itens_mov ON public.saida_insumos_itens;
CREATE TRIGGER trg_saida_insumos_itens_mov
  AFTER INSERT OR UPDATE OR DELETE ON public.saida_insumos_itens
  FOR EACH ROW EXECUTE FUNCTION public.trg_saida_insumos_itens_mov();

-- ==================== TRIGGER: fabrica_confinamento_insumos -> baixa (com expansão de premix) ====================
CREATE OR REPLACE FUNCTION public.trg_fabrica_confinamento_insumos_mov()
RETURNS TRIGGER AS $$
DECLARE
  v_fazenda_id uuid;
  v_data date;
  v_componente record;
  v_kg_produzido numeric;
BEGIN
  -- Buscar fazenda_id e data do cabeçalho
  SELECT r.fazenda_id, r.data::date
  INTO v_fazenda_id, v_data
  FROM public.registros_fabrica_confinamento r
  WHERE r.id = COALESCE(NEW.registro_id, OLD.registro_id);

  IF TG_OP = 'DELETE' THEN
    -- Estorno: para cada componente expandido do insumo antigo
    FOR v_componente IN
      SELECT * FROM public.expandir_premix_componentes(OLD.insumo_id, OLD.kg_produzido)
    LOOP
      PERFORM public.inserir_movimentacao_estoque(
        v_fazenda_id, 'insumo', v_componente.insumo_id, 'estorno', v_componente.quantidade,
        p_origem := 'fabrica_confinamento', p_registro_origem_id := OLD.id, p_data := v_data
      );
    END LOOP;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Estornar componentes antigos
    FOR v_componente IN
      SELECT * FROM public.expandir_premix_componentes(OLD.insumo_id, OLD.kg_produzido)
    LOOP
      PERFORM public.inserir_movimentacao_estoque(
        v_fazenda_id, 'insumo', v_componente.insumo_id, 'estorno', v_componente.quantidade,
        p_origem := 'fabrica_confinamento', p_registro_origem_id := OLD.id, p_data := v_data
      );
    END LOOP;
  END IF;

  -- Baixa: expandir premix e descontar componentes atômicos
  v_kg_produzido := COALESCE(NEW.kg_produzido, NEW.kg_previsto, 0);
  FOR v_componente IN
    SELECT * FROM public.expandir_premix_componentes(NEW.insumo_id, v_kg_produzido)
  LOOP
    PERFORM public.inserir_movimentacao_estoque(
      v_fazenda_id, 'insumo', v_componente.insumo_id, 'baixa', v_componente.quantidade,
      p_origem := 'fabrica_confinamento', p_registro_origem_id := NEW.id, p_data := v_data
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fabrica_confinamento_insumos_mov ON public.registros_fabrica_confinamento_insumos;
CREATE TRIGGER trg_fabrica_confinamento_insumos_mov
  AFTER INSERT OR UPDATE OR DELETE ON public.registros_fabrica_confinamento_insumos
  FOR EACH ROW EXECUTE FUNCTION public.trg_fabrica_confinamento_insumos_mov();

-- ==================== TRIGGER: suplementacao -> consumo (condicional) ====================
CREATE OR REPLACE FUNCTION public.trg_suplementacao_mov()
RETURNS TRIGGER AS $$
DECLARE
  v_controla_estoque boolean;
  v_qtd_consumo numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.formulacao_id IS NOT NULL THEN
      SELECT f.controla_estoque INTO v_controla_estoque
      FROM public.formulacoes f WHERE f.id = OLD.formulacao_id;
      IF COALESCE(v_controla_estoque, false) THEN
        v_qtd_consumo := COALESCE(OLD.kg_cocho, 0) + COALESCE(OLD.kg_deposito, 0);
        PERFORM public.inserir_movimentacao_estoque(
          OLD.fazenda_id, 'formulacao', OLD.formulacao_id, 'estorno', v_qtd_consumo,
          p_origem := 'suplementacao', p_registro_origem_id := OLD.id, p_data := OLD.data::date
        );
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.formulacao_id IS NOT NULL THEN
    SELECT f.controla_estoque INTO v_controla_estoque
    FROM public.formulacoes f WHERE f.id = NEW.formulacao_id;
    IF COALESCE(v_controla_estoque, false) THEN
      v_qtd_consumo := COALESCE(NEW.kg_cocho, 0) + COALESCE(NEW.kg_deposito, 0);

      IF TG_OP = 'UPDATE' THEN
        -- Se valores de consumo e formulação não mudaram (UPDATE de outro trigger),
        -- não criar estorno nem novo consumo (idempotência)
        IF OLD.formulacao_id = NEW.formulacao_id
           AND (COALESCE(OLD.kg_cocho, 0) + COALESCE(OLD.kg_deposito, 0))
            = (COALESCE(NEW.kg_cocho, 0) + COALESCE(NEW.kg_deposito, 0)) THEN
          RETURN NEW;
        END IF;
        -- Estornar consumo antigo primeiro
        IF OLD.formulacao_id IS NOT NULL AND OLD.formulacao_id = NEW.formulacao_id THEN
          PERFORM public.inserir_movimentacao_estoque(
            NEW.fazenda_id, 'formulacao', NEW.formulacao_id, 'estorno',
            COALESCE(OLD.kg_cocho, 0) + COALESCE(OLD.kg_deposito, 0),
            p_origem := 'suplementacao', p_registro_origem_id := OLD.id, p_data := OLD.data::date
          );
        END IF;
      END IF;

      -- Inserir consumo
      PERFORM public.inserir_movimentacao_estoque(
        NEW.fazenda_id, 'formulacao', NEW.formulacao_id, 'consumo', v_qtd_consumo,
        p_origem := 'suplementacao', p_registro_origem_id := NEW.id, p_data := NEW.data::date
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_suplementacao_mov ON public.registros_suplementacao;
CREATE TRIGGER trg_suplementacao_mov
  AFTER INSERT OR UPDATE OR DELETE ON public.registros_suplementacao
  FOR EACH ROW EXECUTE FUNCTION public.trg_suplementacao_mov();
