-- Estoque da farmácia (medicamentos e vacinas): molde da cantina (20260922190000).
--
-- 1) medicamentos ganha unidade/saldo/mínimo/custo médio/controla_estoque.
-- 2) movimentacoes_farmacia é o ledger (entrada, baixa, ajuste, estorno);
--    recalcular_estoque_farmacia recalcula saldo e custo médio (WAC) do zero a
--    cada mudança, então tolera sync atrasado e fora de ordem (ordena por data).
-- 3) Baixa idempotente por (registro_origem_id, medicamento_id, tipo) para a
--    fase 2 (baixa automática pela Enfermaria).
-- 4) RLS: leitura/inserção/edição para quem tem acesso à fazenda (gestão ou
--    peão, via caller_has_fazenda_access, pois o PWA grava entradas e saídas);
--    exclusão só admin/controller. Escrita no catálogo medicamentos passa a
--    exigir admin/controller (antes: qualquer authenticated). A leitura de
--    medicamentos NÃO muda (PWA e anon continuam lendo).
-- Rollback: supabase/rollbacks/20261021100000_farmacia_estoque_rollback.sql

ALTER TABLE public.medicamentos
  ADD COLUMN IF NOT EXISTS unidade text NOT NULL DEFAULT 'un',
  ADD COLUMN IF NOT EXISTS estoque_atual numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_minimo numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_unitario numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_total_estoque numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS controla_estoque boolean NOT NULL DEFAULT false;

ALTER TABLE public.medicamentos
  DROP CONSTRAINT IF EXISTS medicamentos_estoque_minimo_check;
ALTER TABLE public.medicamentos
  ADD CONSTRAINT medicamentos_estoque_minimo_check CHECK (estoque_minimo >= 0);

-- Escrita no catálogo: só gestão da fazenda.
DROP POLICY IF EXISTS "Enable delete for all authenticated users" ON public.medicamentos;
DROP POLICY IF EXISTS "Enable insert for all authenticated users" ON public.medicamentos;
DROP POLICY IF EXISTS "Enable update for all authenticated users" ON public.medicamentos;
CREATE POLICY medicamentos_gestao_insert ON public.medicamentos FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user() OR EXISTS (SELECT 1 FROM public.usuario_fazenda uf WHERE uf.usuario_id = auth.uid() AND uf.fazenda_id = medicamentos.fazenda_id AND uf.papel IN ('admin','controller') AND uf.ativo = true));
CREATE POLICY medicamentos_gestao_update ON public.medicamentos FOR UPDATE TO authenticated
  USING (public.is_admin_user() OR EXISTS (SELECT 1 FROM public.usuario_fazenda uf WHERE uf.usuario_id = auth.uid() AND uf.fazenda_id = medicamentos.fazenda_id AND uf.papel IN ('admin','controller') AND uf.ativo = true))
  WITH CHECK (public.is_admin_user() OR EXISTS (SELECT 1 FROM public.usuario_fazenda uf WHERE uf.usuario_id = auth.uid() AND uf.fazenda_id = medicamentos.fazenda_id AND uf.papel IN ('admin','controller') AND uf.ativo = true));
CREATE POLICY medicamentos_gestao_delete ON public.medicamentos FOR DELETE TO authenticated
  USING (public.is_admin_user() OR EXISTS (SELECT 1 FROM public.usuario_fazenda uf WHERE uf.usuario_id = auth.uid() AND uf.fazenda_id = medicamentos.fazenda_id AND uf.papel IN ('admin','controller') AND uf.ativo = true));

CREATE TABLE IF NOT EXISTS public.movimentacoes_farmacia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  medicamento_id uuid NOT NULL REFERENCES public.medicamentos(id),
  tipo_movimentacao text NOT NULL CHECK (tipo_movimentacao IN ('entrada', 'baixa', 'ajuste', 'estorno')),
  quantidade numeric(12,3) NOT NULL CHECK (quantidade >= 0),
  custo_unitario numeric(12,4),
  valor_total numeric(12,2),
  origem text,
  registro_origem_id uuid,
  data date NOT NULL DEFAULT CURRENT_DATE,
  fornecedor text,
  nota_fiscal text,
  lote_produto text,
  validade date,
  observacao text,
  unidade text,
  nome_usuario text,
  local_id text,
  sync_status text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_mov_farmacia_fazenda ON public.movimentacoes_farmacia(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_mov_farmacia_med ON public.movimentacoes_farmacia(medicamento_id, data);
CREATE INDEX IF NOT EXISTS idx_mov_farmacia_data ON public.movimentacoes_farmacia(data);
CREATE INDEX IF NOT EXISTS idx_mov_farmacia_origem ON public.movimentacoes_farmacia(registro_origem_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mov_farmacia_local_id
  ON public.movimentacoes_farmacia(local_id) WHERE local_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mov_farmacia_registro_med_tipo_ativo
  ON public.movimentacoes_farmacia(registro_origem_id, medicamento_id, tipo_movimentacao)
  WHERE registro_origem_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.movimentacoes_farmacia ENABLE ROW LEVEL SECURITY;
CREATE POLICY mov_farmacia_select ON public.movimentacoes_farmacia FOR SELECT TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));
CREATE POLICY mov_farmacia_insert ON public.movimentacoes_farmacia FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));
CREATE POLICY mov_farmacia_update ON public.movimentacoes_farmacia FOR UPDATE TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));
CREATE POLICY mov_farmacia_delete ON public.movimentacoes_farmacia FOR DELETE TO authenticated
  USING (public.is_admin_user() OR EXISTS (SELECT 1 FROM public.usuario_fazenda uf WHERE uf.usuario_id = auth.uid() AND uf.fazenda_id = movimentacoes_farmacia.fazenda_id AND uf.papel IN ('admin','controller') AND uf.ativo = true));
GRANT ALL ON public.movimentacoes_farmacia TO authenticated;

CREATE OR REPLACE FUNCTION public.recalcular_estoque_farmacia(p_medicamento_id uuid, p_fazenda_id uuid)
RETURNS void AS $$
DECLARE
  v_saldo numeric(12,3) := 0;
  v_custo numeric(12,4) := 0;
  v_mov record;
BEGIN
  FOR v_mov IN
    SELECT tipo_movimentacao, quantidade, custo_unitario
    FROM public.movimentacoes_farmacia
    WHERE medicamento_id = p_medicamento_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
    ORDER BY data, created_at, id
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

  UPDATE public.medicamentos
  SET estoque_atual = v_saldo,
      custo_unitario = v_custo,
      custo_total_estoque = ROUND(v_saldo * v_custo, 2),
      updated_at = now()
  WHERE id = p_medicamento_id AND fazenda_id = p_fazenda_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_estoque_farmacia()
RETURNS trigger AS $$
BEGIN
  PERFORM public.recalcular_estoque_farmacia(COALESCE(NEW.medicamento_id, OLD.medicamento_id), COALESCE(NEW.fazenda_id, OLD.fazenda_id));
  IF TG_OP = 'UPDATE' AND (OLD.medicamento_id IS DISTINCT FROM NEW.medicamento_id OR OLD.fazenda_id IS DISTINCT FROM NEW.fazenda_id) THEN
    PERFORM public.recalcular_estoque_farmacia(OLD.medicamento_id, OLD.fazenda_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_update_estoque_farmacia
  AFTER INSERT OR UPDATE OR DELETE ON public.movimentacoes_farmacia
  FOR EACH ROW EXECUTE FUNCTION public.update_estoque_farmacia();

CREATE OR REPLACE FUNCTION public.mov_farmacia_snapshot_unidade()
RETURNS trigger AS $$
BEGIN
  IF NEW.unidade IS NULL THEN
    SELECT unidade INTO NEW.unidade
    FROM public.medicamentos
    WHERE id = NEW.medicamento_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mov_farmacia_snapshot_unidade
  BEFORE INSERT OR UPDATE ON public.movimentacoes_farmacia
  FOR EACH ROW EXECUTE FUNCTION public.mov_farmacia_snapshot_unidade();

CREATE TRIGGER trg_mov_farmacia_updated_at
  BEFORE UPDATE ON public.movimentacoes_farmacia
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
