-- Rollback de 20261021100000_farmacia_estoque.sql
-- Atenção: apaga o ledger movimentacoes_farmacia e o saldo/custo de medicamentos.
DROP TABLE IF EXISTS public.movimentacoes_farmacia;
DROP FUNCTION IF EXISTS public.update_estoque_farmacia();
DROP FUNCTION IF EXISTS public.recalcular_estoque_farmacia(uuid, uuid);
DROP FUNCTION IF EXISTS public.mov_farmacia_snapshot_unidade();

DROP POLICY IF EXISTS medicamentos_gestao_insert ON public.medicamentos;
DROP POLICY IF EXISTS medicamentos_gestao_update ON public.medicamentos;
DROP POLICY IF EXISTS medicamentos_gestao_delete ON public.medicamentos;
CREATE POLICY "Enable delete for all authenticated users" ON public.medicamentos FOR DELETE TO authenticated USING (true);
CREATE POLICY "Enable insert for all authenticated users" ON public.medicamentos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for all authenticated users" ON public.medicamentos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.medicamentos DROP CONSTRAINT IF EXISTS medicamentos_estoque_minimo_check;
ALTER TABLE public.medicamentos
  DROP COLUMN IF EXISTS unidade,
  DROP COLUMN IF EXISTS estoque_atual,
  DROP COLUMN IF EXISTS estoque_minimo,
  DROP COLUMN IF EXISTS custo_unitario,
  DROP COLUMN IF EXISTS custo_total_estoque,
  DROP COLUMN IF EXISTS controla_estoque;
