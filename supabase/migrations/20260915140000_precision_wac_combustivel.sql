-- Ajustar precisão das colunas numéricas + adicionar valor_total + custo_medio_l + trigger WAC
-- Padrao: numeric(12,3) para litros, numeric(12,2) para valores monetarios, numeric(12,4) para precos/custo medio

-- ==================== AJUSTAR PRECISAO: tanques_combustivel ====================
ALTER TABLE public.tanques_combustivel
  ALTER COLUMN capacidade_maxima_l TYPE numeric(12,3),
  ALTER COLUMN saldo_atual_l TYPE numeric(12,3),
  ALTER COLUMN limite_alerta_l TYPE numeric(12,3);

-- Adicionar custo_medio_l (Weighted Average Cost por litro)
ALTER TABLE public.tanques_combustivel
  ADD COLUMN custo_medio_l numeric(12,4) NOT NULL DEFAULT 0;

-- ==================== AJUSTAR PRECISAO: movimentacoes_combustivel ====================
ALTER TABLE public.movimentacoes_combustivel
  ALTER COLUMN quantidade_l TYPE numeric(12,3),
  ALTER COLUMN preco_por_litro TYPE numeric(12,4);

-- Adicionar valor_total (valor monetario total da nota fiscal / compra)
ALTER TABLE public.movimentacoes_combustivel
  ADD COLUMN valor_total numeric(12,2);

-- Constraint: entradas devem ter valor_total, baixas/ajustes nao
ALTER TABLE public.movimentacoes_combustivel
  DROP CONSTRAINT IF EXISTS chk_movimentacao_valor_total;
ALTER TABLE public.movimentacoes_combustivel
  ADD CONSTRAINT chk_movimentacao_valor_total CHECK (
    (tipo_movimentacao = 'entrada' AND valor_total IS NOT NULL AND valor_total > 0)
    OR
    (tipo_movimentacao IN ('baixa', 'ajuste') AND valor_total IS NULL)
  );

-- ==================== FUNCAO: recalcular custo medio WAC ====================
-- Recalcula o custo medio ponderado movel a partir de todas as movimentacoes
CREATE OR REPLACE FUNCTION public.recalcular_custo_medio_tanque(p_tanque_id uuid)
RETURNS void AS $$
DECLARE
  v_saldo numeric(12,3) := 0;
  v_custo_medio numeric(12,4) := 0;
  v_mov record;
BEGIN
  FOR v_mov IN
    SELECT tipo_movimentacao, quantidade_l, preco_por_litro
    FROM public.movimentacoes_combustivel
    WHERE tanque_id = p_tanque_id
    ORDER BY created_at ASC, data ASC
  LOOP
    IF v_mov.tipo_movimentacao = 'entrada' THEN
      IF v_saldo = 0 THEN
        v_custo_medio := COALESCE(v_mov.preco_por_litro, 0);
      ELSE
        v_custo_medio := ROUND(
          (v_saldo * v_custo_medio + v_mov.quantidade_l * COALESCE(v_mov.preco_por_litro, 0))
          / (v_saldo + v_mov.quantidade_l),
          4
        );
      END IF;
      v_saldo := v_saldo + v_mov.quantidade_l;
    ELSIF v_mov.tipo_movimentacao = 'baixa' THEN
      v_saldo := GREATEST(0, v_saldo - v_mov.quantidade_l);
      -- custo_medio nao muda em baixas
    ELSIF v_mov.tipo_movimentacao = 'ajuste' THEN
      v_saldo := v_mov.quantidade_l;
      -- ajuste define saldo absoluto, nao altera custo medio
    END IF;
  END LOOP;

  UPDATE public.tanques_combustivel
  SET saldo_atual_l = v_saldo, custo_medio_l = v_custo_medio
  WHERE id = p_tanque_id;
END;
$$ LANGUAGE plpgsql;

-- ==================== TRIGGER: atualizar saldo + custo medio ====================
CREATE OR REPLACE FUNCTION public.update_tanque_saldo_custo()
RETURNS TRIGGER AS $$
DECLARE
  v_delta numeric(12,3);
  v_saldo_atual numeric(12,3);
  v_custo_medio_atual numeric(12,4);
  v_novo_saldo numeric(12,3);
  v_novo_custo_medio numeric(12,4);
BEGIN
  -- Buscar estado atual do tanque
  SELECT saldo_atual_l, custo_medio_l
  INTO v_saldo_atual, v_custo_medio_atual
  FROM public.tanques_combustivel
  WHERE id = COALESCE(NEW.tanque_id, OLD.tanque_id)
  FOR UPDATE;

  IF (TG_OP = 'DELETE') THEN
    -- Recalcular do zero apos remocao (WAC nao e invertivel sem historico)
    PERFORM public.recalcular_custo_medio_tanque(OLD.tanque_id);
    RETURN OLD;
  END IF;

  IF (TG_OP = 'INSERT') THEN
    IF (NEW.tipo_movimentacao = 'entrada') THEN
      v_delta := NEW.quantidade_l;
      -- WAC: (saldo_atual * custo_medio + entrada * preco) / (saldo_atual + entrada)
      IF v_saldo_atual = 0 THEN
        v_novo_custo_medio := COALESCE(NEW.preco_por_litro, 0);
      ELSE
        v_novo_custo_medio := ROUND(
          (v_saldo_atual * v_custo_medio_atual + NEW.quantidade_l * COALESCE(NEW.preco_por_litro, 0))
          / (v_saldo_atual + NEW.quantidade_l),
          4
        );
      END IF;
      v_novo_saldo := v_saldo_atual + v_delta;
      UPDATE public.tanques_combustivel
      SET saldo_atual_l = v_novo_saldo, custo_medio_l = v_novo_custo_medio
      WHERE id = NEW.tanque_id;
    ELSIF (NEW.tipo_movimentacao = 'baixa') THEN
      v_delta := -NEW.quantidade_l;
      v_novo_saldo := GREATEST(0, v_saldo_atual + v_delta);
      -- custo_medio nao muda em baixas
      UPDATE public.tanques_combustivel
      SET saldo_atual_l = v_novo_saldo
      WHERE id = NEW.tanque_id;
    ELSIF (NEW.tipo_movimentacao = 'ajuste') THEN
      -- Ajuste define saldo absoluto, nao altera custo medio
      UPDATE public.tanques_combustivel
      SET saldo_atual_l = NEW.quantidade_l
      WHERE id = NEW.tanque_id;
    END IF;
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    -- Recalcular do zero (simples e seguro para WAC)
    PERFORM public.recalcular_custo_medio_tanque(NEW.tanque_id);
    -- Se mudou de tanque, recalcular o antigo tambem
    IF OLD.tanque_id IS DISTINCT FROM NEW.tanque_id THEN
      PERFORM public.recalcular_custo_medio_tanque(OLD.tanque_id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Dropar trigger antigo e criar novo
DROP TRIGGER IF EXISTS trigger_update_tanque_saldo ON public.movimentacoes_combustivel;
DROP FUNCTION IF EXISTS public.update_tanque_saldo();

CREATE TRIGGER trigger_update_tanque_saldo_custo
  AFTER INSERT OR UPDATE OR DELETE ON public.movimentacoes_combustivel
  FOR EACH ROW
  EXECUTE FUNCTION public.update_tanque_saldo_custo();
