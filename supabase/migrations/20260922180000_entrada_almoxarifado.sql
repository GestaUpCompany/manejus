-- Entrada de estoque do almoxarifado registrada pelo PWA.
--
-- Um registro com tipo='entrada' gera movimentacoes 'entrada' por item com
-- controla_estoque=true, espelhando o fluxo de retirada. quem_recebeu guarda
-- quem recebeu a mercadoria (entrada nao usa quem_entregou/quem_pegou).
-- custo_unitario vai NULL: o recalculo preserva o custo medio vigente
-- (guard COALESCE(v_mov.custo_unitario,0) > 0 em recalcular_estoque_almoxarifado).

ALTER TABLE public.registros_almoxarifado
  ADD COLUMN IF NOT EXISTS quem_recebeu text;

ALTER TABLE public.registros_almoxarifado
  DROP CONSTRAINT IF EXISTS registros_almoxarifado_tipo_check;
ALTER TABLE public.registros_almoxarifado
  ADD CONSTRAINT registros_almoxarifado_tipo_check
  CHECK (tipo IN ('retirada','devolucao','entrada'));

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
    -- Reprocessa devoluções afetadas pela mudança/remoção da retirada.
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
    ELSIF v_tipo = 'entrada' THEN
      -- Entrada de estoque pelo PWA: sem custo capturado, o WAC vigente é preservado.
      INSERT INTO public.movimentacoes_almoxarifado (fazenda_id,item_id,tipo_movimentacao,quantidade,quantidade_aprovada,origem,registro_origem_id,data,observacao)
      VALUES (NEW.fazenda_id,v_item_id,'entrada',v_q,v_q,'pwa_entrada',NEW.id,NEW.data::date,NEW.observacao);
    ELSIF v_tipo = 'devolucao' THEN
      v_pending := public.saldo_devolvivel_agregado(NEW.fazenda_id, v_item_id, NEW.quem_pegou);
      IF v_ret_id IS NOT NULL AND v_ret_idx IS NOT NULL THEN
        v_link := public.saldo_devolvivel_vinculo(NEW.fazenda_id, v_item_id, v_ret_id, v_ret_idx);
        -- Vínculo resolvível limita pelo pendente daquela retirada; vínculo que
        -- não resolve (retirada ainda não sincronizada) cai no agregado.
        IF v_link IS NOT NULL THEN v_pending := LEAST(v_pending, v_link); END IF;
      END IF;
      v_ok := LEAST(v_q, COALESCE(v_pending,0));

      -- Preserva incorporação manual do controller em re-sincronizações.
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

  -- A retirada recém-registrada pode liberar devoluções retidas que chegaram antes.
  -- Entradas não alteram pendências de devolução, então não reprocessam nada.
  IF v_tipo <> 'entrada' THEN
    FOREACH v_item_id IN ARRAY v_items LOOP
      PERFORM public.reprocessar_devolucoes_almoxarifado(NEW.fazenda_id, v_item_id, NEW.quem_pegou, NEW.id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
