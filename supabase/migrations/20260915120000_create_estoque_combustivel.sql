-- Create tanques_combustivel and movimentacoes_combustivel tables
-- Controle de estoque de combustível com múltiplos tanques por tipo.

-- ==================== TABELA: tanques_combustivel ====================
CREATE TABLE public.tanques_combustivel (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo_combustivel text NOT NULL CHECK (tipo_combustivel IN ('Álcool', 'Gasolina', 'Diesel S10', 'Diesel Comum')),
  capacidade_maxima_l numeric NOT NULL CHECK (capacidade_maxima_l > 0),
  saldo_atual_l numeric NOT NULL DEFAULT 0 CHECK (saldo_atual_l >= 0),
  limite_alerta_l numeric NOT NULL DEFAULT 0,
  ativo boolean DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Um tanque ativo por tipo por fazenda
CREATE UNIQUE INDEX idx_tanques_combustivel_unique_tipo_fazenda
ON public.tanques_combustivel(fazenda_id, tipo_combustivel)
WHERE deleted_at IS NULL;

CREATE INDEX idx_tanques_combustivel_fazenda_id ON public.tanques_combustivel(fazenda_id);
CREATE INDEX idx_tanques_combustivel_ativo ON public.tanques_combustivel(ativo);
CREATE INDEX idx_tanques_combustivel_deleted_at ON public.tanques_combustivel(deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE public.tanques_combustivel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated select tanques_combustivel"
ON public.tanques_combustivel FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated insert tanques_combustivel"
ON public.tanques_combustivel FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated update tanques_combustivel"
ON public.tanques_combustivel FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated delete tanques_combustivel"
ON public.tanques_combustivel FOR DELETE
TO authenticated
USING (true);

GRANT ALL ON TABLE public.tanques_combustivel TO authenticated;

-- ==================== TABELA: movimentacoes_combustivel ====================
CREATE TABLE public.movimentacoes_combustivel (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  tanque_id uuid NOT NULL REFERENCES public.tanques_combustivel(id) ON DELETE CASCADE,
  tipo_movimentacao text NOT NULL CHECK (tipo_movimentacao IN ('entrada', 'baixa', 'ajuste')),
  quantidade_l numeric NOT NULL CHECK (quantidade_l > 0),
  preco_por_litro numeric,
  data date NOT NULL DEFAULT CURRENT_DATE,
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('pwa_entrada', 'painel_baixa', 'painel_ajuste', 'painel_entrada', 'manual')),
  registro_abastecimento_id uuid REFERENCES public.registros_abastecimento(id) ON DELETE SET NULL,
  fornecedor text,
  observacao text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_movimentacoes_combustivel_fazenda_id ON public.movimentacoes_combustivel(fazenda_id);
CREATE INDEX idx_movimentacoes_combustivel_tanque_id ON public.movimentacoes_combustivel(tanque_id);
CREATE INDEX idx_movimentacoes_combustivel_data ON public.movimentacoes_combustivel(data);
CREATE INDEX idx_movimentacoes_combustivel_tipo ON public.movimentacoes_combustivel(tipo_movimentacao);
CREATE INDEX idx_movimentacoes_combustivel_registro_abastecimento_id ON public.movimentacoes_combustivel(registro_abastecimento_id);

ALTER TABLE public.movimentacoes_combustivel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated select movimentacoes_combustivel"
ON public.movimentacoes_combustivel FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated insert movimentacoes_combustivel"
ON public.movimentacoes_combustivel FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated update movimentacoes_combustivel"
ON public.movimentacoes_combustivel FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated delete movimentacoes_combustivel"
ON public.movimentacoes_combustivel FOR DELETE
TO authenticated
USING (true);

GRANT ALL ON TABLE public.movimentacoes_combustivel TO authenticated;

-- ==================== COLUNA: baixa_estoque_id em registros_abastecimento ====================
ALTER TABLE public.registros_abastecimento
ADD COLUMN baixa_estoque_id uuid REFERENCES public.movimentacoes_combustivel(id) ON DELETE SET NULL;

CREATE INDEX idx_registros_abastecimento_baixa_estoque_id ON public.registros_abastecimento(baixa_estoque_id) WHERE baixa_estoque_id IS NULL;

-- ==================== TRIGGER: atualizar saldo do tanque ====================
CREATE OR REPLACE FUNCTION public.update_tanque_saldo()
RETURNS TRIGGER AS $$
DECLARE
  v_delta numeric;
  v_novo_saldo numeric;
  v_tanque_capacidade numeric;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    -- Reverter movimentacao deletada
    IF (OLD.tipo_movimentacao = 'entrada') THEN
      v_delta := -OLD.quantidade_l;
    ELSIF (OLD.tipo_movimentacao = 'baixa') THEN
      v_delta := OLD.quantidade_l;
    ELSIF (OLD.tipo_movimentacao = 'ajuste') THEN
      -- Ajuste: nao reverter (saldo absoluto), apenas ignorar
      v_delta := 0;
    END IF;
    UPDATE public.tanques_combustivel
    SET saldo_atual_l = GREATEST(0, saldo_atual_l + v_delta)
    WHERE id = OLD.tanque_id;
    RETURN OLD;
  END IF;

  IF (TG_OP = 'INSERT') THEN
    IF (NEW.tipo_movimentacao = 'entrada') THEN
      v_delta := NEW.quantidade_l;
    ELSIF (NEW.tipo_movimentacao = 'baixa') THEN
      v_delta := -NEW.quantidade_l;
    ELSIF (NEW.tipo_movimentacao = 'ajuste') THEN
      -- Ajuste define saldo absoluto
      UPDATE public.tanques_combustivel
      SET saldo_atual_l = NEW.quantidade_l
      WHERE id = NEW.tanque_id;
      RETURN NEW;
    END IF;
    UPDATE public.tanques_combustivel
    SET saldo_atual_l = GREATEST(0, saldo_atual_l + v_delta)
    WHERE id = NEW.tanque_id;
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    -- Reverter movimentacao antiga e aplicar nova
    IF (OLD.tipo_movimentacao = 'entrada') THEN
      v_delta := -OLD.quantidade_l;
    ELSIF (OLD.tipo_movimentacao = 'baixa') THEN
      v_delta := OLD.quantidade_l;
    ELSIF (OLD.tipo_movimentacao = 'ajuste') THEN
      v_delta := 0;
    END IF;

    IF (NEW.tipo_movimentacao = 'entrada') THEN
      v_delta := v_delta + NEW.quantidade_l;
    ELSIF (NEW.tipo_movimentacao = 'baixa') THEN
      v_delta := v_delta - NEW.quantidade_l;
    ELSIF (NEW.tipo_movimentacao = 'ajuste') THEN
      -- Ajuste: definir saldo absoluto, ignorar delta anterior
      UPDATE public.tanques_combustivel
      SET saldo_atual_l = NEW.quantidade_l
      WHERE id = NEW.tanque_id;
      RETURN NEW;
    END IF;

    UPDATE public.tanques_combustivel
    SET saldo_atual_l = GREATEST(0, saldo_atual_l + v_delta)
    WHERE id = NEW.tanque_id;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_tanque_saldo ON public.movimentacoes_combustivel;
CREATE TRIGGER trigger_update_tanque_saldo
  AFTER INSERT OR UPDATE OR DELETE ON public.movimentacoes_combustivel
  FOR EACH ROW
  EXECUTE FUNCTION public.update_tanque_saldo();

-- ==================== TRIGGER: updated_at ====================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_tanques_combustivel_updated_at ON public.tanques_combustivel;
CREATE TRIGGER update_tanques_combustivel_updated_at
  BEFORE UPDATE ON public.tanques_combustivel
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_movimentacoes_combustivel_updated_at ON public.movimentacoes_combustivel;
CREATE TRIGGER update_movimentacoes_combustivel_updated_at
  BEFORE UPDATE ON public.movimentacoes_combustivel
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
