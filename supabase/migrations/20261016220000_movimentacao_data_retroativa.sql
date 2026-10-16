-- Movimentação retroativa: calculate_quant_atual só soma registros com
-- data >= lote_categorias.created_at, então uma entrada/saída datada antes da
-- criação da categoria era gravada mas ficava fora da contagem, sem aviso.
-- 1) BEFORE INSERT: se a data for anterior ao corte, grava now() e preserva a
--    data original na coluna data_informada.
-- 2) AFTER UPDATE: editar data/cabeças/lotes/categoria/deleted_at passa a
--    recalcular quant_atual (antes só o INSERT recalculava). O peso não é
--    reponderado no UPDATE (evita ponderar duas vezes).
-- (Arquivo restaurado em 16/10/2026 a partir de supabase_migrations.schema_migrations: o original sumiu do disco.)

-- Data que o usuário informou quando ela foi ajustada (nula = sem ajuste).
ALTER TABLE public.registros_movimentacao ADD COLUMN IF NOT EXISTS data_informada timestamptz;

COMMENT ON COLUMN public.registros_movimentacao.data_informada IS
  'Data informada pelo usuário quando anterior ao corte da categoria e por isso substituída por now() em data. Nula = sem ajuste.';

CREATE OR REPLACE FUNCTION public.trg_movimentacao_ajusta_data()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_corte timestamptz;
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.categoria IS NULL OR NEW.data IS NULL
     OR (NEW.lote_origem_id IS NULL AND NEW.lote_destino_id IS NULL) THEN
    RETURN NEW;
  END IF;

  -- Mesmo corte de calculate_quant_atual: created_at da categoria ativa, salvo
  -- quando ela não tem base (quant_base/quant_inicial nulos => corte 1900).
  SELECT MAX(created_at) INTO v_corte
  FROM lote_categorias
  WHERE ativo = true
    AND LOWER(categoria) = LOWER(NEW.categoria)
    AND lote_id IN (NEW.lote_origem_id, NEW.lote_destino_id)
    AND COALESCE(quant_base, quant_inicial) IS NOT NULL;

  IF v_corte IS NOT NULL AND NEW.data < v_corte THEN
    NEW.data_informada := NEW.data;
    NEW.data := now();
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_aa_movimentacao_ajusta_data ON public.registros_movimentacao;

CREATE TRIGGER trigger_aa_movimentacao_ajusta_data
  BEFORE INSERT ON public.registros_movimentacao
  FOR EACH ROW EXECUTE FUNCTION public.trg_movimentacao_ajusta_data();

CREATE OR REPLACE FUNCTION public.trg_movimentacao_recalc_quant_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
BEGIN
  IF NEW.data IS NOT DISTINCT FROM OLD.data
     AND NEW.numero_cabecas IS NOT DISTINCT FROM OLD.numero_cabecas
     AND NEW.lote_origem_id IS NOT DISTINCT FROM OLD.lote_origem_id
     AND NEW.lote_destino_id IS NOT DISTINCT FROM OLD.lote_destino_id
     AND NEW.categoria IS NOT DISTINCT FROM OLD.categoria
     AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN
    RETURN NEW;
  END IF;

  -- Lotes/categorias antigos e novos (a edição pode ter trocado lote ou categoria).
  UPDATE lote_categorias lc
  SET quant_atual = calculate_quant_atual(lc.lote_id, lc.categoria)
  WHERE lc.ativo = true
    AND (
      (lc.lote_id IN (OLD.lote_origem_id, OLD.lote_destino_id) AND LOWER(lc.categoria) = LOWER(OLD.categoria))
      OR (lc.lote_id IN (NEW.lote_origem_id, NEW.lote_destino_id) AND LOWER(lc.categoria) = LOWER(NEW.categoria))
    );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_movimentacao_recalc_quant_update ON public.registros_movimentacao;

CREATE TRIGGER trigger_movimentacao_recalc_quant_update
  AFTER UPDATE OF data, numero_cabecas, lote_origem_id, lote_destino_id, categoria, deleted_at
  ON public.registros_movimentacao
  FOR EACH ROW EXECUTE FUNCTION public.trg_movimentacao_recalc_quant_update();
