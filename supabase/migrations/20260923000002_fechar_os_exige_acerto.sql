-- ============================================================================
-- Fechamento de OS exige dados do acerto
-- O teste E2E mostrou que fechar_os_venda aceitava valor_acerto/data_credito
-- nulos, fechando a OS sem comprovação financeira. A UI passou a validar, e o
-- RPC agora também rejeita (defesa em profundidade).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fechar_os_venda(
  p_os_id uuid,
  p_valor_acerto numeric DEFAULT NULL,
  p_data_credito date DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_os RECORD;
BEGIN
  SELECT * INTO v_os FROM public.ordens_servico WHERE id = p_os_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS não encontrada');
  END IF;

  IF NOT public.user_has_fazenda_access(v_os.fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda desta OS');
  END IF;

  IF v_os.status = 'fechada' THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS já está fechada');
  END IF;
  IF v_os.status = 'cancelada' THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS está cancelada');
  END IF;
  IF v_os.status = 'aberta' THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS ainda não tem embarque registrado');
  END IF;

  IF p_valor_acerto IS NULL OR p_valor_acerto <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Informe o valor do acerto recebido');
  END IF;
  IF p_data_credito IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Informe a data em que o valor caiu na conta');
  END IF;

  UPDATE public.ordens_servico
  SET status = 'fechada',
      valor_acerto = COALESCE(p_valor_acerto, valor_acerto),
      data_credito = COALESCE(p_data_credito, data_credito),
      closed_at = now(),
      closed_by = p_usuario_id,
      updated_at = now()
  WHERE id = p_os_id;

  RETURN jsonb_build_object('success', true, 'numero_os', v_os.numero_os);
END;
$function$;
