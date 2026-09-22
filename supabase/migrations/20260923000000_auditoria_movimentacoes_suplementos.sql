-- ============================================================================
-- Auditoria de movimentações de estoque de suplementos
-- Toda movimentação passa a registrar quem executou (usuario_id) e o efeito no
-- saldo (saldo_anterior -> saldo_posterior). BEFORE INSERT preenche os campos;
-- o recálculo do WAC regrava a cadeia de saldos para manter consistência em
-- UPDATE/DELETE de movimentações. usuario_id é uuid sem FK para não quebrar
-- inserts de triggers quando o autor não existir em public.usuarios.
-- ============================================================================

ALTER TABLE public.movimentacoes_estoque_suplementos
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS saldo_anterior numeric(12,3),
  ADD COLUMN IF NOT EXISTS saldo_posterior numeric(12,3);

COMMENT ON COLUMN public.movimentacoes_estoque_suplementos.usuario_id IS
  'Autor da movimentação (auth.uid() = public.usuarios.id quando existir). NULL em writes via service role/SQL.';
COMMENT ON COLUMN public.movimentacoes_estoque_suplementos.saldo_anterior IS
  'Saldo do item imediatamente antes desta movimentação (kg).';
COMMENT ON COLUMN public.movimentacoes_estoque_suplementos.saldo_posterior IS
  'Saldo do item logo após esta movimentação (kg). Para ajuste, igual a quantidade (saldo absoluto).';

-- ==================== BEFORE INSERT: preencher auditoria ====================
CREATE OR REPLACE FUNCTION public.trg_mov_supl_auditoria()
RETURNS TRIGGER AS $$
DECLARE
  v_saldo numeric(12,3);
BEGIN
  NEW.usuario_id := COALESCE(NEW.usuario_id, auth.uid());

  IF NEW.item_tipo = 'insumo' THEN
    SELECT COALESCE(i.estoque_atual, 0) INTO v_saldo
    FROM public.insumos i WHERE i.id = NEW.item_id;
  ELSIF NEW.item_tipo = 'formulacao' THEN
    SELECT COALESCE(f.estoque_atual, 0) INTO v_saldo
    FROM public.formulacoes f WHERE f.id = NEW.item_id;
  END IF;

  NEW.saldo_anterior := COALESCE(v_saldo, 0);
  NEW.saldo_posterior := CASE
    WHEN NEW.tipo_movimentacao IN ('entrada', 'producao') THEN NEW.saldo_anterior + NEW.quantidade
    WHEN NEW.tipo_movimentacao IN ('baixa', 'consumo', 'estorno') THEN NEW.saldo_anterior - NEW.quantidade
    WHEN NEW.tipo_movimentacao = 'ajuste' THEN NEW.quantidade
    ELSE NEW.saldo_anterior
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mov_supl_auditoria ON public.movimentacoes_estoque_suplementos;
CREATE TRIGGER trg_mov_supl_auditoria
  BEFORE INSERT ON public.movimentacoes_estoque_suplementos
  FOR EACH ROW EXECUTE FUNCTION public.trg_mov_supl_auditoria();

-- ==================== Recalc WAC: também regravar cadeia de saldos ====================
-- Ao reprocessar o item do zero, cada movimentação recebe saldo_anterior e
-- saldo_posterior consistentes. O UPDATE só roda quando os valores divergem,
-- e o trigger de UPDATE retorna cedo quando só colunas de auditoria mudam
-- (ver guarda em update_estoque_suplemento), então não há recursão.
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
      -- ajuste define saldo absoluto, não altera custo médio
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

-- ==================== Trigger principal: guarda anti-recursão ====================
-- Em UPDATE, se nenhuma coluna que afeta saldo/custo mudou (ex: só auditoria),
-- retorna sem recalcular. Isso também impede recursão quando o recálculo
-- regrava saldo_anterior/saldo_posterior nas próprias movimentações.
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
    -- Ajuste define saldo absoluto, não altera custo médio
    IF NEW.item_tipo = 'insumo' THEN
      UPDATE public.insumos
      SET estoque_atual = NEW.quantidade
      WHERE id = NEW.item_id;
    ELSIF NEW.item_tipo = 'formulacao' THEN
      UPDATE public.formulacoes
      SET estoque_atual = NEW.quantidade,
          custo_total_estoque = ROUND(NEW.quantidade * v_custo_medio_atual, 2)
      WHERE id = NEW.item_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==================== Backfill: reconstruir cadeia de saldos ====================
-- Reprocessa cada item via recálculo, que agora também grava
-- saldo_anterior/saldo_posterior em cada movimentação existente.
DO $$
DECLARE
  v_item record;
BEGIN
  FOR v_item IN
    SELECT DISTINCT fazenda_id, item_tipo, item_id
    FROM public.movimentacoes_estoque_suplementos
    WHERE deleted_at IS NULL
  LOOP
    PERFORM public.recalcular_custo_medio_item(
      v_item.item_tipo, v_item.item_id, v_item.fazenda_id
    );
  END LOOP;
END $$;
