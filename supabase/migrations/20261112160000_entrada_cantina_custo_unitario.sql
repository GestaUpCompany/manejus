-- Entrada de cantina pelo PWA passa a levar o custo unitário digitado no item.
--
-- O PWA grava em registros_alimentacao.itens_detalhe, por item, custo_unitario
-- (R$ por unidade do item) e valor_total (quantidade × custo_unitario).
-- Antes, trg_alimentacao_mov copiava o custo_unitario vigente de itens_cantina
-- para a movimentação de entrada, ignorando o custo informado.
--
-- Regra nova (só modo='entrada'):
--   - custo do item no JSON > 0  → movimentação usa esse custo e valor_total;
--   - sem custo no JSON (registros antigos do PWA) → mantém o comportamento
--     anterior (custo vigente do item).
-- Baixas (modo='cantina') continuam usando o custo médio vigente.
-- recalcular_estoque_cantina não muda: já recalcula o WAC a partir de
-- movimentacoes_cantina.custo_unitario.

CREATE OR REPLACE FUNCTION public.trg_alimentacao_mov()
RETURNS trigger AS $$
DECLARE
  v_item record; v_item_id uuid; v_q numeric; v_c numeric; v_modo text;
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
           SUM(CASE WHEN COALESCE(i.value->>'quantidade','') ~ '^\d+([.,]\d+)?$' THEN REPLACE(i.value->>'quantidade',',','.')::numeric ELSE 0 END) AS q,
           MAX(CASE WHEN COALESCE(i.value->>'custo_unitario','') ~ '^\d+(\.\d+)?$' THEN (i.value->>'custo_unitario')::numeric END) AS c
    FROM jsonb_array_elements(COALESCE(NEW.itens_detalhe,'[]'::jsonb)) i
    GROUP BY 1
  LOOP
    BEGIN
      v_item_id := NULLIF(v_item.iid_txt,'')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN CONTINUE; END;
    v_q := v_item.q;
    v_c := v_item.c;
    IF v_item_id IS NULL OR v_q <= 0
       OR NOT EXISTS (SELECT 1 FROM public.itens_cantina
                      WHERE id = v_item_id AND fazenda_id = NEW.fazenda_id AND controla_estoque AND deleted_at IS NULL)
    THEN CONTINUE; END IF;

    IF v_modo = 'entrada' AND COALESCE(v_c, 0) > 0 THEN
      INSERT INTO public.movimentacoes_cantina (fazenda_id,item_id,tipo_movimentacao,quantidade,custo_unitario,valor_total,origem,registro_origem_id,data,observacao)
      VALUES (NEW.fazenda_id, v_item_id, 'entrada', v_q, v_c, ROUND(v_q * v_c, 2),
              'pwa_entrada', NEW.id, NEW.data::date, NEW.observacao);
    ELSE
      INSERT INTO public.movimentacoes_cantina (fazenda_id,item_id,tipo_movimentacao,quantidade,custo_unitario,origem,registro_origem_id,data,observacao)
      VALUES (NEW.fazenda_id, v_item_id,
              CASE WHEN v_modo = 'entrada' THEN 'entrada' ELSE 'baixa' END,
              v_q,
              (SELECT custo_unitario FROM public.itens_cantina WHERE id = v_item_id),
              CASE WHEN v_modo = 'entrada' THEN 'pwa_entrada' ELSE 'pwa_cantina' END,
              NEW.id, NEW.data::date, NEW.observacao);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
