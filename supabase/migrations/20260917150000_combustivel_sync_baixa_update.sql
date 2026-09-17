-- Sincronia da baixa de estoque com o abastecimento + fuso na data da
-- movimentacao + correcao da validacao de capacidade em UPDATE.
--
-- 1. baixa_automatica_abastecimento: grava movimentacoes_combustivel.data no
--    fuso da fazenda ((NEW.data AT TIME ZONE fazendas.timezone)::date) em vez
--    de herdaro cast UTC do timestamptz, que deslocava a data apos 20h em
--    America/Cuiaba.
-- 2. Nova trigger trg_sync_baixa_abastecimento (AFTER UPDATE): mantem a baixa
--    consistente quando o abastecimento e alterado depois do insert:
--      - soft-delete (deleted_at null -> set): remove a movimentacao de baixa;
--      - troca de tanque_id: estorna no tanque antigo e baixa no novo;
--      - mudanca de total_abastecido: ajusta quantidade_l da baixa
--        (total <= 0/nulo remove a baixa);
--      - registro ativo com tanque e sem baixa (restore ou estorno manual):
--        recria a baixa.
--    Deletar/atualizar a movimentacao dispara trigger_update_tanque_saldo_custo,
--    que recalcula saldo e WAC. baixa_estoque_id volta a NULL via FK
--    ON DELETE SET NULL quando a baixa e removida.
-- 3. validar_capacidade_tanque: em UPDATE, desconta o efeito da movimentacao
--    antiga antes de somar a nova (antes somava NEW.quantidade_l sobre um saldo
--    que ja incluia OLD.quantidade_l, gerando falso positivo de capacidade).
-- 4. Permite ajuste com quantidade_l = 0 (inventario que zerou o tanque);
--    entradas e baixas continuam exigindo quantidade positiva.

-- ==================== 0. Constraint: ajuste pode zerar o tanque ====================
ALTER TABLE public.movimentacoes_combustivel
  DROP CONSTRAINT IF EXISTS movimentacoes_combustivel_quantidade_l_check;
ALTER TABLE public.movimentacoes_combustivel
  ADD CONSTRAINT movimentacoes_combustivel_quantidade_l_check
  CHECK (quantidade_l > 0 OR (tipo_movimentacao = 'ajuste' AND quantidade_l >= 0));

-- ==================== 1. Baixa automatica com fuso da fazenda ====================
CREATE OR REPLACE FUNCTION public.baixa_automatica_abastecimento()
RETURNS TRIGGER AS $$
DECLARE
  v_saldo numeric(12,3);
  v_custo_medio numeric(12,4);
  v_mov_id uuid;
  v_tz text;
BEGIN
  -- So executa se tem tanque vinculado e ainda nao tem baixa
  IF NEW.tanque_id IS NULL OR NEW.baixa_estoque_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Lock do tanque na mesma transacao
  SELECT saldo_atual_l, custo_medio_l
  INTO v_saldo, v_custo_medio
  FROM public.tanques_combustivel
  WHERE id = NEW.tanque_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tanque % nao encontrado', NEW.tanque_id;
  END IF;

  -- Fuso da fazenda para a data operacional da movimentacao
  SELECT COALESCE(timezone, 'America/Cuiaba') INTO v_tz
    FROM public.fazendas WHERE id = NEW.fazenda_id;
  v_tz := COALESCE(v_tz, 'America/Cuiaba');

  -- Criar baixa automatica (saldo negativo permitido)
  INSERT INTO public.movimentacoes_combustivel (
    fazenda_id, tanque_id, tipo_movimentacao, quantidade_l,
    preco_por_litro, data, origem, registro_abastecimento_id
  ) VALUES (
    NEW.fazenda_id, NEW.tanque_id, 'baixa', NEW.total_abastecido,
    v_custo_medio, (NEW.data AT TIME ZONE v_tz)::date, 'auto_baixa', NEW.id
  )
  RETURNING id INTO v_mov_id;

  -- Vincular baixa ao abastecimento
  UPDATE public.registros_abastecimento
  SET baixa_estoque_id = v_mov_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public';

-- ==================== 2. Sync da baixa em UPDATE do abastecimento ====================
CREATE OR REPLACE FUNCTION public.sync_baixa_abastecimento()
RETURNS TRIGGER AS $$
DECLARE
  v_baixa uuid := NEW.baixa_estoque_id;
  v_mov_id uuid;
  v_custo_medio numeric(12,4);
  v_tz text;
BEGIN
  -- Nada relevante mudou (ex.: update so de baixa_estoque_id, nome, etc.)
  IF OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at
     AND OLD.tanque_id IS NOT DISTINCT FROM NEW.tanque_id
     AND OLD.total_abastecido IS NOT DISTINCT FROM NEW.total_abastecido THEN
    RETURN NEW;
  END IF;

  -- Soft-delete: estorna a baixa vinculada
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    IF v_baixa IS NOT NULL THEN
      DELETE FROM public.movimentacoes_combustivel WHERE id = v_baixa;
      v_baixa := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- Troca de tanque: estorna a baixa antiga; a nova e criada abaixo
  IF OLD.tanque_id IS DISTINCT FROM NEW.tanque_id AND v_baixa IS NOT NULL THEN
    DELETE FROM public.movimentacoes_combustivel WHERE id = v_baixa;
    v_baixa := NULL;
  END IF;

  -- Registro ativo com tanque vinculado
  IF NEW.deleted_at IS NULL AND NEW.tanque_id IS NOT NULL THEN
    IF NEW.total_abastecido IS NULL OR NEW.total_abastecido <= 0 THEN
      -- Total zerado/nulo: remove a baixa se existir
      IF v_baixa IS NOT NULL THEN
        DELETE FROM public.movimentacoes_combustivel WHERE id = v_baixa;
      END IF;
    ELSIF v_baixa IS NULL THEN
      -- Sem baixa mas deveria ter: troca de tanque, restore de soft-delete
      -- ou estorno manual. Recria com o custo medio atual do tanque.
      SELECT custo_medio_l INTO v_custo_medio
        FROM public.tanques_combustivel WHERE id = NEW.tanque_id FOR UPDATE;
      IF FOUND THEN
        SELECT COALESCE(timezone, 'America/Cuiaba') INTO v_tz
          FROM public.fazendas WHERE id = NEW.fazenda_id;
        INSERT INTO public.movimentacoes_combustivel (
          fazenda_id, tanque_id, tipo_movimentacao, quantidade_l,
          preco_por_litro, data, origem, registro_abastecimento_id
        ) VALUES (
          NEW.fazenda_id, NEW.tanque_id, 'baixa', NEW.total_abastecido,
          v_custo_medio,
          (NEW.data AT TIME ZONE COALESCE(v_tz, 'America/Cuiaba'))::date,
          'auto_baixa', NEW.id
        ) RETURNING id INTO v_mov_id;
        UPDATE public.registros_abastecimento
          SET baixa_estoque_id = v_mov_id WHERE id = NEW.id;
      END IF;
    ELSIF OLD.total_abastecido IS DISTINCT FROM NEW.total_abastecido THEN
      -- Total mudou no mesmo tanque: ajusta a quantidade da baixa
      UPDATE public.movimentacoes_combustivel
        SET quantidade_l = NEW.total_abastecido
        WHERE id = v_baixa;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public';

DROP TRIGGER IF EXISTS trg_sync_baixa_abastecimento ON public.registros_abastecimento;

CREATE TRIGGER trg_sync_baixa_abastecimento
  AFTER UPDATE ON public.registros_abastecimento
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_baixa_abastecimento();

-- ==================== 3. Capacidade: descontar efeito antigo em UPDATE ====================
CREATE OR REPLACE FUNCTION public.validar_capacidade_tanque()
RETURNS TRIGGER AS $$
DECLARE
  v_capacidade numeric(12,3);
  v_saldo_atual numeric(12,3);
  v_base numeric(12,3);
  v_novo_saldo numeric(12,3);
  v_tanque_nome text;
BEGIN
  -- Ignorar baixas: elas reduzem o saldo
  IF NEW.tipo_movimentacao = 'baixa' THEN
    RETURN NEW;
  END IF;

  -- Buscar capacidade e saldo atual do tanque (destino, em caso de troca)
  SELECT capacidade_maxima_l, saldo_atual_l, nome
  INTO v_capacidade, v_saldo_atual, v_tanque_nome
  FROM public.tanques_combustivel
  WHERE id = NEW.tanque_id
  FOR UPDATE;

  -- Se nao houver capacidade definida, liberar
  IF COALESCE(v_capacidade, 0) = 0 THEN
    RETURN NEW;
  END IF;

  -- Ajuste define saldo absoluto: projecao independe do saldo atual
  IF NEW.tipo_movimentacao = 'ajuste' THEN
    v_novo_saldo := COALESCE(NEW.quantidade_l, 0);
  ELSE
    -- Entrada: base = saldo sem o efeito da movimentacao antiga (em UPDATE)
    v_base := COALESCE(v_saldo_atual, 0);
    IF TG_OP = 'UPDATE' AND OLD.tanque_id = NEW.tanque_id THEN
      IF OLD.tipo_movimentacao = 'entrada' THEN
        v_base := v_base - COALESCE(OLD.quantidade_l, 0);
      ELSIF OLD.tipo_movimentacao = 'baixa' THEN
        v_base := v_base + COALESCE(OLD.quantidade_l, 0);
      END IF;
      -- OLD ajuste: efeito nao-linear; usa o saldo atual como base conservadora
    END IF;
    v_novo_saldo := v_base + COALESCE(NEW.quantidade_l, 0);
  END IF;

  IF v_novo_saldo > v_capacidade THEN
    RAISE EXCEPTION 'Capacidade do tanque "%" excedida. Capacidade: % L, saldo apos operacao: % L', v_tanque_nome, v_capacidade, v_novo_saldo;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
