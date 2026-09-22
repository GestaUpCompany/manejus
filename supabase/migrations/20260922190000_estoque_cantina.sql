-- Estoque da cantina: espelha a infraestrutura do almoxarifado.
--
-- 1) itens_cantina ganha saldo/custo/controla_estoque.
-- 2) itens_cantina_pwa expõe o catálogo sem custo para o PWA, como
--    itens_almoxarifado_pwa. As policies da tabela ficam restritas a
--    admin/controller (mesma correção aplicada ao almoxarifado: custo_unitario
--    não pode vazar para qualquer vínculo da fazenda).
-- 3) movimentacoes_cantina é o ledger; recalcular_estoque_cantina recalcula
--    saldo e custo médio (WAC) igual ao almoxarifado.
-- 4) registros_alimentacao ganha quem_recebeu e itens_detalhe (jsonb array com
--    itemId por item — a coluna itens segue sendo o mapa nome->qtd usado nas
--    telas). modo='entrada' gera movimentações 'entrada'; modo='cantina' gera
--    'baixa'; 'marmita' não movimenta estoque.
--    Registros antigos sem itens_detalhe não geram movimentação retroativa.

ALTER TABLE public.itens_cantina
  ADD COLUMN IF NOT EXISTS estoque_atual numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_minimo numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_unitario numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_total_estoque numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS controla_estoque boolean NOT NULL DEFAULT false;

ALTER TABLE public.itens_cantina
  DROP CONSTRAINT IF EXISTS itens_cantina_estoque_minimo_check;
ALTER TABLE public.itens_cantina
  ADD CONSTRAINT itens_cantina_estoque_minimo_check CHECK (estoque_minimo >= 0);

CREATE OR REPLACE VIEW public.itens_cantina_pwa AS
  SELECT id, fazenda_id, nome, classificacao, unidade_medida,
         estoque_atual, controla_estoque, ativo
  FROM public.itens_cantina
  WHERE ativo = true AND deleted_at IS NULL;
GRANT SELECT ON public.itens_cantina_pwa TO authenticated;

DROP POLICY IF EXISTS "Authenticated select itens_cantina" ON public.itens_cantina;
DROP POLICY IF EXISTS "Authenticated insert itens_cantina" ON public.itens_cantina;
DROP POLICY IF EXISTS "Authenticated update itens_cantina" ON public.itens_cantina;
DROP POLICY IF EXISTS "Authenticated delete itens_cantina" ON public.itens_cantina;
CREATE POLICY itens_cantina_controller_select ON public.itens_cantina FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.usuario_fazenda uf WHERE uf.usuario_id = auth.uid() AND uf.fazenda_id = itens_cantina.fazenda_id AND uf.papel IN ('admin','controller') AND uf.ativo = true));
CREATE POLICY itens_cantina_controller_insert ON public.itens_cantina FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuario_fazenda uf WHERE uf.usuario_id = auth.uid() AND uf.fazenda_id = itens_cantina.fazenda_id AND uf.papel IN ('admin','controller') AND uf.ativo = true));
CREATE POLICY itens_cantina_controller_update ON public.itens_cantina FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.usuario_fazenda uf WHERE uf.usuario_id = auth.uid() AND uf.fazenda_id = itens_cantina.fazenda_id AND uf.papel IN ('admin','controller') AND uf.ativo = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuario_fazenda uf WHERE uf.usuario_id = auth.uid() AND uf.fazenda_id = itens_cantina.fazenda_id AND uf.papel IN ('admin','controller') AND uf.ativo = true));
CREATE POLICY itens_cantina_controller_delete ON public.itens_cantina FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.usuario_fazenda uf WHERE uf.usuario_id = auth.uid() AND uf.fazenda_id = itens_cantina.fazenda_id AND uf.papel IN ('admin','controller') AND uf.ativo = true));

CREATE TABLE IF NOT EXISTS public.movimentacoes_cantina (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.itens_cantina(id),
  tipo_movimentacao text NOT NULL CHECK (tipo_movimentacao IN ('entrada', 'baixa', 'ajuste', 'estorno')),
  quantidade numeric(12,3) NOT NULL CHECK (quantidade >= 0),
  custo_unitario numeric(12,4),
  valor_total numeric(12,2),
  origem text,
  registro_origem_id uuid REFERENCES public.registros_alimentacao(id) ON DELETE SET NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  fornecedor text,
  observacao text,
  unidade text,
  local_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_mov_cantina_fazenda ON public.movimentacoes_cantina(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_mov_cantina_item ON public.movimentacoes_cantina(item_id, data);
CREATE INDEX IF NOT EXISTS idx_mov_cantina_data ON public.movimentacoes_cantina(data);
CREATE INDEX IF NOT EXISTS idx_mov_cantina_origem ON public.movimentacoes_cantina(registro_origem_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mov_cantina_local_id
  ON public.movimentacoes_cantina(local_id) WHERE local_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mov_cantina_registro_item_tipo_ativo
  ON public.movimentacoes_cantina(registro_origem_id, item_id, tipo_movimentacao)
  WHERE registro_origem_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.movimentacoes_cantina ENABLE ROW LEVEL SECURITY;
CREATE POLICY mov_cantina_select_fazenda ON public.movimentacoes_cantina FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.usuario_fazenda uf WHERE uf.usuario_id = auth.uid() AND uf.fazenda_id = movimentacoes_cantina.fazenda_id AND uf.papel IN ('admin','controller') AND uf.ativo = true));
CREATE POLICY mov_cantina_insert_fazenda ON public.movimentacoes_cantina FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuario_fazenda uf WHERE uf.usuario_id = auth.uid() AND uf.fazenda_id = movimentacoes_cantina.fazenda_id AND uf.papel IN ('admin','controller') AND uf.ativo = true));
CREATE POLICY mov_cantina_update_fazenda ON public.movimentacoes_cantina FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.usuario_fazenda uf WHERE uf.usuario_id = auth.uid() AND uf.fazenda_id = movimentacoes_cantina.fazenda_id AND uf.papel IN ('admin','controller') AND uf.ativo = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuario_fazenda uf WHERE uf.usuario_id = auth.uid() AND uf.fazenda_id = movimentacoes_cantina.fazenda_id AND uf.papel IN ('admin','controller') AND uf.ativo = true));
CREATE POLICY mov_cantina_delete_fazenda ON public.movimentacoes_cantina FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.usuario_fazenda uf WHERE uf.usuario_id = auth.uid() AND uf.fazenda_id = movimentacoes_cantina.fazenda_id AND uf.papel IN ('admin','controller') AND uf.ativo = true));
GRANT ALL ON public.movimentacoes_cantina TO authenticated;

CREATE OR REPLACE FUNCTION public.recalcular_estoque_cantina(p_item_id uuid, p_fazenda_id uuid)
RETURNS void AS $$
DECLARE
  v_saldo numeric(12,3) := 0;
  v_custo numeric(12,4) := 0;
  v_mov record;
BEGIN
  FOR v_mov IN
    SELECT tipo_movimentacao, quantidade, custo_unitario
    FROM public.movimentacoes_cantina
    WHERE item_id = p_item_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
    ORDER BY created_at, id
  LOOP
    IF v_mov.tipo_movimentacao = 'entrada' THEN
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

  UPDATE public.itens_cantina
  SET estoque_atual = v_saldo,
      custo_unitario = v_custo,
      custo_total_estoque = ROUND(v_saldo * v_custo, 2),
      updated_at = now()
  WHERE id = p_item_id AND fazenda_id = p_fazenda_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_estoque_cantina()
RETURNS trigger AS $$
BEGIN
  PERFORM public.recalcular_estoque_cantina(COALESCE(NEW.item_id, OLD.item_id), COALESCE(NEW.fazenda_id, OLD.fazenda_id));
  IF TG_OP = 'UPDATE' AND (OLD.item_id IS DISTINCT FROM NEW.item_id OR OLD.fazenda_id IS DISTINCT FROM NEW.fazenda_id) THEN
    PERFORM public.recalcular_estoque_cantina(OLD.item_id, OLD.fazenda_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_update_estoque_cantina
  AFTER INSERT OR UPDATE OR DELETE ON public.movimentacoes_cantina
  FOR EACH ROW EXECUTE FUNCTION public.update_estoque_cantina();

CREATE OR REPLACE FUNCTION public.mov_cantina_snapshot_unidade()
RETURNS trigger AS $$
BEGIN
  IF NEW.unidade IS NULL THEN
    SELECT unidade_medida INTO NEW.unidade
    FROM public.itens_cantina
    WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mov_cantina_snapshot_unidade
  BEFORE INSERT OR UPDATE ON public.movimentacoes_cantina
  FOR EACH ROW EXECUTE FUNCTION public.mov_cantina_snapshot_unidade();

CREATE TRIGGER trg_mov_cantina_updated_at
  BEFORE UPDATE ON public.movimentacoes_cantina
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.registros_alimentacao
  ADD COLUMN IF NOT EXISTS quem_recebeu text,
  ADD COLUMN IF NOT EXISTS itens_detalhe jsonb;

ALTER TABLE public.registros_alimentacao
  DROP CONSTRAINT IF EXISTS registros_cantina_modo_check;
ALTER TABLE public.registros_alimentacao
  ADD CONSTRAINT registros_cantina_modo_check
  CHECK (modo IN ('cantina','marmita','entrada'));

CREATE OR REPLACE FUNCTION public.trg_alimentacao_mov()
RETURNS trigger AS $$
DECLARE
  v_item record; v_item_id uuid; v_q numeric; v_modo text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.itens_detalhe IS NOT DISTINCT FROM NEW.itens_detalhe
     AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at
     AND OLD.modo IS NOT DISTINCT FROM NEW.modo THEN RETURN NEW; END IF;

  IF TG_OP IN ('UPDATE','DELETE') THEN
    UPDATE public.movimentacoes_cantina SET deleted_at = now(), updated_at = now()
    WHERE registro_origem_id = OLD.id AND deleted_at IS NULL;
  END IF;
  IF TG_OP = 'DELETE' OR NEW.deleted_at IS NOT NULL THEN RETURN COALESCE(NEW,OLD); END IF;

  v_modo := COALESCE(NEW.modo,'cantina');
  IF v_modo NOT IN ('cantina','entrada') THEN RETURN NEW; END IF;

  FOR v_item IN
    SELECT i.value->>'itemId' AS iid_txt,
           SUM(CASE WHEN COALESCE(i.value->>'quantidade','') ~ '^\d+([.,]\d+)?$' THEN REPLACE(i.value->>'quantidade',',','.')::numeric ELSE 0 END) AS q
    FROM jsonb_array_elements(COALESCE(NEW.itens_detalhe,'[]'::jsonb)) i
    GROUP BY 1
  LOOP
    BEGIN
      v_item_id := NULLIF(v_item.iid_txt,'')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN CONTINUE; END;
    v_q := v_item.q;
    IF v_item_id IS NULL OR v_q <= 0
       OR NOT EXISTS (SELECT 1 FROM public.itens_cantina
                      WHERE id = v_item_id AND fazenda_id = NEW.fazenda_id AND controla_estoque AND deleted_at IS NULL)
    THEN CONTINUE; END IF;

    INSERT INTO public.movimentacoes_cantina (fazenda_id,item_id,tipo_movimentacao,quantidade,custo_unitario,origem,registro_origem_id,data,observacao)
    VALUES (NEW.fazenda_id, v_item_id,
            CASE WHEN v_modo = 'entrada' THEN 'entrada' ELSE 'baixa' END,
            v_q,
            (SELECT custo_unitario FROM public.itens_cantina WHERE id = v_item_id),
            CASE WHEN v_modo = 'entrada' THEN 'pwa_entrada' ELSE 'pwa_cantina' END,
            NEW.id, NEW.data::date, NEW.observacao);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_alimentacao_mov
  AFTER INSERT OR UPDATE OR DELETE ON public.registros_alimentacao
  FOR EACH ROW EXECUTE FUNCTION public.trg_alimentacao_mov();
