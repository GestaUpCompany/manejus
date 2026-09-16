-- Correção de integridade da devolução agregada (sem vínculo de retirada).
-- Antes: o pendente agregado subtraía apenas devoluções não vinculadas
-- (m.retirada_id IS NULL), ignorando devoluções vinculadas já aprovadas,
-- o que aprovava quantidade além do saldo devolvível real.
-- Também remove o filtro necessitaDevolucao='S' do cálculo de integridade:
-- qualquer item retirado e ainda não devolvido pode retornar (sobra de
-- consumível volta à prateleira). O flag continua governando a lista de
-- pendências exibida pela RPC.
-- A RPC passa a abater devoluções aprovadas sem vínculo das pendências,
-- alocadas por ordem de retirada (mais antiga primeiro).

CREATE OR REPLACE FUNCTION public.trg_retirada_almoxarifado_mov()
RETURNS trigger AS $$
DECLARE v_item jsonb; v_item_id uuid; v_q numeric; v_ok numeric; v_pending numeric; v_tipo text; v_ret_id uuid; v_ret_idx integer; v_orig jsonb;
BEGIN
  IF TG_OP='UPDATE' AND OLD.itens IS NOT DISTINCT FROM NEW.itens AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at AND OLD.tipo IS NOT DISTINCT FROM NEW.tipo THEN RETURN NEW; END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN UPDATE public.movimentacoes_almoxarifado SET deleted_at=now(),updated_at=now() WHERE registro_origem_id=OLD.id AND deleted_at IS NULL; END IF;
  IF TG_OP='DELETE' OR NEW.deleted_at IS NOT NULL THEN RETURN COALESCE(NEW,OLD); END IF;
  v_tipo:=COALESCE(NEW.tipo,'retirada');
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.itens,'[]'::jsonb)) LOOP
    BEGIN v_item_id:=NULLIF(v_item->>'itemId','')::uuid; v_q:=REPLACE(COALESCE(v_item->>'quantidade','0'),',','.')::numeric; v_ret_id:=NULLIF(v_item->>'retiradaId','')::uuid; v_ret_idx:=NULLIF(v_item->>'retiradaItemIndex','')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN CONTINUE; END;
    IF v_item_id IS NULL OR v_q<=0 OR NOT EXISTS (SELECT 1 FROM public.itens_almoxarifado WHERE id=v_item_id AND fazenda_id=NEW.fazenda_id AND controla_estoque AND deleted_at IS NULL) THEN CONTINUE; END IF;
    IF v_tipo='retirada' THEN
      INSERT INTO public.movimentacoes_almoxarifado (fazenda_id,item_id,tipo_movimentacao,quantidade,quantidade_aprovada,custo_unitario,origem,registro_origem_id,data,observacao) VALUES (NEW.fazenda_id,v_item_id,'baixa',v_q,v_q,(SELECT custo_unitario FROM public.itens_almoxarifado WHERE id=v_item_id),'pwa_retirada',NEW.id,NEW.data::date,NEW.observacao);
    ELSIF v_tipo='devolucao' THEN
      v_pending:=0;
      IF v_ret_id IS NOT NULL AND v_ret_idx IS NOT NULL THEN
        SELECT x.value INTO v_orig FROM public.registros_almoxarifado r,LATERAL jsonb_array_elements(COALESCE(r.itens,'[]'::jsonb)) WITH ORDINALITY x(value,idx) WHERE r.id=v_ret_id AND r.fazenda_id=NEW.fazenda_id AND COALESCE(r.tipo,'retirada')='retirada' AND x.idx-1=v_ret_idx AND x.value->>'itemId'=v_item_id::text;
        IF v_orig IS NOT NULL THEN SELECT GREATEST(0,REPLACE(COALESCE(v_orig->>'quantidade','0'),',','.')::numeric-COALESCE((SELECT SUM(m.quantidade_aprovada) FROM public.movimentacoes_almoxarifado m WHERE m.retirada_id=v_ret_id AND m.retirada_item_index=v_ret_idx AND m.tipo_movimentacao='devolucao' AND m.deleted_at IS NULL),0)) INTO v_pending; END IF;
      ELSE
        SELECT GREATEST(0,COALESCE(SUM(REPLACE(COALESCE(i.value->>'quantidade','0'),',','.')::numeric),0)-COALESCE((SELECT SUM(m.quantidade_aprovada) FROM public.movimentacoes_almoxarifado m JOIN public.registros_almoxarifado d ON d.id=m.registro_origem_id WHERE m.fazenda_id=NEW.fazenda_id AND m.item_id=v_item_id AND m.tipo_movimentacao='devolucao' AND m.deleted_at IS NULL AND d.quem_pegou=NEW.quem_pegou),0)) INTO v_pending FROM public.registros_almoxarifado r,LATERAL jsonb_array_elements(COALESCE(r.itens,'[]'::jsonb)) i WHERE r.fazenda_id=NEW.fazenda_id AND COALESCE(r.tipo,'retirada')='retirada' AND r.quem_pegou=NEW.quem_pegou AND r.deleted_at IS NULL AND i.value->>'itemId'=v_item_id::text;
      END IF;
      v_ok:=LEAST(v_q,COALESCE(v_pending,0));
      INSERT INTO public.movimentacoes_almoxarifado (fazenda_id,item_id,tipo_movimentacao,quantidade,quantidade_aprovada,requer_revisao,custo_unitario,origem,registro_origem_id,retirada_id,retirada_item_index,data,observacao) VALUES (NEW.fazenda_id,v_item_id,'devolucao',v_q,v_ok,v_ok<v_q,(SELECT custo_unitario FROM public.itens_almoxarifado WHERE id=v_item_id),'pwa_devolucao',NEW.id,v_ret_id,v_ret_idx,NEW.data::date,NEW.observacao);
    END IF;
  END LOOP;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public;

CREATE OR REPLACE FUNCTION public.get_itens_pendentes_devolucao(p_fazenda_id uuid,p_quem_pegou text DEFAULT NULL)
RETURNS TABLE(item_id uuid,item_nome text,unidade text,retirada_id uuid,retirada_item_index integer,quantidade_pendente numeric,prazo_devolucao text,quem_pegou text) AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT r.id AS rid,(x.idx-1)::integer AS ridx,ia.id AS iid,ia.nome AS inome,ia.unidade AS iun,
           REPLACE(COALESCE(x.value->>'quantidade','0'),',','.')::numeric AS qty,
           x.value->>'prazoDevolucao' AS prazo,r.quem_pegou AS qp,r.data
    FROM public.registros_almoxarifado r
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.itens,'[]'::jsonb)) WITH ORDINALITY x(value,idx)
    JOIN public.itens_almoxarifado ia ON ia.id::text=x.value->>'itemId'
    WHERE r.fazenda_id=p_fazenda_id AND COALESCE(r.tipo,'retirada')='retirada' AND r.deleted_at IS NULL
      AND x.value->>'necessitaDevolucao'='S' AND (p_quem_pegou IS NULL OR r.quem_pegou=p_quem_pegou)
  ),
  linked AS (
    SELECT b.*,GREATEST(0,b.qty-COALESCE((SELECT SUM(m.quantidade_aprovada) FROM public.movimentacoes_almoxarifado m WHERE m.retirada_id=b.rid AND m.retirada_item_index=b.ridx AND m.tipo_movimentacao='devolucao' AND m.deleted_at IS NULL),0)) AS out_i
    FROM base b
  ),
  unl AS (
    SELECT m.item_id AS iid,rd.quem_pegou AS qp,SUM(m.quantidade_aprovada) AS u
    FROM public.movimentacoes_almoxarifado m
    JOIN public.registros_almoxarifado rd ON rd.id=m.registro_origem_id
    WHERE m.fazenda_id=p_fazenda_id AND m.tipo_movimentacao='devolucao' AND m.retirada_id IS NULL AND m.deleted_at IS NULL
      AND (p_quem_pegou IS NULL OR rd.quem_pegou=p_quem_pegou)
    GROUP BY m.item_id,rd.quem_pegou
  ),
  alloc AS (
    SELECT l.*,COALESCE(u.u,0) AS u,SUM(l.out_i) OVER (PARTITION BY l.iid,l.qp ORDER BY l.data,l.rid,l.ridx) AS cum
    FROM linked l LEFT JOIN unl u ON u.iid=l.iid AND u.qp=l.qp
  )
  SELECT a.iid,a.inome,a.iun,a.rid,a.ridx,(GREATEST(0,a.cum-a.u)-GREATEST(0,a.cum-a.out_i-a.u)) AS pend,a.prazo,a.qp
  FROM alloc a
  WHERE (GREATEST(0,a.cum-a.u)-GREATEST(0,a.cum-a.out_i-a.u))>0
  ORDER BY a.data,a.inome;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public;

GRANT EXECUTE ON FUNCTION public.get_itens_pendentes_devolucao(uuid,text) TO authenticated;
