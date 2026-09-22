-- ============================================================================
-- Ajuste de saldo com custo unitário opcional.
-- Sem custo informado (NULL): comportamento anterior, custo médio não muda.
-- Com custo informado: o custo médio do item passa a ser o valor informado
-- (o saldo resultante do ajuste é valorado a esse preço). Vale para UPDATEs
-- retroativos: recalcular_custo_medio_item aplica a mesma regra no replay,
-- então UPDATE custo_unitario em ajustes antigos revaloriza o estoque.
-- Baseado na versão de 20260923000000 (auditoria), mantendo a regravação da
-- cadeia de saldos e a guarda anti-recursão.
-- ============================================================================

-- ==================== Recalc WAC: ajuste com custo redefine custo médio ====================
CREATE OR REPLACE FUNCTION public.recalcular_custo_medio_item(
  p_item_tipo text,
  p_item_id uuid,
  p_fazenda_id uuid
) RETURNS void AS $$
DECLARE
  v_saldo numeric(12,3) := 0;
  v_saldo_ant numeric(12,3);
  v_custo_medio numeric(12,4) := 0;
  v_mov record;
BEGIN
  FOR v_mov IN
    SELECT id, tipo_movimentacao, quantidade, custo_unitario
    FROM public.movimentacoes_estoque_suplementos
    WHERE item_tipo = p_item_tipo
      AND item_id = p_item_id
      AND fazenda_id = p_fazenda_id
      AND deleted_at IS NULL
    ORDER BY created_at ASC, data ASC
  LOOP
    v_saldo_ant := v_saldo;

    IF v_mov.tipo_movimentacao IN ('entrada', 'producao') THEN
      -- Para producao sem custo_unitario (NULL), preservar WAC atual (não diluir com 0)
      IF v_mov.custo_unitario IS NULL AND v_mov.tipo_movimentacao = 'producao' THEN
        -- custo_medio não muda
        v_saldo := v_saldo + v_mov.quantidade;
      ELSIF v_saldo = 0 THEN
        v_custo_medio := COALESCE(v_mov.custo_unitario, 0);
        v_saldo := v_saldo + v_mov.quantidade;
      ELSE
        v_custo_medio := ROUND(
          (v_saldo * v_custo_medio + v_mov.quantidade * COALESCE(v_mov.custo_unitario, 0))
          / (v_saldo + v_mov.quantidade),
          4
        );
        v_saldo := v_saldo + v_mov.quantidade;
      END IF;
    ELSIF v_mov.tipo_movimentacao IN ('baixa', 'consumo', 'estorno') THEN
      v_saldo := v_saldo - v_mov.quantidade;
      -- custo_medio não muda em baixas/consumos/estornos
    ELSIF v_mov.tipo_movimentacao = 'ajuste' THEN
      v_saldo := v_mov.quantidade;
      -- ajuste com custo informado redefine o custo médio do saldo resultante;
      -- sem custo (NULL), mantém o custo médio corrente
      IF v_mov.custo_unitario IS NOT NULL THEN
        v_custo_medio := v_mov.custo_unitario;
      END IF;
    END IF;

    UPDATE public.movimentacoes_estoque_suplementos m
    SET saldo_anterior = v_saldo_ant,
        saldo_posterior = v_saldo
    WHERE m.id = v_mov.id
      AND (m.saldo_anterior IS DISTINCT FROM v_saldo_ant
           OR m.saldo_posterior IS DISTINCT FROM v_saldo);
  END LOOP;

  -- Atualizar tabela alvo conforme item_tipo
  -- Nota: insumos.custo_total_estoque é GENERATED ALWAYS (estoque_atual * custo_unitario),
  -- então não deve ser atualizado diretamente. formulacoes.custo_total_estoque é coluna normal.
  IF p_item_tipo = 'insumo' THEN
    UPDATE public.insumos
    SET estoque_atual = v_saldo,
        custo_unitario = v_custo_medio
    WHERE id = p_item_id;
  ELSIF p_item_tipo = 'formulacao' THEN
    UPDATE public.formulacoes
    SET estoque_atual = v_saldo,
        custo_unitario = v_custo_medio,
        custo_total_estoque = ROUND(v_saldo * v_custo_medio, 2)
    WHERE id = p_item_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ==================== Trigger principal ====================
CREATE OR REPLACE FUNCTION public.update_estoque_suplemento()
RETURNS TRIGGER AS $$
DECLARE
  v_saldo_atual numeric(12,3);
  v_custo_medio_atual numeric(12,4);
  v_novo_saldo numeric(12,3);
  v_novo_custo_medio numeric(12,4);
  v_item_tipo text;
  v_item_id uuid;
  v_fazenda_id uuid;
BEGIN
  v_item_tipo := COALESCE(NEW.item_tipo, OLD.item_tipo);
  v_item_id := COALESCE(NEW.item_id, OLD.item_id);
  v_fazenda_id := COALESCE(NEW.fazenda_id, OLD.fazenda_id);

  IF (TG_OP = 'DELETE') THEN
    -- Recalcular do zero após remoção
    PERFORM public.recalcular_custo_medio_item(v_item_tipo, v_item_id, v_fazenda_id);
    RETURN OLD;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    -- Somente colunas de auditoria/observação mudaram: nada a recalcular
    IF OLD.quantidade IS NOT DISTINCT FROM NEW.quantidade
       AND OLD.tipo_movimentacao IS NOT DISTINCT FROM NEW.tipo_movimentacao
       AND OLD.item_tipo IS NOT DISTINCT FROM NEW.item_tipo
       AND OLD.item_id IS NOT DISTINCT FROM NEW.item_id
       AND OLD.fazenda_id IS NOT DISTINCT FROM NEW.fazenda_id
       AND OLD.custo_unitario IS NOT DISTINCT FROM NEW.custo_unitario
       AND OLD.data IS NOT DISTINCT FROM NEW.data
       AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at
    THEN
      RETURN NEW;
    END IF;

    -- Recalcular do zero (simples e seguro para WAC)
    PERFORM public.recalcular_custo_medio_item(NEW.item_tipo, NEW.item_id, NEW.fazenda_id);
    -- Se mudou de item, recalcular o antigo também
    IF OLD.item_id IS DISTINCT FROM NEW.item_id OR OLD.item_tipo IS DISTINCT FROM NEW.item_tipo THEN
      PERFORM public.recalcular_custo_medio_item(OLD.item_tipo, OLD.item_id, OLD.fazenda_id);
    END IF;
    RETURN NEW;
  END IF;

  -- TG_OP = 'INSERT': atualização incremental
  -- Buscar estado atual do item com lock para evitar race
  IF NEW.item_tipo = 'insumo' THEN
    SELECT COALESCE(estoque_atual, 0), COALESCE(custo_unitario, 0)
    INTO v_saldo_atual, v_custo_medio_atual
    FROM public.insumos
    WHERE id = NEW.item_id
    FOR UPDATE;
  ELSIF NEW.item_tipo = 'formulacao' THEN
    SELECT COALESCE(estoque_atual, 0), COALESCE(custo_unitario, 0)
    INTO v_saldo_atual, v_custo_medio_atual
    FROM public.formulacoes
    WHERE id = NEW.item_id
    FOR UPDATE;
  END IF;

  IF NEW.tipo_movimentacao IN ('entrada', 'producao') THEN
    -- WAC: (saldo_atual * custo_medio + entrada * preco) / (saldo_atual + entrada)
    -- Para producao sem custo_unitario (NULL), preservar WAC atual (não diluir com 0)
    IF NEW.custo_unitario IS NULL AND NEW.tipo_movimentacao = 'producao' THEN
      v_novo_custo_medio := v_custo_medio_atual;
      v_novo_saldo := v_saldo_atual + NEW.quantidade;
    ELSIF v_saldo_atual = 0 THEN
      v_novo_custo_medio := COALESCE(NEW.custo_unitario, 0);
      v_novo_saldo := v_saldo_atual + NEW.quantidade;
    ELSE
      v_novo_custo_medio := ROUND(
        (v_saldo_atual * v_custo_medio_atual + NEW.quantidade * COALESCE(NEW.custo_unitario, 0))
        / (v_saldo_atual + NEW.quantidade),
        4
      );
      v_novo_saldo := v_saldo_atual + NEW.quantidade;
    END IF;

    IF NEW.item_tipo = 'insumo' THEN
      UPDATE public.insumos
      SET estoque_atual = v_novo_saldo,
          custo_unitario = v_novo_custo_medio
      WHERE id = NEW.item_id;
    ELSIF NEW.item_tipo = 'formulacao' THEN
      UPDATE public.formulacoes
      SET estoque_atual = v_novo_saldo,
          custo_unitario = v_novo_custo_medio,
          custo_total_estoque = ROUND(v_novo_saldo * v_novo_custo_medio, 2)
      WHERE id = NEW.item_id;
    END IF;
  ELSIF NEW.tipo_movimentacao IN ('baixa', 'consumo', 'estorno') THEN
    v_novo_saldo := v_saldo_atual - NEW.quantidade;
    -- custo_medio não muda em baixas/consumos/estornos

    IF NEW.item_tipo = 'insumo' THEN
      UPDATE public.insumos
      SET estoque_atual = v_novo_saldo
      WHERE id = NEW.item_id;
    ELSIF NEW.item_tipo = 'formulacao' THEN
      UPDATE public.formulacoes
      SET estoque_atual = v_novo_saldo,
          custo_total_estoque = ROUND(v_novo_saldo * v_custo_medio_atual, 2)
      WHERE id = NEW.item_id;
    END IF;
  ELSIF NEW.tipo_movimentacao = 'ajuste' THEN
    -- Ajuste define saldo absoluto. Com custo_unitario informado, redefine o
    -- custo médio do saldo resultante; sem custo (NULL), mantém o atual.
    v_novo_custo_medio := COALESCE(NEW.custo_unitario, v_custo_medio_atual);
    IF NEW.item_tipo = 'insumo' THEN
      UPDATE public.insumos
      SET estoque_atual = NEW.quantidade,
          custo_unitario = v_novo_custo_medio
      WHERE id = NEW.item_id;
    ELSIF NEW.item_tipo = 'formulacao' THEN
      UPDATE public.formulacoes
      SET estoque_atual = NEW.quantidade,
          custo_unitario = v_novo_custo_medio,
          custo_total_estoque = ROUND(NEW.quantidade * v_novo_custo_medio, 2)
      WHERE id = NEW.item_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
