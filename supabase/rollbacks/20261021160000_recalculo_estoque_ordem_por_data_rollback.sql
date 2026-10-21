-- Rollback de 20261021160000_recalculo_estoque_ordem_por_data.sql: volta a ordenar o replay so por created_at.
-- Itens recalculados enquanto a migration estava ativa mantem o saldo/custo gravados ate o proximo recalculo.

CREATE OR REPLACE FUNCTION public.recalcular_custo_medio_item(p_fazenda_id uuid, p_item_tipo text, p_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_mov RECORD;
  v_saldo numeric := 0;
  v_custo_medio numeric := 0;
  v_valor_entrada numeric;
  v_custo_entrada numeric;
  v_saldo_ant numeric;
BEGIN
  FOR v_mov IN
    SELECT id, tipo_movimentacao, quantidade, custo_unitario, valor_total
    FROM public.movimentacoes_estoque_suplementos
    WHERE fazenda_id = p_fazenda_id
      AND item_tipo = p_item_tipo
      AND item_id = p_item_id
      AND deleted_at IS NULL
    ORDER BY created_at ASC
  LOOP
    IF v_mov.tipo_movimentacao IN ('entrada', 'producao') THEN
      v_valor_entrada := COALESCE(
        v_mov.valor_total,
        v_mov.quantidade * COALESCE(v_mov.custo_unitario, 0)
      );

      IF v_mov.valor_total IS NULL THEN
        v_custo_entrada := COALESCE(v_mov.custo_unitario, 0);
      ELSE
        v_custo_entrada := CASE
          WHEN v_mov.quantidade <> 0 THEN v_mov.valor_total / v_mov.quantidade
          ELSE COALESCE(v_mov.custo_unitario, 0)
        END;
      END IF;

      -- Saldo zerado ou negativo: próxima entrada redefine o custo
      IF v_saldo <= 0 THEN
        v_custo_medio := v_custo_entrada;
      ELSE
        v_custo_medio := ((v_saldo * v_custo_medio) + v_valor_entrada) / (v_saldo + v_mov.quantidade);
      END IF;

      v_saldo := v_saldo + v_mov.quantidade;

    ELSIF v_mov.tipo_movimentacao IN ('baixa', 'consumo') THEN
      v_saldo := v_saldo - v_mov.quantidade;

    ELSIF v_mov.tipo_movimentacao = 'ajuste' THEN
      v_saldo := v_mov.quantidade;
      IF v_mov.custo_unitario IS NOT NULL AND v_mov.custo_unitario > 0 THEN
        v_custo_medio := v_mov.custo_unitario;
      END IF;
    END IF;

    -- Atualiza saldos históricos só quando divergem (replay idempotente vira no-op)
    v_saldo_ant := CASE
      WHEN v_mov.tipo_movimentacao = 'ajuste' THEN v_saldo
      WHEN v_mov.tipo_movimentacao IN ('entrada', 'producao') THEN v_saldo - v_mov.quantidade
      ELSE v_saldo + v_mov.quantidade
    END;

    UPDATE public.movimentacoes_estoque_suplementos
    SET saldo_anterior = v_saldo_ant,
        saldo_posterior = v_saldo
    WHERE id = v_mov.id
      AND fazenda_id = p_fazenda_id
      AND (saldo_anterior IS DISTINCT FROM v_saldo_ant
           OR saldo_posterior IS DISTINCT FROM v_saldo);
  END LOOP;

  -- Persistir no item, somente se saldo ou custo médio mudou, e SÓ na fazenda dona
  IF p_item_tipo = 'insumo' THEN
    UPDATE public.insumos
    SET estoque_atual = v_saldo,
        custo_unitario = ROUND(v_custo_medio, 4),
        updated_at = NOW()
    WHERE id = p_item_id
      AND fazenda_id = p_fazenda_id
      AND (estoque_atual IS DISTINCT FROM v_saldo
           OR custo_unitario IS DISTINCT FROM ROUND(v_custo_medio, 4));
  ELSIF p_item_tipo = 'formulacao' THEN
    UPDATE public.formulacoes
    SET estoque_atual = v_saldo,
        custo_unitario = ROUND(v_custo_medio, 4),
        updated_at = NOW()
    WHERE id = p_item_id
      AND fazenda_id = p_fazenda_id
      AND (estoque_atual IS DISTINCT FROM v_saldo
           OR custo_unitario IS DISTINCT FROM ROUND(v_custo_medio, 4));
  END IF;
END;
$function$;
