-- Estoque de itens do almoxarifado.
-- A retirada do PWA gera baixa automaticamente quando o item tem controla_estoque=true.

ALTER TABLE public.itens_almoxarifado
  ADD COLUMN IF NOT EXISTS unidade text NOT NULL DEFAULT 'un',
  ADD COLUMN IF NOT EXISTS estoque_atual numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_minimo numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_unitario numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_total_estoque numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS controla_estoque boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.itens_almoxarifado
  DROP CONSTRAINT IF EXISTS itens_almoxarifado_estoque_minimo_check,
  DROP CONSTRAINT IF EXISTS itens_almoxarifado_unidade_check;

ALTER TABLE public.itens_almoxarifado
  ADD CONSTRAINT itens_almoxarifado_estoque_minimo_check CHECK (estoque_minimo >= 0),
  ADD CONSTRAINT itens_almoxarifado_unidade_check CHECK (unidade IN ('un', 'kg', 'g', 'L', 'mL', 'm', 'cx', 'pct', 'par', 'kit'));

CREATE INDEX IF NOT EXISTS idx_itens_almoxarifado_deleted_at
  ON public.itens_almoxarifado(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.movimentacoes_almoxarifado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.itens_almoxarifado(id),
  tipo_movimentacao text NOT NULL CHECK (tipo_movimentacao IN ('entrada', 'baixa', 'ajuste', 'estorno', 'devolucao')),
  quantidade numeric(12,3) NOT NULL CHECK (quantidade >= 0),
  custo_unitario numeric(12,4),
  valor_total numeric(12,2),
  origem text,
  registro_origem_id uuid REFERENCES public.registros_almoxarifado(id) ON DELETE SET NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  fornecedor text,
  observacao text,
  local_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_mov_almox_fazenda ON public.movimentacoes_almoxarifado(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_mov_almox_item ON public.movimentacoes_almoxarifado(item_id, data);
CREATE INDEX IF NOT EXISTS idx_mov_almox_data ON public.movimentacoes_almoxarifado(data);
CREATE INDEX IF NOT EXISTS idx_mov_almox_origem ON public.movimentacoes_almoxarifado(registro_origem_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mov_almox_local_id
  ON public.movimentacoes_almoxarifado(local_id) WHERE local_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mov_almox_registro_item_tipo_ativo
  ON public.movimentacoes_almoxarifado(registro_origem_id, item_id, tipo_movimentacao)
  WHERE registro_origem_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.movimentacoes_almoxarifado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mov_almox_select_fazenda ON public.movimentacoes_almoxarifado;
CREATE POLICY mov_almox_select_fazenda ON public.movimentacoes_almoxarifado FOR SELECT TO authenticated
  USING (fazenda_id IN (SELECT fazenda_id FROM public.usuario_fazenda WHERE usuario_id = auth.uid() AND ativo = true));
DROP POLICY IF EXISTS mov_almox_insert_fazenda ON public.movimentacoes_almoxarifado;
CREATE POLICY mov_almox_insert_fazenda ON public.movimentacoes_almoxarifado FOR INSERT TO authenticated
  WITH CHECK (fazenda_id IN (SELECT fazenda_id FROM public.usuario_fazenda WHERE usuario_id = auth.uid() AND ativo = true));
DROP POLICY IF EXISTS mov_almox_update_fazenda ON public.movimentacoes_almoxarifado;
CREATE POLICY mov_almox_update_fazenda ON public.movimentacoes_almoxarifado FOR UPDATE TO authenticated
  USING (fazenda_id IN (SELECT fazenda_id FROM public.usuario_fazenda WHERE usuario_id = auth.uid() AND ativo = true));
DROP POLICY IF EXISTS mov_almox_delete_fazenda ON public.movimentacoes_almoxarifado;
CREATE POLICY mov_almox_delete_fazenda ON public.movimentacoes_almoxarifado FOR DELETE TO authenticated
  USING (fazenda_id IN (SELECT fazenda_id FROM public.usuario_fazenda WHERE usuario_id = auth.uid() AND ativo = true));
GRANT ALL ON public.movimentacoes_almoxarifado TO authenticated;

CREATE OR REPLACE FUNCTION public.recalcular_estoque_almoxarifado(p_item_id uuid, p_fazenda_id uuid)
RETURNS void AS $$
DECLARE
  v_saldo numeric(12,3) := 0;
  v_custo numeric(12,4) := 0;
  v_mov record;
BEGIN
  FOR v_mov IN
    SELECT tipo_movimentacao, quantidade, custo_unitario
    FROM public.movimentacoes_almoxarifado
    WHERE item_id = p_item_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
    ORDER BY created_at, id
  LOOP
    IF v_mov.tipo_movimentacao IN ('entrada', 'devolucao') THEN
      IF v_saldo <= 0 THEN
        v_custo := COALESCE(v_mov.custo_unitario, v_custo, 0);
      ELSIF COALESCE(v_mov.custo_unitario, 0) > 0 THEN
        v_custo := ROUND(((v_saldo * v_custo) + (v_mov.quantidade * v_mov.custo_unitario)) / (v_saldo + v_mov.quantidade), 4);
      END IF;
      v_saldo := v_saldo + v_mov.quantidade;
    ELSIF v_mov.tipo_movimentacao IN ('baixa', 'estorno') THEN
      v_saldo := v_saldo - v_mov.quantidade;
    ELSIF v_mov.tipo_movimentacao = 'ajuste' THEN
      v_saldo := v_mov.quantidade;
    END IF;
  END LOOP;

  UPDATE public.itens_almoxarifado
  SET estoque_atual = v_saldo,
      custo_unitario = v_custo,
      custo_total_estoque = ROUND(v_saldo * v_custo, 2),
      updated_at = now()
  WHERE id = p_item_id AND fazenda_id = p_fazenda_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_estoque_almoxarifado()
RETURNS trigger AS $$
BEGIN
  PERFORM public.recalcular_estoque_almoxarifado(COALESCE(NEW.item_id, OLD.item_id), COALESCE(NEW.fazenda_id, OLD.fazenda_id));
  IF TG_OP = 'UPDATE' AND (OLD.item_id IS DISTINCT FROM NEW.item_id OR OLD.fazenda_id IS DISTINCT FROM NEW.fazenda_id) THEN
    PERFORM public.recalcular_estoque_almoxarifado(OLD.item_id, OLD.fazenda_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_update_estoque_almoxarifado ON public.movimentacoes_almoxarifado;
CREATE TRIGGER trg_update_estoque_almoxarifado
  AFTER INSERT OR UPDATE OR DELETE ON public.movimentacoes_almoxarifado
  FOR EACH ROW EXECUTE FUNCTION public.update_estoque_almoxarifado();

CREATE OR REPLACE FUNCTION public.trg_retirada_almoxarifado_mov()
RETURNS trigger AS $$
DECLARE
  v_item jsonb;
  v_item_id uuid;
  v_quantidade numeric;
  v_tipo text;
  v_fazenda_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.itens IS NOT DISTINCT FROM NEW.itens AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at THEN
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE public.movimentacoes_almoxarifado
    SET deleted_at = now(), updated_at = now()
    WHERE registro_origem_id = OLD.id AND deleted_at IS NULL;
  END IF;

  IF TG_OP = 'DELETE' OR NEW.deleted_at IS NOT NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_tipo := COALESCE(NEW.tipo, 'retirada');
  IF v_tipo <> 'retirada' THEN
    RETURN NEW;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.itens, '[]'::jsonb)) LOOP
    BEGIN
      v_item_id := NULLIF(v_item->>'itemId', '')::uuid;
      v_quantidade := REPLACE(COALESCE(v_item->>'quantidade', '0'), ',', '.')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      CONTINUE;
    END;

    IF v_item_id IS NULL OR v_quantidade <= 0 THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.itens_almoxarifado WHERE id = v_item_id AND fazenda_id = NEW.fazenda_id AND controla_estoque = true AND deleted_at IS NULL) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.movimentacoes_almoxarifado (
      fazenda_id, item_id, tipo_movimentacao, quantidade, custo_unitario,
      origem, registro_origem_id, data, observacao
    ) VALUES (
      NEW.fazenda_id, v_item_id, 'baixa', v_quantidade,
      (SELECT custo_unitario FROM public.itens_almoxarifado WHERE id = v_item_id),
      'pwa_retirada', NEW.id, NEW.data::date, NEW.observacao
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

ALTER TABLE public.registros_almoxarifado
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'retirada';
ALTER TABLE public.registros_almoxarifado
  DROP CONSTRAINT IF EXISTS registros_almoxarifado_tipo_check;
ALTER TABLE public.registros_almoxarifado
  ADD CONSTRAINT registros_almoxarifado_tipo_check CHECK (tipo IN ('retirada', 'devolucao'));

DROP TRIGGER IF EXISTS trg_retirada_almoxarifado_mov ON public.registros_almoxarifado;
CREATE TRIGGER trg_retirada_almoxarifado_mov
  AFTER INSERT OR UPDATE OR DELETE ON public.registros_almoxarifado
  FOR EACH ROW EXECUTE FUNCTION public.trg_retirada_almoxarifado_mov();

DROP TRIGGER IF EXISTS trg_mov_almox_updated_at ON public.movimentacoes_almoxarifado;
CREATE TRIGGER trg_mov_almox_updated_at
  BEFORE UPDATE ON public.movimentacoes_almoxarifado
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
