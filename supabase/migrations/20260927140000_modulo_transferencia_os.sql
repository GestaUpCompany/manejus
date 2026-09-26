-- ============================================================================
-- Módulo de Transferência via Ordem de Serviço (OS)
--
-- Fluxo: comunicado de transferência no PWA da fazenda ORIGEM gera OS
-- (TRA-ano-00000) com fazenda_destino_id (obrigatório, mesmo grupo) ->
-- pesagem de saída na origem gera Saída/Transferência e marca indivíduos
-- 'Transferido' -> OS 'embarcada' -> recebimento por carga no destino
-- (os_recebimentos, um laudo por caminhão/GTA, SEM creditar estoque) ->
-- OS 'recebida' -> conferência por carga no Painel gera as movimentações
-- Entrada/Transferência no lote destino -> fechamento sem acerto financeiro
-- (GTA obrigatória + todas as cargas conferidas).
--
-- Convenção de movimentação (alinhada a calculate_quant_atual):
--   saída:   motivo='Saída',        tipo_saida='Transferência',  lote_origem_id=lote origem
--   entrada: motivo='Transferencia', tipo_entrada='Transferência', lote_destino_id=lote destino
-- ============================================================================

-- ============================================================================
-- 1) ordens_servico.fazenda_destino_id
-- ============================================================================
ALTER TABLE public.ordens_servico
  ADD COLUMN IF NOT EXISTS fazenda_destino_id uuid REFERENCES public.fazendas(id);

CREATE INDEX IF NOT EXISTS idx_ordens_servico_fazenda_destino
  ON public.ordens_servico (fazenda_destino_id)
  WHERE fazenda_destino_id IS NOT NULL;

-- ============================================================================
-- 2) Validação server-side: transferência só entre fazendas do mesmo grupo
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_os_valida_transferencia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_grupo_origem uuid;
  v_grupo_destino uuid;
BEGIN
  IF NEW.tipo <> 'transferencia' THEN
    RETURN NEW;
  END IF;

  IF NEW.fazenda_destino_id IS NULL THEN
    RAISE EXCEPTION 'OS de transferência exige fazenda de destino';
  END IF;
  IF NEW.fazenda_destino_id = NEW.fazenda_id THEN
    RAISE EXCEPTION 'Fazenda de destino deve ser diferente da origem';
  END IF;

  SELECT grupo_id INTO v_grupo_origem FROM public.fazendas WHERE id = NEW.fazenda_id;
  SELECT grupo_id INTO v_grupo_destino FROM public.fazendas WHERE id = NEW.fazenda_destino_id;

  IF v_grupo_origem IS NULL THEN
    RAISE EXCEPTION 'Fazenda de origem não pertence a um grupo';
  END IF;
  IF v_grupo_destino IS NULL OR v_grupo_destino <> v_grupo_origem THEN
    RAISE EXCEPTION 'Transferência só é permitida entre fazendas do mesmo grupo';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_os_valida_transferencia ON public.ordens_servico;
CREATE TRIGGER trg_os_valida_transferencia
  BEFORE INSERT OR UPDATE OF tipo, fazenda_id, fazenda_destino_id
  ON public.ordens_servico
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_os_valida_transferencia();

-- ============================================================================
-- 3) RLS: a fazenda destino enxerga a OS (somente leitura). Escrita continua
--    exclusiva da origem; status muda via triggers SECURITY DEFINER.
-- ============================================================================
DROP POLICY IF EXISTS "os_select_fazenda_destino" ON public.ordens_servico;
CREATE POLICY "os_select_fazenda_destino" ON public.ordens_servico
  FOR SELECT TO authenticated
  USING (
    fazenda_destino_id IS NOT NULL
    AND (
      public.get_peao_fazenda_id() = fazenda_destino_id
      OR public.user_has_fazenda_access(fazenda_destino_id)
    )
  );

-- ============================================================================
-- 4) Guarda de sessão: transferência permite N movimentações do destino
--    (uma por carga conferida), mas mantém bloqueio de dupla saída na origem.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_movimentacao_os_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_status text;
  v_tipo text;
  v_numero text;
  v_destino uuid;
BEGIN
  IF NEW.os_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status, tipo, numero_os, fazenda_destino_id
  INTO v_status, v_tipo, v_numero, v_destino
  FROM public.ordens_servico WHERE id = NEW.os_id;

  IF v_status IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_status = 'cancelada' OR v_status = 'fechada' THEN
    RAISE EXCEPTION 'OS % está % e não aceita novas movimentações', v_numero, v_status;
  END IF;

  -- Compra: múltiplos recebimentos por OS (um por caminhão/GTA) são o caso
  -- normal; cada laudo tem sua sessão, então a guarda de sessão única não se
  -- aplica.
  IF v_tipo = 'compra' THEN
    RETURN NEW;
  END IF;

  -- Transferência: a entrada no destino é gerada pela conferência de cada
  -- carga (sessões distintas por desenho). A guarda de sessão única segue
  -- valendo apenas para a saída na fazenda origem.
  IF v_tipo = 'transferencia' AND v_destino IS NOT NULL AND NEW.fazenda_id = v_destino THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registros_movimentacao
    WHERE os_id = NEW.os_id
      AND deleted_at IS NULL
      AND sessao_id IS DISTINCT FROM NEW.sessao_id
      AND local_id IS DISTINCT FROM NEW.local_id
  ) THEN
    RAISE EXCEPTION 'OS % já possui embarque registrado em outra sessão de pesagem', v_numero;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 5) quantidade_embarcada: para transferência soma apenas movimentações da
--    fazenda origem (saída). Sem o filtro, entrada+saída dobrariam a conta.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_movimentacao_os_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_os_id uuid;
  v_tipo text;
  v_fazenda_origem uuid;
  v_total integer;
  v_status_processada text;
BEGIN
  v_os_id := COALESCE(NEW.os_id, OLD.os_id);
  IF v_os_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT tipo, fazenda_id INTO v_tipo, v_fazenda_origem
  FROM public.ordens_servico WHERE id = v_os_id;
  v_status_processada := CASE v_tipo WHEN 'compra' THEN 'recebida' ELSE 'embarcada' END;

  IF v_tipo = 'transferencia' THEN
    SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_total
    FROM public.registros_movimentacao
    WHERE os_id = v_os_id AND deleted_at IS NULL
      AND fazenda_id = v_fazenda_origem;
  ELSE
    SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_total
    FROM public.registros_movimentacao
    WHERE os_id = v_os_id AND deleted_at IS NULL;
  END IF;

  UPDATE public.ordens_servico
  SET
    quantidade_embarcada = v_total,
    status = CASE
      WHEN status = 'aberta' AND v_total > 0 THEN v_status_processada
      WHEN status IN ('embarcada', 'recebida') AND v_total = 0 THEN 'aberta'
      ELSE status
    END,
    updated_at = now()
  WHERE id = v_os_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ============================================================================
-- 6) Pesagem vinculada a OS de transferência: indivíduo sai como
--    'Transferido' (enum já existente), não 'Venda Vivo'.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_registros_pesagem_upsert_individuo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_individuo_id uuid;
  v_status_anterior text;
  v_tipo_os text;
  v_tipo_venda text;
  v_status_venda text;
BEGIN
  -- Localiza indivíduo existente pelo chip ou brinco na mesma fazenda (chip tem prioridade)
  SELECT i.id, i.status INTO v_individuo_id, v_status_anterior
  FROM public.individuos i
  WHERE i.fazenda_id = NEW.fazenda_id
    AND i.deleted_at IS NULL
    AND (
      (NEW.id_chip IS NOT NULL AND NEW.id_chip <> '' AND i.id_chip = NEW.id_chip)
      OR (NEW.id_brinco IS NOT NULL AND NEW.id_brinco <> '' AND i.id_brinco = NEW.id_brinco)
    )
  ORDER BY
    (NEW.id_chip IS NOT NULL AND NEW.id_chip <> '' AND i.id_chip = NEW.id_chip) DESC,
    i.created_at
  LIMIT 1;

  -- -----------------------------------------------------------------------
  -- Pesagem vinculada a OS de saída (venda/abate/transferência):
  -- nunca cria indivíduo; marca o existente conforme o tipo da OS.
  -- -----------------------------------------------------------------------
  IF NEW.os_id IS NOT NULL THEN
    IF v_individuo_id IS NULL THEN
      NEW.individuo_id := NULL;
      INSERT INTO public.logs_sync_errors (fazenda_id, caderneta, registro_id, operation, error_code, error_message, error_details, payload)
      VALUES (
        NEW.fazenda_id, 'pesagem', NEW.local_id,
        'trg_registros_pesagem_upsert_individuo',
        'OS_ANIMAL_SEM_CADASTRO',
        'Animal pesado em OS sem indivíduo correspondente (chip/brinco não encontrado)',
        'OS: ' || NEW.os_id::text || ' | Chip: ' || COALESCE(NEW.id_chip, 'NULL') || ' | Brinco: ' || COALESCE(NEW.id_brinco, 'NULL'),
        jsonb_build_object('os_id', NEW.os_id, 'id_chip', NEW.id_chip, 'id_brinco', NEW.id_brinco, 'lote_id', NEW.lote_id, 'peso_kg', NEW.peso_kg)
      );
      RETURN NEW;
    END IF;

    SELECT tipo, tipo_venda INTO v_tipo_os, v_tipo_venda
    FROM public.ordens_servico WHERE id = NEW.os_id;
    v_status_venda := CASE
      WHEN v_tipo_os = 'transferencia' THEN 'Transferido'
      WHEN v_tipo_venda = 'abate' THEN 'Abatido'
      ELSE 'Venda Vivo'
    END;

    -- Auditoria: animal já vendido/abatido/morto/transferido pesado de novo em outra OS
    IF v_status_anterior IS NOT NULL AND v_status_anterior <> 'Vivo' THEN
      INSERT INTO public.logs_sync_errors (fazenda_id, caderneta, registro_id, operation, error_code, error_message, error_details, payload)
      VALUES (
        NEW.fazenda_id, 'pesagem', NEW.local_id,
        'trg_registros_pesagem_upsert_individuo',
        'OS_ANIMAL_JA_BAIXADO',
        'Indivíduo com status ' || v_status_anterior || ' pesado novamente em OS',
        'OS: ' || NEW.os_id::text || ' | Individuo: ' || v_individuo_id::text || ' | Chip: ' || COALESCE(NEW.id_chip, 'NULL') || ' | Brinco: ' || COALESCE(NEW.id_brinco, 'NULL'),
        jsonb_build_object('os_id', NEW.os_id, 'individuo_id', v_individuo_id, 'status_anterior', v_status_anterior)
      );
    END IF;

    NEW.individuo_status_anterior := v_status_anterior;

    UPDATE public.individuos
    SET
      id_chip = COALESCE(NULLIF(NEW.id_chip, ''), id_chip),
      id_brinco = COALESCE(NULLIF(NEW.id_brinco, ''), id_brinco),
      sexo = COALESCE(NEW.sexo, sexo),
      categoria = COALESCE(NEW.categoria, categoria),
      raca = COALESCE(NEW.raca, raca),
      lote_atual = COALESCE(NEW.lote_id, lote_atual),
      peso_atual_kg = COALESCE(NEW.peso_kg, peso_atual_kg),
      idade_era = COALESCE(NEW.idade_era, idade_era),
      idade_atual_dias = COALESCE(NEW.idade_dias, idade_atual_dias),
      status = v_status_venda,
      updated_at = now()
    WHERE id = v_individuo_id;

    NEW.individuo_id := v_individuo_id;
    RETURN NEW;
  END IF;

  -- -----------------------------------------------------------------------
  -- Pesagem comum / processamento pós-compra (sem OS): upsert normal.
  -- 'processamento' cria indivíduo 'Vivo' com origem 'Compra' quando o animal
  -- chegou por compra e está sendo identificado no manejo posterior.
  -- -----------------------------------------------------------------------
  IF v_individuo_id IS NOT NULL THEN
    UPDATE public.individuos
    SET
      id_chip = COALESCE(NULLIF(NEW.id_chip, ''), id_chip),
      id_brinco = COALESCE(NULLIF(NEW.id_brinco, ''), id_brinco),
      sexo = COALESCE(NEW.sexo, sexo),
      categoria = COALESCE(NEW.categoria, categoria),
      raca = COALESCE(NEW.raca, raca),
      lote_atual = COALESCE(NEW.lote_id, lote_atual),
      peso_atual_kg = COALESCE(NEW.peso_kg, peso_atual_kg),
      idade_era = COALESCE(NEW.idade_era, idade_era),
      idade_atual_dias = COALESCE(NEW.idade_dias, idade_atual_dias),
      updated_at = now()
    WHERE id = v_individuo_id;
  ELSE
    INSERT INTO public.individuos (
      fazenda_id, id_chip, id_brinco, sexo, categoria, raca,
      lote_atual, peso_atual_kg, idade_era, idade_atual_dias,
      status, origem
    ) VALUES (
      NEW.fazenda_id,
      NULLIF(NEW.id_chip, ''),
      NULLIF(NEW.id_brinco, ''),
      NEW.sexo,
      NEW.categoria,
      NEW.raca,
      NEW.lote_id,
      NEW.peso_kg,
      NEW.idade_era,
      NEW.idade_dias,
      'Vivo',
      CASE NEW.tipo_manejo
        WHEN 'compra' THEN 'Compra'
        WHEN 'processamento' THEN 'Compra'
        WHEN 'transf_entrada' THEN 'Transferência'
        ELSE 'Cadastro Manual'
      END
    )
    RETURNING id INTO v_individuo_id;
  END IF;

  NEW.individuo_id := v_individuo_id;
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 7) os_recebimentos: controle de conferência por carga. O crédito no lote
--    destino só acontece quando o controller confere o laudo (evita sub ou
--    superestimar saldo com divergência ainda não auditada).
-- ============================================================================
ALTER TABLE public.os_recebimentos
  ADD COLUMN IF NOT EXISTS conferido boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conferido_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS conferido_por uuid;

-- ============================================================================
-- 8) RPC: conferência da carga de transferência. Cria as movimentações
--    Entrada/Transferência no lote destino e marca o laudo como conferido.
--    Idempotente: carga já conferida é recusada.
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

  -- Uma movimentação por categoria+sexo do laudo. Convenção de entrada por
  -- transferência: motivo 'Transferencia' + tipo_entrada 'Transferência' +
  -- lote_destino_id (soma uma única vez em calculate_quant_atual).
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
        NULL, NULL,
        v_rec.lote_destino, v_rec.lote_destino_id,
        v_linha.cabecas, v_c->>'categoria', v_linha.sexo,
        v_rec.peso_medio_balancao,
        'Transferencia'::public.tipo_movimentacao_motivo,
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

-- ============================================================================
-- 9) Fechamento: transferência não tem acerto financeiro. Exige recebimento
--    (status 'recebida'), todas as cargas conferidas e GTA anexada. Registra
--    apenas o responsável (closed_by).
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
  v_gta_count integer;
BEGIN
  SELECT * INTO v_os FROM public.ordens_servico WHERE id = p_os_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS não encontrada');
  END IF;

  IF NOT (public.user_has_fazenda_access(v_os.fazenda_id)
          OR (v_os.fazenda_destino_id IS NOT NULL AND public.user_has_fazenda_access(v_os.fazenda_destino_id))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda desta OS');
  END IF;

  IF v_os.status = 'fechada' THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS já está fechada');
  END IF;
  IF v_os.status = 'cancelada' THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS está cancelada');
  END IF;
  IF v_os.status = 'aberta' THEN
    RETURN jsonb_build_object('success', false, 'error',
      CASE WHEN v_os.tipo = 'compra'
        THEN 'OS ainda não tem recebimento registrado'
        ELSE 'OS ainda não tem embarque registrado'
      END);
  END IF;

  -- Compra e transferência: confirmação de recebimento da GTA é dever legal;
  -- a OS não fecha sem ao menos uma GTA anexada.
  IF v_os.tipo IN ('compra', 'transferencia') THEN
    SELECT COUNT(*) INTO v_gta_count
    FROM public.os_documentos
    WHERE os_id = p_os_id AND tipo = 'gta' AND deleted_at IS NULL;
    IF v_gta_count = 0 THEN
      RETURN jsonb_build_object('success', false, 'error',
        CASE WHEN v_os.tipo = 'compra'
          THEN 'Anexe a GTA do recebimento antes de fechar a OS de compra'
          ELSE 'Anexe a GTA da transferência antes de fechar a OS'
        END);
    END IF;
  END IF;

  -- Transferência: saída sem acerto. Exige recebimento no destino e todas as
  -- cargas conferidas (o crédito no lote destino só acontece na conferência).
  IF v_os.tipo = 'transferencia' THEN
    IF v_os.status <> 'recebida' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Aguardando recebimento na fazenda de destino');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.os_recebimentos
      WHERE os_id = p_os_id AND deleted_at IS NULL AND NOT conferido
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Existem cargas pendentes de conferência');
    END IF;

    UPDATE public.ordens_servico
    SET status = 'fechada',
        closed_at = now(),
        closed_by = p_usuario_id,
        updated_at = now()
    WHERE id = p_os_id;

    RETURN jsonb_build_object('success', true, 'numero_os', v_os.numero_os);
  END IF;

  IF p_valor_acerto IS NULL OR p_valor_acerto <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error',
      CASE WHEN v_os.tipo = 'compra'
        THEN 'Informe o valor do acerto pago'
        ELSE 'Informe o valor do acerto recebido'
      END);
  END IF;
  IF p_data_credito IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Informe a data do acerto');
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

-- ============================================================================
-- 10) Cancelamento e estorno: acesso por origem OU destino; estorno reverte
--     indivíduos 'Transferido' e recalcula lotes nas duas fazendas.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cancelar_os_venda(
  p_os_id uuid,
  p_motivo text DEFAULT NULL,
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

  IF NOT (public.user_has_fazenda_access(v_os.fazenda_id)
          OR (v_os.fazenda_destino_id IS NOT NULL AND public.user_has_fazenda_access(v_os.fazenda_destino_id))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda desta OS');
  END IF;

  IF v_os.status = 'fechada' THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS já está fechada');
  END IF;
  IF v_os.status = 'cancelada' THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS já está cancelada');
  END IF;
  IF v_os.status IN ('embarcada', 'recebida', 'aguardando_pagamento') THEN
    RETURN jsonb_build_object('success', false, 'error',
      CASE WHEN v_os.tipo = 'compra'
        THEN 'OS já possui recebimento. Estorne a baixa antes de cancelar.'
        ELSE 'OS já possui embarque. Estorne a baixa antes de cancelar.'
      END);
  END IF;

  UPDATE public.ordens_servico
  SET status = 'cancelada',
      cancelada_at = now(),
      motivo_cancelamento = p_motivo,
      updated_at = now()
  WHERE id = p_os_id;

  RETURN jsonb_build_object('success', true, 'numero_os', v_os.numero_os);
END;
$function$;

CREATE OR REPLACE FUNCTION public.estornar_baixa_os(
  p_os_id uuid,
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
  v_par RECORD;
  v_mov_count integer;
  v_ind_count integer;
  v_rec_count integer;
BEGIN
  SELECT * INTO v_os FROM public.ordens_servico WHERE id = p_os_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS não encontrada');
  END IF;

  IF NOT (public.user_has_fazenda_access(v_os.fazenda_id)
          OR (v_os.fazenda_destino_id IS NOT NULL AND public.user_has_fazenda_access(v_os.fazenda_destino_id))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda desta OS');
  END IF;

  IF v_os.status NOT IN ('embarcada', 'recebida', 'aguardando_pagamento') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Só é possível estornar OS processada (status: ' || v_os.status || ')');
  END IF;

  -- Pares (lote, categoria) afetados: saída usa lote_origem_id, entrada usa
  -- lote_destino_id (compra soma nas categorias do lote de destino).
  CREATE TEMP TABLE IF NOT EXISTS tmp_estorno_pares (
    lote_id uuid, categoria text
  ) ON COMMIT DROP;
  DELETE FROM tmp_estorno_pares;

  INSERT INTO tmp_estorno_pares (lote_id, categoria)
  SELECT DISTINCT COALESCE(lote_origem_id, lote_destino_id), categoria
  FROM public.registros_movimentacao
  WHERE os_id = p_os_id AND deleted_at IS NULL
    AND COALESCE(lote_origem_id, lote_destino_id) IS NOT NULL;

  -- Soft-delete das movimentações da OS (saem da soma de calculate_quant_atual)
  UPDATE public.registros_movimentacao
  SET deleted_at = now(), updated_at = now()
  WHERE os_id = p_os_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_mov_count = ROW_COUNT;

  -- Laudos de recebimento da compra são estornados junto
  UPDATE public.os_recebimentos
  SET deleted_at = now(), updated_at = now()
  WHERE os_id = p_os_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_rec_count = ROW_COUNT;

  -- Reverte indivíduos marcados por esta OS ao status anterior
  UPDATE public.individuos i
  SET status = COALESCE(rp.individuo_status_anterior, 'Vivo'),
      updated_at = now()
  FROM public.registros_pesagem rp
  WHERE rp.os_id = p_os_id
    AND rp.individuo_id = i.id
    AND rp.deleted_at IS NULL
    AND i.status IN ('Abatido', 'Venda Vivo', 'Transferido');
  GET DIAGNOSTICS v_ind_count = ROW_COUNT;

  -- Recalcula quant_atual das lote_categorias afetadas
  FOR v_par IN SELECT lote_id, categoria FROM tmp_estorno_pares LOOP
    UPDATE public.lote_categorias
    SET quant_atual = public.calculate_quant_atual(v_par.lote_id, v_par.categoria),
        updated_at = now()
    WHERE lote_id = v_par.lote_id
      AND LOWER(categoria) = LOWER(v_par.categoria)
      AND ativo = true;
  END LOOP;

  -- OS volta para aberta (triggers já recalculam quantidade_embarcada/mortes)
  UPDATE public.ordens_servico
  SET status = 'aberta',
      quantidade_embarcada = 0,
      updated_at = now()
  WHERE id = p_os_id;

  RETURN jsonb_build_object(
    'success', true,
    'numero_os', v_os.numero_os,
    'movimentacoes_estornadas', v_mov_count,
    'recebimentos_estornados', v_rec_count,
    'individuos_revertidos', v_ind_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.conferir_recebimento_transferencia(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_os_venda(uuid, numeric, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_os_venda(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.estornar_baixa_os(uuid, uuid) TO authenticated;

-- ============================================================================
-- 11) Notificação: embarque de transferência avisa também a fazenda destino
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_os_embarcada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_controller RECORD;
  v_titulo text;
  v_mensagem text;
  v_fazenda_destino_nome text;
BEGIN
  IF NOT (OLD.status = 'aberta' AND NEW.status IN ('embarcada', 'recebida')) THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'recebida' THEN
    v_titulo := 'OS ' || COALESCE(NEW.numero_os, '') || ' recebida';
    v_mensagem := 'Recebimento registrado: ' || COALESCE(NEW.quantidade_embarcada, 0) || ' de ' || COALESCE(NEW.quantidade_prevista, 0) || ' cabeças. Aguardando conferência e acerto.';
  ELSE
    v_titulo := 'OS ' || COALESCE(NEW.numero_os, '') || ' embarcada';
    v_mensagem := 'Pesagem concluída: ' || COALESCE(NEW.quantidade_embarcada, 0) || ' de ' || COALESCE(NEW.quantidade_prevista, 0) || ' cabeças. Aguardando romaneio/acerto.';
  END IF;

  FOR v_controller IN
    SELECT u.id, uf.fazenda_id FROM usuarios u
    JOIN usuario_fazenda uf ON u.id = uf.usuario_id
    WHERE uf.fazenda_id = NEW.fazenda_id
      AND uf.ativo = true
      AND uf.papel IN ('admin', 'controller')
      AND (u.id)::text NOT LIKE '%@gestaup.internal'
      AND u.ativo = true
  LOOP
    INSERT INTO notificacoes (usuario_id, fazenda_id, tipo, titulo, mensagem, acao_url, acao_label, dados_jsonb)
    VALUES (
      v_controller.id,
      v_controller.fazenda_id,
      'info',
      v_titulo,
      v_mensagem,
      '/controller/ordens-servico/' || NEW.id,
      'Ver OS',
      jsonb_build_object('os_id', NEW.id, 'numero_os', NEW.numero_os, 'quantidade_embarcada', NEW.quantidade_embarcada)
    );
  END LOOP;

  -- Transferência: a fazenda destino precisa se preparar para receber.
  IF NEW.tipo = 'transferencia' AND NEW.fazenda_destino_id IS NOT NULL AND NEW.status = 'embarcada' THEN
    SELECT nome INTO v_fazenda_destino_nome FROM public.fazendas WHERE id = NEW.fazenda_destino_id;

    FOR v_controller IN
      SELECT u.id FROM usuarios u
      JOIN usuario_fazenda uf ON u.id = uf.usuario_id
      WHERE uf.fazenda_id = NEW.fazenda_destino_id
        AND uf.ativo = true
        AND uf.papel IN ('admin', 'controller')
        AND (u.id)::text NOT LIKE '%@gestaup.internal'
        AND u.ativo = true
    LOOP
      INSERT INTO notificacoes (usuario_id, fazenda_id, tipo, titulo, mensagem, acao_url, acao_label, dados_jsonb)
      VALUES (
        v_controller.id,
        NEW.fazenda_destino_id,
        'info',
        'Carga a caminho: OS ' || COALESCE(NEW.numero_os, ''),
        'Transferência embarcada com destino a ' || COALESCE(v_fazenda_destino_nome, 'fazenda destino') || ': ' ||
          COALESCE(NEW.quantidade_embarcada, 0) || ' cabeças. Aguardando recebimento.',
        '/controller/ordens-servico/' || NEW.id,
        'Ver OS',
        jsonb_build_object('os_id', NEW.id, 'numero_os', NEW.numero_os, 'quantidade_embarcada', NEW.quantidade_embarcada)
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;
