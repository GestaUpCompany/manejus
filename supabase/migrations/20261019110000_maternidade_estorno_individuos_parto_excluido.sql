-- ============================================================================
-- Maternidade: excluir um parto estorna a cria criada por ele (se sem outro uso)
-- ============================================================================
-- Achado (16/10/2026): todos os gatilhos de registros_maternidade são AFTER INSERT. Excluir um parto
-- (deleted_at) não desfazia o indivíduo que ele criou. Caso real: Fazenda Marcon, 28 partos excluídos
-- em 27/08 deixaram 56 indivíduos Vivos (28 mães + 28 crias) que o agregado nunca contou.
--
-- Ação: gatilho AFTER UPDATE (deleted_at passa de NULL para preenchido), no mesmo padrão do estorno da morte
-- (trg_registros_morte_baixa_individuo). Marca deleted_at (soft-delete, reversível) na CRIA do parto
-- (individuo_id_cria): origem 'Nascimento', Vivo, criada até 2 min do registro do parto, e somente se o animal
-- NÃO tiver nenhum outro uso: nenhum evento ativo em aplicações sanitárias, eventos reprodutivos (como fêmea ou
-- touro), enfermaria, manejo de curral, morte, movimentação, pesagem, ponte evento_individuos, pendências de
-- designação ou histórico de lote; nenhum outro parto ativo que o cite (como mãe, cria ou mãe adotiva);
-- nenhum filho ativo (mae, mae_adotiva_id ou pai).
--
-- Decisão do gestor (19/10/2026): a MÃE nunca é estornada por este gatilho. Ela pode ser uma vaca real cadastrada
-- pela primeira vez dentro de um parto lançado errado; a exclusão da mãe fica manual (como foi feito com a Marcon).
--
-- NÃO altera o agregado: lote_categorias.quant_atual não depende de individuos (a contagem do nascimento
-- vem de registros_maternidade em calculate_quant_atual, que já ignora partos excluídos; este gatilho não
-- recalcula quant_atual, como também não recalculava antes). Não corrige partos já excluídos no passado.
-- Reativar um parto (deleted_at volta a NULL) não restaura o animal.
-- Impacto no PWA: nenhum no contrato. Rollback:
-- supabase/rollbacks/20261019110000_maternidade_estorno_individuos_parto_excluido_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cria_do_parto_sem_outro_uso(
  p_individuo_id uuid,
  p_parto_id uuid,
  p_fazenda_id uuid,
  p_parto_criado_em timestamptz
)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  i public.individuos%ROWTYPE;
BEGIN
  SELECT * INTO i
  FROM public.individuos
  WHERE id = p_individuo_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;

  IF i.status IS DISTINCT FROM 'Vivo' THEN RETURN false; END IF;
  IF i.origem IS DISTINCT FROM 'Nascimento' THEN RETURN false; END IF;

  -- Criada pelo próprio parto (mesma sincronização: segundos de diferença)
  IF abs(extract(epoch FROM (i.created_at - p_parto_criado_em))) > 120 THEN RETURN false; END IF;

  -- Outro parto ativo que use o animal
  IF EXISTS (
    SELECT 1 FROM public.registros_maternidade m
    WHERE m.id <> p_parto_id AND m.deleted_at IS NULL
      AND p_individuo_id IN (m.individuo_id_mae, m.individuo_id_cria, m.individuo_id_mae_adotiva)
  ) THEN RETURN false; END IF;

  -- Filho ativo
  IF EXISTS (
    SELECT 1 FROM public.individuos f
    WHERE f.deleted_at IS NULL AND p_individuo_id IN (f.mae, f.mae_adotiva_id, f.pai)
  ) THEN RETURN false; END IF;

  -- Qualquer outro evento do animal
  IF EXISTS (SELECT 1 FROM public.aplicacoes_sanitarias x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.eventos_reprodutivos x WHERE (x.individuo_id = p_individuo_id OR x.touro_id = p_individuo_id) AND x.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.registros_enfermaria x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.registros_manejo_curral x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.registros_morte x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.registros_movimentacao x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.registros_pesagem x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.evento_individuos x WHERE x.individuo_id = p_individuo_id)
     OR EXISTS (SELECT 1 FROM public.pendencias_designacao_lote x WHERE x.individuo_id = p_individuo_id)
     OR EXISTS (SELECT 1 FROM public.lote_historico x WHERE x.individuo_id = p_individuo_id)
  THEN RETURN false; END IF;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_maternidade_estorna_cria()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NEW.individuo_id_cria IS NOT NULL THEN
    IF public.cria_do_parto_sem_outro_uso(NEW.individuo_id_cria, NEW.id, NEW.fazenda_id, NEW.created_at) THEN
      UPDATE public.individuos SET deleted_at = now(), updated_at = now()
      WHERE id = NEW.individuo_id_cria AND fazenda_id = NEW.fazenda_id AND deleted_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_maternidade_estorna_cria ON public.registros_maternidade;
CREATE TRIGGER trg_maternidade_estorna_cria
  AFTER UPDATE ON public.registros_maternidade
  FOR EACH ROW EXECUTE FUNCTION public.trg_maternidade_estorna_cria();
