-- Fix: hashtextextended exige (text, seed) e quebrava em runtime. Substitui
-- pelo pg_advisory_xact_lock de dois inteiros com hashtext. Redefine as duas
-- funções com a chamada corrigida (conteúdo idêntico ao da migration 220000
-- corrigida localmente).

CREATE OR REPLACE FUNCTION public.reprocessar_devolucoes_almoxarifado(p_fazenda_id uuid, p_item_id uuid, p_quem_pegou text, p_retirada_id uuid)
RETURNS void AS $$
DECLARE m record; v_avail numeric; v_link numeric; v_new numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_fazenda_id::text || ':' || p_item_id::text), hashtext(COALESCE(p_quem_pegou,'')));
  FOR m IN
    SELECT m2.id, m2.quantidade, m2.quantidade_aprovada, m2.retirada_id, m2.retirada_item_index,
           m2.aprovacao_manual, d.quem_pegou AS person
    FROM public.movimentacoes_almoxarifado m2
    JOIN public.registros_almoxarifado d ON d.id = m2.registro_origem_id
    WHERE m2.fazenda_id = p_fazenda_id AND m2.item_id = p_item_id
      AND m2.tipo_movimentacao = 'devolucao' AND m2.deleted_at IS NULL
      AND (d.quem_pegou = p_quem_pegou OR m2.retirada_id = p_retirada_id)
    ORDER BY m2.created_at, m2.id
  LOOP
    IF m.aprovacao_manual THEN CONTINUE; END IF;
    v_avail := public.saldo_devolvivel_agregado(p_fazenda_id, p_item_id, m.person, m.id);
    IF m.retirada_id IS NOT NULL THEN
      v_link := public.saldo_devolvivel_vinculo(p_fazenda_id, p_item_id, m.retirada_id, m.retirada_item_index, m.id);
      IF v_link IS NOT NULL THEN v_avail := LEAST(v_avail, v_link); END IF;
    END IF;
    v_new := LEAST(m.quantidade, v_avail);
    IF v_new IS DISTINCT FROM m.quantidade_aprovada THEN
      UPDATE public.movimentacoes_almoxarifado
      SET quantidade_aprovada = v_new, requer_revisao = (v_new < m.quantidade), updated_at = now()
      WHERE id = m.id;
    END IF;
  END LOOP;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.trg_retirada_almoxarifado_mov()
RETURNS trigger AS $$
DECLARE
  v_item record; v_item_id uuid; v_q numeric; v_ok numeric; v_pending numeric; v_tipo text;
  v_ret_id uuid; v_ret_idx integer; v_link numeric; v_prev_apr numeric; v_manual boolean;
  v_items uuid[];
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.itens IS NOT DISTINCT FROM NEW.itens
     AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at
     AND OLD.tipo IS NOT DISTINCT FROM NEW.tipo
     AND OLD.quem_pegou IS NOT DISTINCT FROM NEW.quem_pegou THEN RETURN NEW; END IF;

  IF TG_OP IN ('UPDATE','DELETE') THEN
    UPDATE public.movimentacoes_almoxarifado SET deleted_at = now(), updated_at = now()
    WHERE registro_origem_id = OLD.id AND deleted_at IS NULL;
    FOR v_item IN SELECT DISTINCT i.value->>'itemId' AS iid_txt
                  FROM jsonb_array_elements(COALESCE(OLD.itens,'[]'::jsonb)) i LOOP
      BEGIN v_item_id := NULLIF(v_item.iid_txt,'')::uuid; EXCEPTION WHEN invalid_text_representation THEN CONTINUE; END;
      IF v_item_id IS NOT NULL THEN
        PERFORM public.reprocessar_devolucoes_almoxarifado(OLD.fazenda_id, v_item_id, OLD.quem_pegou, OLD.id);
      END IF;
    END LOOP;
  END IF;
  IF TG_OP = 'DELETE' OR NEW.deleted_at IS NOT NULL THEN RETURN COALESCE(NEW,OLD); END IF;

  v_tipo := COALESCE(NEW.tipo,'retirada');
  v_items := '{}';
  FOR v_item IN
    SELECT i.value->>'itemId' AS iid_txt, i.value->>'retiradaId' AS rid_txt, i.value->>'retiradaItemIndex' AS ridx_txt,
           SUM(CASE WHEN COALESCE(i.value->>'quantidade','') ~ '^\d+([.,]\d+)?$' THEN REPLACE(i.value->>'quantidade',',','.')::numeric ELSE 0 END) AS q
    FROM jsonb_array_elements(COALESCE(NEW.itens,'[]'::jsonb)) i
    GROUP BY 1,2,3
  LOOP
    BEGIN
      v_item_id := NULLIF(v_item.iid_txt,'')::uuid;
      v_ret_id := NULLIF(v_item.rid_txt,'')::uuid;
      v_ret_idx := NULLIF(v_item.ridx_txt,'')::integer;
    EXCEPTION WHEN invalid_text_representation THEN CONTINUE; END;
    v_q := v_item.q;
    IF v_item_id IS NULL OR v_q <= 0
       OR NOT EXISTS (SELECT 1 FROM public.itens_almoxarifado
                      WHERE id = v_item_id AND fazenda_id = NEW.fazenda_id AND controla_estoque AND deleted_at IS NULL)
    THEN CONTINUE; END IF;

    PERFORM pg_advisory_xact_lock(hashtext(NEW.fazenda_id::text || ':' || v_item_id::text), hashtext(COALESCE(NEW.quem_pegou,'')));

    IF v_tipo = 'retirada' THEN
      INSERT INTO public.movimentacoes_almoxarifado (fazenda_id,item_id,tipo_movimentacao,quantidade,quantidade_aprovada,custo_unitario,origem,registro_origem_id,data,observacao)
      VALUES (NEW.fazenda_id,v_item_id,'baixa',v_q,v_q,(SELECT custo_unitario FROM public.itens_almoxarifado WHERE id=v_item_id),'pwa_retirada',NEW.id,NEW.data::date,NEW.observacao);
    ELSIF v_tipo = 'devolucao' THEN
      v_pending := public.saldo_devolvivel_agregado(NEW.fazenda_id, v_item_id, NEW.quem_pegou);
      IF v_ret_id IS NOT NULL AND v_ret_idx IS NOT NULL THEN
        v_link := public.saldo_devolvivel_vinculo(NEW.fazenda_id, v_item_id, v_ret_id, v_ret_idx);
        IF v_link IS NOT NULL THEN v_pending := LEAST(v_pending, v_link); END IF;
      END IF;
      v_ok := LEAST(v_q, COALESCE(v_pending,0));

      v_prev_apr := NULL; v_manual := false;
      SELECT mp.quantidade_aprovada INTO v_prev_apr
      FROM public.movimentacoes_almoxarifado mp
      WHERE mp.registro_origem_id = NEW.id AND mp.item_id = v_item_id
        AND mp.tipo_movimentacao = 'devolucao' AND mp.aprovacao_manual
        AND mp.deleted_at IS NOT NULL
        AND mp.retirada_id IS NOT DISTINCT FROM v_ret_id
        AND mp.retirada_item_index IS NOT DISTINCT FROM v_ret_idx
      ORDER BY mp.updated_at DESC LIMIT 1;
      IF v_prev_apr IS NOT NULL THEN v_ok := LEAST(v_q, v_prev_apr); v_manual := true; END IF;

      INSERT INTO public.movimentacoes_almoxarifado (fazenda_id,item_id,tipo_movimentacao,quantidade,quantidade_aprovada,requer_revisao,aprovacao_manual,custo_unitario,origem,registro_origem_id,retirada_id,retirada_item_index,data,observacao)
      VALUES (NEW.fazenda_id,v_item_id,'devolucao',v_q,v_ok,v_ok<v_q,v_manual,(SELECT custo_unitario FROM public.itens_almoxarifado WHERE id=v_item_id),'pwa_devolucao',NEW.id,v_ret_id,v_ret_idx,NEW.data::date,NEW.observacao);
    END IF;
    v_items := v_items || v_item_id;
  END LOOP;

  FOREACH v_item_id IN ARRAY v_items LOOP
    PERFORM public.reprocessar_devolucoes_almoxarifado(NEW.fazenda_id, v_item_id, NEW.quem_pegou, NEW.id);
  END LOOP;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
