-- Correção da RPC sincronizar_historico_pasto_lote_edit: adicionar flag
-- app.skip_sync_lote_modulo antes do INSERT em lote_pasto_historico para
-- evitar que o trigger trg_sync_lote_modulo_historico duplique a inserção
-- em lote_modulo_historico (mesmo padrão usado por processar_movimentacao_pastagem).

CREATE OR REPLACE FUNCTION public.sincronizar_historico_pasto_lote_edit(
  p_lote_id uuid,
  p_pasto_id_anterior uuid,
  p_pasto_id_novo uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_fazenda_id uuid;
  v_cabecas integer;
  v_peso numeric;
  v_modulo_novo_id uuid;
  v_modulo_anterior_id uuid;
  v_meta_pasto integer;
  v_meta_modulo integer;
  v_historico_modulo_aberto_id uuid;
  v_historico_modulo_aberto_modulo_id uuid;
BEGIN
  -- Se não mudou pasto, nada a fazer
  IF p_pasto_id_anterior IS NOT DISTINCT FROM p_pasto_id_novo THEN
    RETURN;
  END IF;

  -- Se o novo pasto é NULL (lote desativado ou confinamento), apenas fechar histórico aberto
  IF p_pasto_id_novo IS NULL THEN
    UPDATE public.lote_pasto_historico
    SET data_hora_saida = now(),
        updated_at = now()
    WHERE lote_id = p_lote_id AND data_hora_saida IS NULL;

    -- Fechar histórico de módulo aberto
    UPDATE public.lote_modulo_historico
    SET data_hora_saida = now(),
        updated_at = now()
    WHERE lote_id = p_lote_id AND data_hora_saida IS NULL;

    RETURN;
  END IF;

  -- Buscar fazenda_id e módulos
  SELECT fazenda_id INTO v_fazenda_id FROM public.lotes WHERE id = p_lote_id;
  IF v_fazenda_id IS NULL THEN
    RETURN;
  END IF;

  SELECT modulo_id, meta_intervalo_ocupacao_dias INTO v_modulo_novo_id, v_meta_pasto
  FROM public.pastos WHERE id = p_pasto_id_novo;

  SELECT modulo_id INTO v_modulo_anterior_id
  FROM public.pastos WHERE id = p_pasto_id_anterior;

  -- Métricas atuais do lote
  v_cabecas := public.calcular_cabecas_lote(p_lote_id);
  v_peso := public.calcular_peso_medio_lote(p_lote_id);

  -- 1. Fechar histórico de pasto aberto (do pasto anterior)
  UPDATE public.lote_pasto_historico
  SET data_hora_saida = now(),
      cabecas_saida = v_cabecas,
      peso_vivo_medio_saida_kg = v_peso,
      updated_at = now()
  WHERE lote_id = p_lote_id AND data_hora_saida IS NULL;

  -- Ativar flag para que trg_sync_lote_modulo não duplique a inserção
  -- em lote_modulo_historico (passo 4 abaixo gerencia isso)
  PERFORM set_config('app.skip_sync_lote_modulo', 'true', true);

  -- 2. Abrir novo histórico de pasto
  INSERT INTO public.lote_pasto_historico (
    lote_id, pasto_id, data_hora_entrada, data_hora_saida,
    cabecas_entrada, peso_vivo_medio_entrada_kg,
    modulo_id, meta_intervalo_ocupacao_dias,
    created_at, updated_at
  )
  VALUES (
    p_lote_id, p_pasto_id_novo, now(), NULL,
    v_cabecas, v_peso,
    v_modulo_novo_id, v_meta_pasto,
    now(), now()
  );

  -- Desativar flag: passo 4 agora gerencia lote_modulo_historico
  PERFORM set_config('app.skip_sync_lote_modulo', 'false', true);

  -- 3. Atualizar indivíduos
  UPDATE public.individuos
  SET pasto_atual = p_pasto_id_novo,
      updated_at = now()
  WHERE fazenda_id = v_fazenda_id AND lote_atual = p_lote_id;

  -- 4. Gerenciar histórico de módulo
  SELECT meta_intervalo_ocupacao_dias INTO v_meta_modulo
  FROM public.modulos_pastos WHERE id = v_modulo_novo_id;

  IF v_modulo_novo_id IS NOT NULL THEN
    -- Verificar histórico de módulo aberto
    SELECT id, modulo_id
    INTO v_historico_modulo_aberto_id, v_historico_modulo_aberto_modulo_id
    FROM public.lote_modulo_historico
    WHERE lote_id = p_lote_id AND data_hora_saida IS NULL
    LIMIT 1;

    IF v_historico_modulo_aberto_id IS NULL THEN
      -- Primeiro módulo: abrir histórico
      INSERT INTO public.lote_modulo_historico (
        lote_id, modulo_id, data_hora_entrada,
        cabecas_entrada, peso_vivo_medio_entrada_kg,
        meta_intervalo_ocupacao_dias,
        created_at, updated_at
      )
      VALUES (
        p_lote_id, v_modulo_novo_id, now(),
        v_cabecas, v_peso,
        v_meta_modulo,
        now(), now()
      );
    ELSIF v_historico_modulo_aberto_modulo_id IS DISTINCT FROM v_modulo_novo_id THEN
      -- Mudou de módulo: fechar antigo e abrir novo
      UPDATE public.lote_modulo_historico
      SET data_hora_saida = now(),
          cabecas_saida = v_cabecas,
          peso_vivo_medio_saida_kg = v_peso,
          updated_at = now()
      WHERE id = v_historico_modulo_aberto_id;

      INSERT INTO public.lote_modulo_historico (
        lote_id, modulo_id, data_hora_entrada,
        cabecas_entrada, peso_vivo_medio_entrada_kg,
        meta_intervalo_ocupacao_dias,
        created_at, updated_at
      )
      VALUES (
        p_lote_id, v_modulo_novo_id, now(),
        v_cabecas, v_peso,
        v_meta_modulo,
        now(), now()
      );
    END IF;
  ELSE
    -- Novo pasto não tem módulo: fechar qualquer histórico de módulo aberto
    UPDATE public.lote_modulo_historico
    SET data_hora_saida = now(),
        cabecas_saida = v_cabecas,
        peso_vivo_medio_saida_kg = v_peso,
        updated_at = now()
    WHERE lote_id = p_lote_id AND data_hora_saida IS NULL;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.sincronizar_historico_pasto_lote_edit(uuid, uuid, uuid) IS
  'Sincroniza lote_pasto_historico e lote_modulo_historico quando o pasto do lote é alterado pela edição administrativa no Painel Web. Chamar após UPDATE em lotes.pasto_id.';
