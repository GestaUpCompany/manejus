-- ============================================================================
-- Remove o tipo de movimentação 'estorno' do estoque de suplementação.
--
-- Motivo: o estorno era gerado por UPDATE/DELETE nos registros de origem, mas
-- qualquer retry de upsert do PWA (onConflict: 'local_id') resolve como UPDATE
-- no Postgres e disparava estorno fantasma. Além disso o WAC subtraía o estorno
-- sempre, invertendo o sinal para movimentos de descida (baixa/consumo), e o
-- ON CONFLICT de idempotência engolia a movimentação substituta.
--
-- Novo modelo: a movimentação espelha a linha de origem.
--   INSERT na origem        -> INSERT da movimentação
--   UPDATE na origem        -> UPDATE da movimentação existente (mesma linha)
--   DELETE/soft-delete      -> soft-delete da movimentação (deleted_at)
--   UPDATE sem mudança      -> no-op (retry idempotente)
-- A movimentação soft-deletada pode ser reavivada se o alvo voltar a existir,
-- contornando a chave única (registro_origem_id, item_tipo, item_id, tipo).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. entrada_insumos_itens -> movimentação 'entrada' no insumo/formulacao
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_entrada_insumos_itens_mov()
RETURNS TRIGGER AS $$
DECLARE
  v_fazenda_id uuid;
  v_data date;
  v_item_tipo text;
  v_item_id uuid;
BEGIN
  SELECT r.fazenda_id, r.data_entrada
  INTO v_fazenda_id, v_data
  FROM public.registros_entrada_insumos r
  WHERE r.id = COALESCE(NEW.entrada_id, OLD.entrada_id);

  IF v_fazenda_id IS NULL THEN
    -- Cabeçalho ainda não sincronizado; nada a espelhar
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
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 2. saida_insumos_itens -> 'baixa' no insumo + 'producao' na formulacao
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_saida_insumos_itens_mov()
RETURNS TRIGGER AS $$
DECLARE
  v_fazenda_id uuid;
  v_formulacao_id uuid;
  v_data date;
  v_custo_insumo numeric;
  v_controla boolean := false;
BEGIN
  SELECT r.fazenda_id, r.formulacao_id, r.data_producao
  INTO v_fazenda_id, v_formulacao_id, v_data
  FROM public.registros_saida_insumos r
  WHERE r.id = COALESCE(NEW.saida_id, OLD.saida_id);

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
     AND OLD.saida_id IS NOT DISTINCT FROM NEW.saida_id
     AND OLD.insumo_id IS NOT DISTINCT FROM NEW.insumo_id
     AND OLD.quantidade IS NOT DISTINCT FROM NEW.quantidade THEN
    RETURN NEW;
  END IF;

  IF v_formulacao_id IS NOT NULL THEN
    SELECT COALESCE(f.controla_estoque, false)
    INTO v_controla
    FROM public.formulacoes f
    WHERE f.id = v_formulacao_id;
  END IF;

  -- Baixa de insumo divergente do item atual
  UPDATE public.movimentacoes_estoque_suplementos
  SET deleted_at = NOW()
  WHERE registro_origem_id = NEW.id
    AND deleted_at IS NULL
    AND tipo_movimentacao = 'baixa'
    AND (item_tipo <> 'insumo' OR item_id IS DISTINCT FROM NEW.insumo_id);

  -- Producao de formulacao divergente ou sem alvo válido
  UPDATE public.movimentacoes_estoque_suplementos
  SET deleted_at = NOW()
  WHERE registro_origem_id = NEW.id
    AND deleted_at IS NULL
    AND tipo_movimentacao = 'producao'
    AND (item_tipo <> 'formulacao'
         OR item_id IS DISTINCT FROM v_formulacao_id
         OR NOT v_controla);

  -- Espelha a baixa do insumo
  UPDATE public.movimentacoes_estoque_suplementos
  SET quantidade = NEW.quantidade,
      data = v_data,
      deleted_at = NULL
  WHERE registro_origem_id = NEW.id
    AND item_tipo = 'insumo'
    AND item_id = NEW.insumo_id
    AND tipo_movimentacao = 'baixa';

  IF NOT FOUND THEN
    PERFORM public.inserir_movimentacao_estoque(
      v_fazenda_id,
      'insumo',
      NEW.insumo_id,
      'baixa',
      NEW.quantidade,
      p_origem := 'saida_insumos',
      p_registro_origem_id := NEW.id,
      p_data := v_data
    );
  END IF;

  -- Espelha a producao da formulacao (quando controla estoque)
  IF v_controla AND v_formulacao_id IS NOT NULL THEN
    SELECT custo_unitario INTO v_custo_insumo
    FROM public.insumos
    WHERE id = NEW.insumo_id;

    UPDATE public.movimentacoes_estoque_suplementos
    SET quantidade = NEW.quantidade,
        custo_unitario = v_custo_insumo,
        data = v_data,
        deleted_at = NULL
    WHERE registro_origem_id = NEW.id
      AND item_tipo = 'formulacao'
      AND item_id = v_formulacao_id
      AND tipo_movimentacao = 'producao';

    IF NOT FOUND THEN
      PERFORM public.inserir_movimentacao_estoque(
        v_fazenda_id,
        'formulacao',
        v_formulacao_id,
        'producao',
        NEW.quantidade,
        p_custo_unitario := v_custo_insumo,
        p_origem := 'saida_insumos',
        p_registro_origem_id := NEW.id,
        p_data := v_data
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 3. registros_fabrica_confinamento_insumos -> 'baixa' por componente do premix
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fabrica_confinamento_insumos_mov()
RETURNS TRIGGER AS $$
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
    SELECT * FROM public.expandir_insumo(NEW.insumo_id, v_kg_total)
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
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 4. registros_suplementacao -> 'consumo' na formulacao
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_suplementacao_mov()
RETURNS TRIGGER AS $$
DECLARE
  v_consumo_total numeric;
  v_controla boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.movimentacoes_estoque_suplementos
    SET deleted_at = NOW()
    WHERE registro_origem_id = OLD.id AND deleted_at IS NULL;
    RETURN OLD;
  END IF;

  -- Soft-delete do registro: remover movimentações
  IF TG_OP = 'UPDATE'
     AND OLD.deleted_at IS NULL
     AND NEW.deleted_at IS NOT NULL THEN
    UPDATE public.movimentacoes_estoque_suplementos
    SET deleted_at = NOW()
    WHERE registro_origem_id = OLD.id AND deleted_at IS NULL;
    RETURN NEW;
  END IF;

  v_consumo_total := COALESCE(NEW.kg_cocho, 0) + COALESCE(NEW.kg_deposito, 0);

  -- Retry/update irrelevante (recalc de consumo médio, auditoria etc.): no-op.
  -- Restore de soft-delete (deleted_at voltando para NULL) NÃO entra aqui.
  IF TG_OP = 'UPDATE'
     AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at
     AND OLD.formulacao_id IS NOT DISTINCT FROM NEW.formulacao_id
     AND OLD.data = NEW.data
     AND (COALESCE(OLD.kg_cocho, 0) + COALESCE(OLD.kg_deposito, 0)) = v_consumo_total THEN
    RETURN NEW;
  END IF;

  IF NEW.formulacao_id IS NOT NULL THEN
    SELECT COALESCE(f.controla_estoque, false)
    INTO v_controla
    FROM public.formulacoes f
    WHERE f.id = NEW.formulacao_id;
  END IF;

  -- Movimentações que não espelham o registro atual
  UPDATE public.movimentacoes_estoque_suplementos
  SET deleted_at = NOW()
  WHERE registro_origem_id = NEW.id
    AND deleted_at IS NULL
    AND (item_tipo <> 'formulacao'
         OR item_id IS DISTINCT FROM NEW.formulacao_id
         OR NOT v_controla);

  IF NOT v_controla OR NEW.formulacao_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.movimentacoes_estoque_suplementos
  SET quantidade = v_consumo_total,
      data = NEW.data::date,
      deleted_at = NULL
  WHERE registro_origem_id = NEW.id
    AND item_tipo = 'formulacao'
    AND item_id = NEW.formulacao_id
    AND tipo_movimentacao = 'consumo';

  IF NOT FOUND THEN
    PERFORM public.inserir_movimentacao_estoque(
      NEW.fazenda_id,
      'formulacao',
      NEW.formulacao_id,
      'consumo',
      v_consumo_total,
      p_origem := 'suplementacao',
      p_registro_origem_id := NEW.id,
      p_data := NEW.data::date
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 5. Auditoria BEFORE INSERT: remove 'estorno' do cálculo de saldo_posterior
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_mov_supl_auditoria()
RETURNS TRIGGER AS $$
DECLARE
  v_saldo_atual numeric;
BEGIN
  SELECT COALESCE(saldo_posterior, 0)
  INTO v_saldo_atual
  FROM public.movimentacoes_estoque_suplementos
  WHERE item_tipo = NEW.item_tipo
    AND item_id = NEW.item_id
    AND fazenda_id = NEW.fazenda_id
    AND deleted_at IS NULL
  ORDER BY data DESC, created_at DESC
  LIMIT 1;

  v_saldo_atual := COALESCE(v_saldo_atual, 0);

  NEW.saldo_anterior := v_saldo_atual;
  NEW.saldo_posterior := CASE
    WHEN NEW.tipo_movimentacao IN ('entrada', 'producao') THEN v_saldo_atual + NEW.quantidade
    WHEN NEW.tipo_movimentacao = 'ajuste' THEN NEW.quantidade
    WHEN NEW.tipo_movimentacao IN ('baixa', 'consumo') THEN v_saldo_atual - NEW.quantidade
    ELSE v_saldo_atual
  END;
  NEW.usuario_id := COALESCE(NEW.usuario_id, auth.uid());

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 6. Recálculo da cadeia WAC: remove 'estorno' do grupo de saída
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
      -- Entrada incrementa estoque e recalcula WAC
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
      -- Saída decrementa estoque, mantém custo médio
      v_saldo := v_saldo - v_mov.quantidade;

    ELSIF v_mov.tipo_movimentacao = 'ajuste' THEN
      -- Ajuste define saldo absoluto
      -- Se tem custo informado, define custo médio também
      v_saldo := v_mov.quantidade;
      IF v_mov.custo_unitario IS NOT NULL AND v_mov.custo_unitario > 0 THEN
        v_custo_medio := v_mov.custo_unitario;
      END IF;
    END IF;

    -- Atualizar saldos históricos da movimentação
    UPDATE public.movimentacoes_estoque_suplementos
    SET saldo_anterior = CASE
          WHEN v_mov.tipo_movimentacao = 'ajuste' THEN v_saldo
          WHEN v_mov.tipo_movimentacao IN ('entrada', 'producao') THEN v_saldo - v_mov.quantidade
          ELSE v_saldo + v_mov.quantidade
        END,
        saldo_posterior = v_saldo
    WHERE id = v_mov.id;
  END LOOP;

  -- Persistir no item
  IF p_item_tipo = 'insumo' THEN
    UPDATE public.insumos
    SET estoque_atual = v_saldo,
        custo_unitario = ROUND(v_custo_medio, 4),
        updated_at = NOW()
    WHERE id = p_item_id;
  ELSIF p_item_tipo = 'formulacao' THEN
    UPDATE public.formulacoes
    SET estoque_atual = v_saldo,
        custo_unitario = ROUND(v_custo_medio, 4),
        updated_at = NOW()
    WHERE id = p_item_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 7. Trigger incremental: remove 'estorno' do grupo de saída
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_estoque_suplemento()
RETURNS TRIGGER AS $$
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
      -- Recalcular item antigo (se mudou de item)
      IF OLD.item_id IS DISTINCT FROM NEW.item_id OR OLD.item_tipo IS DISTINCT FROM NEW.item_tipo THEN
        PERFORM public.recalcular_custo_medio_item(OLD.fazenda_id, OLD.item_tipo, OLD.item_id);
      END IF;
      -- Recalcular item novo
      PERFORM public.recalcular_custo_medio_item(NEW.fazenda_id, NEW.item_tipo, NEW.item_id);
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT: se tem registro_origem_id, recalcular tudo (replay sequencial)
  -- porque inserts podem vir fora de ordem. Senão, incremental.
  IF NEW.registro_origem_id IS NOT NULL THEN
    PERFORM public.recalcular_custo_medio_item(NEW.fazenda_id, NEW.item_tipo, NEW.item_id);
  ELSE
    -- Movimento manual: incremental
    IF NEW.tipo_movimentacao IN ('entrada', 'producao') THEN
      -- Entrada: recalcular porque afeta custo médio
      PERFORM public.recalcular_custo_medio_item(NEW.fazenda_id, NEW.item_tipo, NEW.item_id);
    ELSIF NEW.tipo_movimentacao = 'ajuste' THEN
      -- Ajuste: recalcular para atualizar custo médio e saldos
      PERFORM public.recalcular_custo_medio_item(NEW.fazenda_id, NEW.item_tipo, NEW.item_id);
    ELSIF NEW.tipo_movimentacao IN ('baixa', 'consumo') THEN
      -- Saída: incremental, custo não muda
      IF NEW.item_tipo = 'insumo' THEN
        UPDATE public.insumos
        SET estoque_atual = estoque_atual - NEW.quantidade,
            updated_at = NOW()
        WHERE id = NEW.item_id;
      ELSIF NEW.item_tipo = 'formulacao' THEN
        UPDATE public.formulacoes
        SET estoque_atual = estoque_atual - NEW.quantidade,
            updated_at = NOW()
        WHERE id = NEW.item_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 8. CHECK: remove 'estorno' do domínio (todas as linhas de estorno foram
--    removidas na reconciliação; qualquer soft-deletada também foi limpa)
-- ----------------------------------------------------------------------------
ALTER TABLE public.movimentacoes_estoque_suplementos
  DROP CONSTRAINT movimentacoes_estoque_suplementos_tipo_movimentacao_check;

ALTER TABLE public.movimentacoes_estoque_suplementos
  ADD CONSTRAINT movimentacoes_estoque_suplementos_tipo_movimentacao_check
  CHECK (tipo_movimentacao = ANY (
    ARRAY['entrada', 'baixa', 'producao', 'consumo', 'ajuste']
  ));
