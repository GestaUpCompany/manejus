-- ============================================================================
-- Indivíduos / Fase 3.3: informar QUAL animal morreu numa morte já registrada
-- ============================================================================
-- A morte registrada sem individuo_id (PWA antigo, animal sem brinco/chip no cache, morte lançada só por contagem)
-- já baixou o agregado (quant_atual) mas deixou o animal Vivo no cadastro, e a conciliação o mostra como "a mais".
-- O gatilho trg_registros_morte_baixa_individuo só age em INSERT / estorno, então alterar individuo_id depois não baixa o animal.
--   * vincular_individuo_morte(p_fazenda_id, p_morte_id, p_individuo_id): morte ativa e sem animal; animal Vivo da mesma
--     fazenda, da mesma categoria canônica da morte (quando ambas estão no domínio) e, havendo lote nos dois lados,
--     no lote da morte (a menos que sua localização seja incerta). Grava individuo_id na morte e baixa o animal
--     (status Morto, data_saida = data da morte, motivo_saida = 'Morte'), exatamente como o gatilho faz no INSERT.
--     NÃO mexe no agregado: a morte já o descontou.
--   * desvincular_individuo_morte(p_fazenda_id, p_morte_id): desfaz a ligação e devolve o animal a Vivo, só se foi
--     esta morte que o baixou (mesma regra do estorno).
-- Ações restritas ao painel (peão recusado), tudo ou nada.
-- Rollback: supabase/rollbacks/20261016200000_vincular_individuo_morte_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.vincular_individuo_morte(
  p_fazenda_id uuid,
  p_morte_id uuid,
  p_individuo_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_morte public.registros_morte%ROWTYPE;
  v_ind public.individuos%ROWTYPE;
  v_cat_morte text;
  v_cat_ind text;
  v_rotulo text;
BEGIN
  IF public.caller_is_peao() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação restrita ao painel de gestão');
  END IF;
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda');
  END IF;

  SELECT * INTO v_morte FROM public.registros_morte
  WHERE id = p_morte_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Registro de morte não encontrado');
  END IF;
  IF v_morte.individuo_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta morte já tem um animal informado');
  END IF;

  SELECT * INTO v_ind FROM public.individuos
  WHERE id = p_individuo_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Animal não encontrado nesta fazenda');
  END IF;
  v_rotulo := COALESCE(v_ind.id_brinco, v_ind.id_chip, v_ind.id_manejo, v_ind.id_provisorio_cria, v_ind.id::text);

  IF v_ind.status <> 'Vivo' THEN
    RAISE EXCEPTION 'O animal % não está Vivo (%).', v_rotulo, v_ind.status USING ERRCODE = 'P0001';
  END IF;

  v_cat_morte := public.categoria_canonica(v_morte.categoria);
  v_cat_ind := public.categoria_canonica(v_ind.categoria);
  IF v_cat_morte IS NOT NULL AND v_cat_ind IS NOT NULL AND v_cat_morte <> v_cat_ind THEN
    RAISE EXCEPTION 'O animal % é da categoria "%", diferente da morte ("%").', v_rotulo, v_ind.categoria, v_morte.categoria
      USING ERRCODE = 'P0001';
  END IF;

  IF v_morte.lote_id IS NOT NULL AND v_ind.lote_atual IS NOT NULL
     AND v_ind.lote_atual <> v_morte.lote_id AND v_ind.localizacao_incerta_desde IS NULL THEN
    RAISE EXCEPTION 'O animal % está em outro lote, diferente do lote da morte.', v_rotulo USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.registros_morte SET individuo_id = v_ind.id WHERE id = v_morte.id;

  UPDATE public.individuos
  SET status = 'Morto',
      data_saida = (v_morte.data AT TIME ZONE 'America/Cuiaba')::date,
      motivo_saida = 'Morte',
      updated_at = now()
  WHERE id = v_ind.id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.desvincular_individuo_morte(
  p_fazenda_id uuid,
  p_morte_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_morte public.registros_morte%ROWTYPE;
BEGIN
  IF public.caller_is_peao() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação restrita ao painel de gestão');
  END IF;
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda');
  END IF;

  SELECT * INTO v_morte FROM public.registros_morte
  WHERE id = p_morte_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Registro de morte não encontrado');
  END IF;
  IF v_morte.individuo_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta morte não tem animal informado');
  END IF;

  UPDATE public.individuos
  SET status = 'Vivo', data_saida = NULL, motivo_saida = NULL, destino_saida = NULL, updated_at = now()
  WHERE id = v_morte.individuo_id AND fazenda_id = p_fazenda_id
    AND status = 'Morto' AND motivo_saida = 'Morte';

  UPDATE public.registros_morte SET individuo_id = NULL WHERE id = v_morte.id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.vincular_individuo_morte(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.desvincular_individuo_morte(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vincular_individuo_morte(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.desvincular_individuo_morte(uuid, uuid) TO authenticated;
