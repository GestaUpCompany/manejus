-- Baixa automática de estoque de combustível ao registrar abastecimento
-- Substitui a baixa manual do Painel Web por trigger AFTER INSERT em registros_abastecimento.
-- Trava de saldo: se saldo_atual_l < total_abastecido, RAISE EXCEPTION (rollback do INSERT).

-- ==================== Adicionar 'auto_baixa' à constraint de origem ====================
ALTER TABLE public.movimentacoes_combustivel
  DROP CONSTRAINT IF EXISTS movimentacoes_combustivel_origem_check;

ALTER TABLE public.movimentacoes_combustivel
  ADD CONSTRAINT movimentacoes_combustivel_origem_check
  CHECK (origem IN ('pwa_entrada', 'painel_baixa', 'painel_ajuste', 'painel_entrada', 'estoque_inicial', 'auto_baixa', 'manual'));

-- ==================== Função: baixa automática ====================
CREATE OR REPLACE FUNCTION public.baixa_automatica_abastecimento()
RETURNS TRIGGER AS $$
DECLARE
  v_saldo numeric(12,3);
  v_custo_medio numeric(12,4);
  v_mov_id uuid;
BEGIN
  -- Só executa se tem tanque vinculado e ainda não tem baixa
  IF NEW.tanque_id IS NULL OR NEW.baixa_estoque_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Lock do tanque na mesma transação
  SELECT saldo_atual_l, custo_medio_l
  INTO v_saldo, v_custo_medio
  FROM public.tanques_combustivel
  WHERE id = NEW.tanque_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tanque % não encontrado', NEW.tanque_id;
  END IF;

  -- Trava de saldo: bloqueia se saldo insuficiente
  IF v_saldo < NEW.total_abastecido THEN
    RAISE EXCEPTION 'Saldo insuficiente no tanque. Saldo atual: % L, tentativa de baixa: % L', v_saldo, NEW.total_abastecido;
  END IF;

  -- Criar baixa automática
  INSERT INTO public.movimentacoes_combustivel (
    fazenda_id, tanque_id, tipo_movimentacao, quantidade_l,
    preco_por_litro, data, origem, registro_abastecimento_id
  ) VALUES (
    NEW.fazenda_id, NEW.tanque_id, 'baixa', NEW.total_abastecido,
    v_custo_medio, NEW.data, 'auto_baixa', NEW.id
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

-- ==================== Trigger: AFTER INSERT em registros_abastecimento ====================
DROP TRIGGER IF EXISTS trg_baixa_automatica_abastecimento ON public.registros_abastecimento;

CREATE TRIGGER trg_baixa_automatica_abastecimento
  AFTER INSERT ON public.registros_abastecimento
  FOR EACH ROW
  EXECUTE FUNCTION public.baixa_automatica_abastecimento();
