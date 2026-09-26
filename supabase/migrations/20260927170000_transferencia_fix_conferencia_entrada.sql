-- ============================================================================
-- Fix: conferência de transferência não creditava o lote destino
--
-- A RPC conferir_recebimento_transferencia gravava a entrada com
-- motivo='Transferencia' + lote_destino_id. Esse shape é contado uma vez por
-- calculate_quant_atual (v_sum_transf_entrada), mas o trigger
-- trigger_update_quant_atual_movimentacao sai cedo quando lote_origem_id é
-- NULL, então quant_atual nunca era recalculado.
--
-- Correção: a entrada segue a mesma convenção da compra — motivo='Entrada',
-- lote_origem_id = lote receptor do destino, lote_destino_id NULL (para não
-- duplicar com v_sum_transf_entrada), tipo_entrada='Transferência' como
-- marcador para relatórios e fazenda_destino_id = fazenda origem (outra ponta).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.conferir_recebimento_transferencia(
  p_os_recebimento_id uuid,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_rec RECORD;
  v_os RECORD;
  v_c jsonb;
  v_linha RECORD;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_rec FROM public.os_recebimentos
  WHERE id = p_os_recebimento_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recebimento não encontrado');
  END IF;

  SELECT * INTO v_os FROM public.ordens_servico
  WHERE id = v_rec.os_id AND deleted_at IS NULL;
  IF NOT FOUND OR v_os.tipo <> 'transferencia' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recebimento não pertence a uma OS de transferência');
  END IF;

  IF v_rec.fazenda_id IS DISTINCT FROM v_os.fazenda_destino_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Laudo não pertence à fazenda de destino da OS');
  END IF;

  IF NOT (public.user_has_fazenda_access(v_os.fazenda_id)
          OR public.user_has_fazenda_access(v_os.fazenda_destino_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso às fazendas desta OS');
  END IF;

  IF v_rec.conferido THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta carga já foi conferida');
  END IF;

  IF v_os.status IN ('fechada', 'cancelada') THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS está ' || v_os.status);
  END IF;

  -- Uma movimentação por categoria+sexo do laudo. Convenção de entrada igual à
  -- da compra: motivo 'Entrada' + lote_origem_id = lote receptor (é esse shape
  -- que o trigger de estoque recalcula e que calculate_quant_atual soma uma
  -- única vez em v_sum_entradas). tipo_entrada 'Transferência' marca a origem
  -- do crédito para relatórios; lote_destino_id fica NULL para não duplicar.
  FOR v_c IN SELECT * FROM jsonb_array_elements(COALESCE(v_rec.contagens, '[]'::jsonb)) LOOP
    FOR v_linha IN
      SELECT 'Fêmea' AS sexo, COALESCE((v_c->>'femeas')::integer, 0) AS cabecas
      UNION ALL
      SELECT 'Macho', COALESCE((v_c->>'machos')::integer, 0)
    LOOP
      IF v_linha.cabecas <= 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO public.registros_movimentacao (
        fazenda_id, data, lote_origem, lote_origem_id,
        destino, lote_destino_id,
        numero_cabecas, categoria, sexo,
        peso_vivo_atual_kg,
        motivo_movimentacao, subtipo, tipo_entrada,
        responsavel, nome_usuario,
        causa_observacao, observacao,
        fazenda_destino_id,
        os_id, os_recebimento_id, sessao_id, local_id,
        sync_status, version
      ) VALUES (
        v_rec.fazenda_id,
        COALESCE(v_rec.data_chegada::timestamp with time zone, v_rec.data, now()),
        v_rec.lote_destino, v_rec.lote_destino_id,
        NULL, NULL,
        v_linha.cabecas, v_c->>'categoria', v_linha.sexo,
        v_rec.peso_medio_balancao,
        'Entrada'::public.tipo_movimentacao_motivo,
        'Entrada'::public.tipo_movimentacao_subtipo,
        'Transferência',
        v_rec.responsavel, COALESCE(v_rec.nome_usuario, v_rec.responsavel),
        NULL,
        'Conferência ' || COALESCE(v_os.numero_os, 'OS') || ' (GTA ' || COALESCE(v_rec.numero_gta, '-') || ')',
        v_os.fazenda_id,
        v_rec.os_id, v_rec.id, 'conf-' || v_rec.id::text,
        'conf-' || v_rec.id::text || '-' || v_linha.sexo || '-' || COALESCE(v_c->>'categoria', ''),
        'synced', 1
      );
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  UPDATE public.os_recebimentos
  SET conferido = true, conferido_at = now(), conferido_por = p_usuario_id, updated_at = now()
  WHERE id = v_rec.id;

  RETURN jsonb_build_object(
    'success', true,
    'numero_os', v_os.numero_os,
    'movimentacoes_criadas', v_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.conferir_recebimento_transferencia(uuid, uuid) TO authenticated;
