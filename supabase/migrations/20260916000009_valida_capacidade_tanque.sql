-- Adiciona validacao de capacidade maxima para movimentacoes de combustivel
-- Aplica a todas as origens: entrada via app, entrada via site, ajuste, saldo inicial

CREATE OR REPLACE FUNCTION public.validar_capacidade_tanque()
RETURNS TRIGGER AS $$
DECLARE
  v_capacidade numeric(12,3);
  v_saldo_atual numeric(12,3);
  v_novo_saldo numeric(12,3);
  v_tanque_nome text;
BEGIN
  -- Ignorar baixas: elas reduzem o saldo
  IF NEW.tipo_movimentacao = 'baixa' THEN
    RETURN NEW;
  END IF;

  -- Buscar capacidade e saldo atual do tanque
  SELECT capacidade_maxima_l, saldo_atual_l, nome
  INTO v_capacidade, v_saldo_atual, v_tanque_nome
  FROM public.tanques_combustivel
  WHERE id = NEW.tanque_id
  FOR UPDATE;

  -- Se nao houver capacidade definida, liberar
  IF COALESCE(v_capacidade, 0) = 0 THEN
    RETURN NEW;
  END IF;

  -- Calcular saldo projetado
  IF NEW.tipo_movimentacao = 'entrada' THEN
    v_novo_saldo := COALESCE(v_saldo_atual, 0) + COALESCE(NEW.quantidade_l, 0);
  ELSIF NEW.tipo_movimentacao = 'ajuste' THEN
    v_novo_saldo := COALESCE(NEW.quantidade_l, 0);
  ELSE
    RETURN NEW;
  END IF;

  IF v_novo_saldo > v_capacidade THEN
    RAISE EXCEPTION 'Capacidade do tanque "%" excedida. Capacidade: % L, saldo apos operacao: % L', v_tanque_nome, v_capacidade, v_novo_saldo;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_valida_capacidade_tanque ON public.movimentacoes_combustivel;

CREATE TRIGGER trg_valida_capacidade_tanque
  BEFORE INSERT OR UPDATE ON public.movimentacoes_combustivel
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_capacidade_tanque();
