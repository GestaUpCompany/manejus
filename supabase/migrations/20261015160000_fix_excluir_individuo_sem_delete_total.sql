-- ============================================================================
-- Indivíduos / Fase 0.1 (correção): excluir_individuo sem DELETE sem WHERE
-- ============================================================================
-- Bug achado no teste em 15/10/2026 (fazenda de testes): a função criada em
-- 20261015150000 usava uma tabela temporária e `DELETE FROM tmp_...;` sem WHERE. O banco bloqueia
-- DELETE/UPDATE sem WHERE ("DELETE requires a WHERE clause") e a exclusão falhava sempre.
-- Correção: os pares (lote, categoria) afetados ficam num array jsonb em variável; sem tabela temporária.
-- Só substitui a função (mesma assinatura). Nenhum dado é alterado.
-- Rollback: supabase/rollbacks/20261015160000_fix_excluir_individuo_sem_delete_total_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.excluir_individuo(
  p_fazenda_id uuid,
  p_individuo_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_ind RECORD;
  v_par RECORD;
  v_pares jsonb;
  v_estornadas integer;
BEGIN
  IF public.caller_is_peao() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação restrita ao painel de gestão');
  END IF;
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda');
  END IF;

  SELECT * INTO v_ind
  FROM public.individuos
  WHERE id = p_individuo_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Indivíduo não encontrado');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registros_morte
    WHERE individuo_id = v_ind.id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Este animal tem um registro de morte. Exclua a morte na Caderneta de Morte antes.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registros_movimentacao
    WHERE individuo_id = v_ind.id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL AND os_id IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Este animal está vinculado a uma Ordem de Serviço. Estorne a OS antes de excluir.');
  END IF;

  -- Pares (lote, categoria) afetados, coletados antes do soft-delete
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('l', COALESCE(lote_origem_id, lote_destino_id), 'c', categoria)), '[]'::jsonb)
  INTO v_pares
  FROM public.registros_movimentacao
  WHERE individuo_id = v_ind.id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
    AND os_id IS NULL AND numero_cabecas = 1
    AND COALESCE(lote_origem_id, lote_destino_id) IS NOT NULL AND categoria IS NOT NULL;

  UPDATE public.registros_movimentacao
  SET deleted_at = now(), updated_at = now()
  WHERE individuo_id = v_ind.id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
    AND os_id IS NULL AND numero_cabecas = 1;
  GET DIAGNOSTICS v_estornadas = ROW_COUNT;

  FOR v_par IN
    SELECT (e->>'l')::uuid AS lote_id, e->>'c' AS categoria FROM jsonb_array_elements(v_pares) AS e
  LOOP
    UPDATE public.lote_categorias
    SET quant_atual = public.calculate_quant_atual(v_par.lote_id, v_par.categoria), updated_at = now()
    WHERE lote_id = v_par.lote_id AND LOWER(categoria) = LOWER(v_par.categoria) AND ativo = true;
  END LOOP;

  UPDATE public.individuos SET deleted_at = now(), updated_at = now() WHERE id = v_ind.id;

  RETURN jsonb_build_object('success', true, 'movimentacoes_estornadas', v_estornadas);
END;
$function$;
