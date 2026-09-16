-- Fase 2: devoluções do almoxarifado registradas no PWA.
-- O banco limita a quantidade que pode voltar ao estoque; excedentes ficam para revisão.

ALTER TABLE public.movimentacoes_almoxarifado
  ADD COLUMN IF NOT EXISTS quantidade_aprovada numeric(12,3),
  ADD COLUMN IF NOT EXISTS requer_revisao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retirada_id uuid REFERENCES public.registros_almoxarifado(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retirada_item_index integer;
UPDATE public.movimentacoes_almoxarifado SET quantidade_aprovada = quantidade WHERE quantidade_aprovada IS NULL;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN quantidade_aprovada SET DEFAULT 0, ALTER COLUMN quantidade_aprovada SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mov_almox_revisao ON public.movimentacoes_almoxarifado(fazenda_id, requer_revisao) WHERE requer_revisao = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mov_almox_retirada ON public.movimentacoes_almoxarifado(retirada_id, retirada_item_index) WHERE retirada_id IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.recalcular_estoque_almoxarifado(p_item_id uuid, p_fazenda_id uuid)
RETURNS void AS $$
DECLARE v_saldo numeric(12,3) := 0; v_custo numeric(12,4) := 0; v_mov record; v_q numeric(12,3);
BEGIN
  FOR v_mov IN SELECT tipo_movimentacao, quantidade, quantidade_aprovada, custo_unitario FROM public.movimentacoes_almoxarifado WHERE item_id = p_item_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL ORDER BY created_at, id LOOP
    v_q := CASE WHEN v_mov.tipo_movimentacao = 'devolucao' THEN COALESCE(v_mov.quantidade_aprovada, 0) ELSE v_mov.quantidade END;
    IF v_mov.tipo_movimentacao IN ('entrada', 'devolucao') THEN
      IF v_saldo <= 0 THEN v_custo := COALESCE(v_mov.custo_unitario, v_custo, 0);
      ELSIF COALESCE(v_mov.custo_unitario, 0) > 0 THEN v_custo := ROUND(((v_saldo * v_custo) + (v_q * v_mov.custo_unitario)) / (v_saldo + v_q), 4); END IF;
      v_saldo := v_saldo + v_q;
    ELSIF v_mov.tipo_movimentacao IN ('baixa', 'estorno') THEN v_saldo := v_saldo - v_mov.quantidade;
    ELSIF v_mov.tipo_movimentacao = 'ajuste' THEN v_saldo := v_mov.quantidade;
    END IF;
  END LOOP;
  UPDATE public.itens_almoxarifado SET estoque_atual = v_saldo, custo_unitario = v_custo, custo_total_estoque = ROUND(v_saldo * v_custo, 2), updated_at = now() WHERE id = p_item_id AND fazenda_id = p_fazenda_id;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.trg_retirada_almoxarifado_mov()
RETURNS trigger AS $$
DECLARE v_item jsonb; v_item_id uuid; v_q numeric; v_aprovada numeric; v_pendente numeric; v_tipo text; v_ret_id uuid; v_ret_idx integer; v_original jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.itens IS NOT DISTINCT FROM NEW.itens AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at AND OLD.tipo IS NOT DISTINCT FROM NEW.tipo THEN RETURN NEW; END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN UPDATE public.movimentacoes_almoxarifado SET deleted_at = now(), updated_at = now() WHERE registro_origem_id = OLD.id AND deleted_at IS NULL; END IF;
  IF TG_OP = 'DELETE' OR NEW.deleted_at IS NOT NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  v_tipo := COALESCE(NEW.tipo, 'retirada');
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.itens, '[]'::jsonb)) LOOP
    BEGIN
      v_item_id := NULLIF(v_item->>'itemId', '')::uuid; v_q := REPLACE(COALESCE(v_item->>'quantidade', '0'), ',', '.')::numeric;
      v_ret_id := NULLIF(v_item->>'retiradaId', '')::uuid; v_ret_idx := NULLIF(v_item->>'retiradaItemIndex', '')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN CONTINUE; END;
    IF v_item_id IS NULL OR v_q <= 0 OR NOT EXISTS (SELECT 1 FROM public.itens_almoxarifado WHERE id = v_item_id AND fazenda_id = NEW.fazenda_id AND controla_estoque AND deleted_at IS NULL) THEN CONTINUE; END IF;
    IF v_tipo = 'retirada' THEN
      INSERT INTO public.movimentacoes_almoxarifado (fazenda_id,item_id,tipo_movimentacao,quantidade,quantidade_aprovada,custo_unitario,origem,registro_origem_id,data,observacao) VALUES (NEW.fazenda_id,v_item_id,'baixa',v_q,v_q,(SELECT custo_unitario FROM public.itens_almoxarifado WHERE id=v_item_id),'pwa_retirada',NEW.id,NEW.data::date,NEW.observacao);
    ELSIF v_tipo = 'devolucao' THEN
      v_pendente := 0;
      IF v_ret_id IS NOT NULL AND v_ret_idx IS NOT NULL THEN
        SELECT x.value INTO v_original FROM public.registros_almoxarifado r, LATERAL jsonb_array_elements(COALESCE(r.itens,'[]'::jsonb)) WITH ORDINALITY x(value,idx) WHERE r.id=v_ret_id AND r.fazenda_id=NEW.fazenda_id AND COALESCE(r.tipo,'retirada')='retirada' AND x.idx-1=v_ret_idx AND (x.value->>'itemId')::uuid=v_item_id;
        IF v_original IS NOT NULL THEN SELECT GREATEST(0,REPLACE(COALESCE(v_original->>'quantidade','0'),',','.')::numeric-COALESCE((SELECT SUM(m.quantidade_aprovada) FROM public.movimentacoes_almoxarifado m WHERE m.retirada_id=v_ret_id AND m.retirada_item_index=v_ret_idx AND m.tipo_movimentacao='devolucao' AND m.deleted_at IS NULL),0)) INTO v_pendente; END IF;
      ELSE
        SELECT GREATEST(0,COALESCE(SUM(REPLACE(COALESCE(i.value->>'quantidade','0'),',','.')::numeric),0)-COALESCE((SELECT SUM(m.quantidade_aprovada) FROM public.movimentacoes_almoxarifado m JOIN public.registros_almoxarifado d ON d.id=m.registro_origem_id WHERE m.fazenda_id=NEW.fazenda_id AND m.item_id=v_item_id AND m.tipo_movimentacao='devolucao' AND m.retirada_id IS NULL AND m.deleted_at IS NULL AND d.quem_pegou=NEW.quem_pegou),0)) INTO v_pendente FROM public.registros_almoxarifado r, LATERAL jsonb_array_elements(COALESCE(r.itens,'[]'::jsonb)) i WHERE r.fazenda_id=NEW.fazenda_id AND COALESCE(r.tipo,'retirada')='retirada' AND r.quem_pegou=NEW.quem_pegou AND r.deleted_at IS NULL AND (i.value->>'itemId')::uuid=v_item_id AND i.value->>'necessitaDevolucao'='S';
      END IF;
      v_aprovada := LEAST(v_q,COALESCE(v_pendente,0));
      INSERT INTO public.movimentacoes_almoxarifado (fazenda_id,item_id,tipo_movimentacao,quantidade,quantidade_aprovada,requer_revisao,custo_unitario,origem,registro_origem_id,retirada_id,retirada_item_index,data,observacao) VALUES (NEW.fazenda_id,v_item_id,'devolucao',v_q,v_aprovada,v_aprovada<v_q,(SELECT custo_unitario FROM public.itens_almoxarifado WHERE id=v_item_id),'pwa_devolucao',NEW.id,v_ret_id,v_ret_idx,NEW.data::date,NEW.observacao);
    END IF;
  END LOOP;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_itens_pendentes_devolucao(p_fazenda_id uuid, p_quem_pegou text DEFAULT NULL)
RETURNS TABLE (item_id uuid,item_nome text,unidade text,retirada_id uuid,retirada_item_index integer,quantidade_pendente numeric,prazo_devolucao text,quem_pegou text) AS $$
BEGIN RETURN QUERY
  SELECT (x.value->>'itemId')::uuid, ia.nome, ia.unidade, r.id, (x.idx-1)::integer,
    GREATEST(0,REPLACE(COALESCE(x.value->>'quantidade','0'),',','.')::numeric-COALESCE((SELECT SUM(m.quantidade_aprovada) FROM public.movimentacoes_almoxarifado m WHERE m.retirada_id=r.id AND m.retirada_item_index=x.idx-1 AND m.tipo_movimentacao='devolucao' AND m.deleted_at IS NULL),0)),
    x.value->>'prazoDevolucao', r.quem_pegou
  FROM public.registros_almoxarifado r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.itens,'[]'::jsonb)) WITH ORDINALITY x(value,idx) JOIN public.itens_almoxarifado ia ON ia.id=(x.value->>'itemId')::uuid
  WHERE r.fazenda_id=p_fazenda_id AND COALESCE(r.tipo,'retirada')='retirada' AND r.deleted_at IS NULL AND x.value->>'necessitaDevolucao'='S' AND (p_quem_pegou IS NULL OR r.quem_pegou=p_quem_pegou)
    AND GREATEST(0,REPLACE(COALESCE(x.value->>'quantidade','0'),',','.')::numeric-COALESCE((SELECT SUM(m.quantidade_aprovada) FROM public.movimentacoes_almoxarifado m WHERE m.retirada_id=r.id AND m.retirada_item_index=x.idx-1 AND m.tipo_movimentacao='devolucao' AND m.deleted_at IS NULL),0)) > 0
  ORDER BY r.data, ia.nome;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.get_itens_pendentes_devolucao(uuid,text) TO authenticated;

DROP TRIGGER IF EXISTS trg_retirada_almoxarifado_mov ON public.registros_almoxarifado;
CREATE TRIGGER trg_retirada_almoxarifado_mov AFTER INSERT OR UPDATE OR DELETE ON public.registros_almoxarifado FOR EACH ROW EXECUTE FUNCTION public.trg_retirada_almoxarifado_mov();

-- Preços são dados administrativos: o PWA usa uma view sem colunas de custo.
DROP POLICY IF EXISTS "Authenticated select itens_almoxarifado" ON public.itens_almoxarifado;
DROP POLICY IF EXISTS "Authenticated insert itens_almoxarifado" ON public.itens_almoxarifado;
DROP POLICY IF EXISTS "Authenticated update itens_almoxarifado" ON public.itens_almoxarifado;
DROP POLICY IF EXISTS "Authenticated delete itens_almoxarifado" ON public.itens_almoxarifado;
CREATE POLICY itens_almox_controller_select ON public.itens_almoxarifado FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.usuario_fazenda uf WHERE uf.usuario_id=auth.uid() AND uf.fazenda_id=itens_almoxarifado.fazenda_id AND uf.papel IN ('admin','controller') AND uf.ativo=true));
CREATE POLICY itens_almox_controller_insert ON public.itens_almoxarifado FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.usuario_fazenda uf WHERE uf.usuario_id=auth.uid() AND uf.fazenda_id=itens_almoxarifado.fazenda_id AND uf.papel IN ('admin','controller') AND uf.ativo=true));
CREATE POLICY itens_almox_controller_update ON public.itens_almoxarifado FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.usuario_fazenda uf WHERE uf.usuario_id=auth.uid() AND uf.fazenda_id=itens_almoxarifado.fazenda_id AND uf.papel IN ('admin','controller') AND uf.ativo=true)) WITH CHECK (EXISTS (SELECT 1 FROM public.usuario_fazenda uf WHERE uf.usuario_id=auth.uid() AND uf.fazenda_id=itens_almoxarifado.fazenda_id AND uf.papel IN ('admin','controller') AND uf.ativo=true));
CREATE POLICY itens_almox_controller_delete ON public.itens_almoxarifado FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.usuario_fazenda uf WHERE uf.usuario_id=auth.uid() AND uf.fazenda_id=itens_almoxarifado.fazenda_id AND uf.papel IN ('admin','controller') AND uf.ativo=true));
DROP VIEW IF EXISTS public.itens_almoxarifado_pwa;
CREATE VIEW public.itens_almoxarifado_pwa AS SELECT id,fazenda_id,nome,classificacao,unidade,estoque_atual,controla_estoque,ativo FROM public.itens_almoxarifado WHERE ativo=true AND deleted_at IS NULL;
GRANT SELECT ON public.itens_almoxarifado_pwa TO authenticated;
