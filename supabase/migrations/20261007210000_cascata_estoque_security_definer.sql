-- ============================================================================
-- Cascata de estoque de suplementação: triggers SECURITY DEFINER + escopo por tenant
-- ============================================================================
-- Contexto: inserts do PWA em saida_insumos_itens estouravam statement_timeout
-- (57014, 8s da role authenticated). Medido como o peão: o trigger
-- trg_saida_insumos_itens_mov levava ~4,8s na fazenda de produção (~0,8s na
-- fazenda de testes) contra ~120ms como superusuário. O custo era o RLS
-- reavaliado em CADA UPDATE do replay WAC (policies com subselect em
-- usuario_fazenda/usuarios + funções de acesso).
--
-- Correção: as funções de TRIGGER da cascata passam a SECURITY DEFINER com
-- search_path fixo. O RLS continua protegendo o INSERT de origem (avaliado antes
-- do trigger): um usuário da fazenda A não consegue inserir item apontando para
-- cabeçalho da fazenda B. Só as escritas DERIVADAS (movimentações e saldos)
-- deixam de pagar RLS.
--
-- Salvaguardas:
--   * Só funções de trigger viram DEFINER (não são chamáveis como RPC). As
--     auxiliares recalcular_custo_medio_item e inserir_movimentacao_estoque
--     continuam INVOKER: chamadas de dentro do trigger rodam no contexto do dono,
--     sem abrir superfície de RPC cross-tenant.
--   * Como o RLS deixa de proteger a cascata, toda escrita dela é escopada por
--     fazenda_id (UPDATE em insumos/formulacoes/movimentações filtra fazenda_id).
--   * trg_entrada_insumos_itens_mov já era SECURITY DEFINER.
--   * Sem mudança de dados; reversível com ALTER FUNCTION ... SECURITY INVOKER.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Funções de trigger: SECURITY DEFINER, search_path fixo
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.trg_saida_insumos_itens_mov()          SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.trg_fabrica_confinamento_insumos_mov() SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.trg_suplementacao_mov()                SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.trg_mov_supl_auditoria()               SECURITY DEFINER SET search_path = public;

-- ----------------------------------------------------------------------------
-- 2. Replay WAC: UPDATEs escopados por fazenda_id (continua INVOKER)
--    Base: 20261006150000_reduzir_writes_sync_estoque.sql
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalcular_custo_medio_item(
  p_fazenda_id uuid,
  p_item_tipo text,
  p_item_id uuid
)
RETURNS void AS $$
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
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 3. Trigger incremental: DEFINER + UPDATE de saída escopado por fazenda_id
--    Base: 20261001120000_remover_estorno_espelho_movimentacoes.sql
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_estoque_suplemento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pode_recalcular boolean := false;
BEGIN
  -- DELETE: remover movimentação, precisa recalcular para atualizar saldos
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalcular_custo_medio_item(OLD.fazenda_id, OLD.item_tipo, OLD.item_id);
    RETURN OLD;
  END IF;

  -- UPDATE de colunas que afetam saldo/custo
  IF TG_OP = 'UPDATE' THEN
    v_pode_recalcular :=
      OLD.quantidade IS DISTINCT FROM NEW.quantidade
      OR OLD.tipo_movimentacao IS DISTINCT FROM NEW.tipo_movimentacao
      OR OLD.custo_unitario IS DISTINCT FROM NEW.custo_unitario
      OR OLD.valor_total IS DISTINCT FROM NEW.valor_total
      OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at;

    IF v_pode_recalcular THEN
      IF OLD.item_id IS DISTINCT FROM NEW.item_id OR OLD.item_tipo IS DISTINCT FROM NEW.item_tipo THEN
        PERFORM public.recalcular_custo_medio_item(OLD.fazenda_id, OLD.item_tipo, OLD.item_id);
      END IF;
      PERFORM public.recalcular_custo_medio_item(NEW.fazenda_id, NEW.item_tipo, NEW.item_id);
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT: com registro_origem_id, replay sequencial (inserts podem vir fora de ordem)
  IF NEW.registro_origem_id IS NOT NULL THEN
    PERFORM public.recalcular_custo_medio_item(NEW.fazenda_id, NEW.item_tipo, NEW.item_id);
  ELSE
    -- Movimento manual: incremental
    IF NEW.tipo_movimentacao IN ('entrada', 'producao') THEN
      PERFORM public.recalcular_custo_medio_item(NEW.fazenda_id, NEW.item_tipo, NEW.item_id);
    ELSIF NEW.tipo_movimentacao = 'ajuste' THEN
      PERFORM public.recalcular_custo_medio_item(NEW.fazenda_id, NEW.item_tipo, NEW.item_id);
    ELSIF NEW.tipo_movimentacao IN ('baixa', 'consumo') THEN
      IF NEW.item_tipo = 'insumo' THEN
        UPDATE public.insumos
        SET estoque_atual = estoque_atual - NEW.quantidade,
            updated_at = NOW()
        WHERE id = NEW.item_id
          AND fazenda_id = NEW.fazenda_id;
      ELSIF NEW.item_tipo = 'formulacao' THEN
        UPDATE public.formulacoes
        SET estoque_atual = estoque_atual - NEW.quantidade,
            updated_at = NOW()
        WHERE id = NEW.item_id
          AND fazenda_id = NEW.fazenda_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
