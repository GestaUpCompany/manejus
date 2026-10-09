-- ROLLBACK de 20261008150000_os_preenche_dados_de_saida_do_individuo.sql
-- NÃO fica em supabase/migrations/ de propósito. Restaura trg_registros_pesagem_upsert_individuo
-- (versão da 20261008120000) e estornar_baixa_os (corpo original). Os valores de data_saida,
-- motivo_saida e destino_saida já gravados por OS não são apagados.

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
  v_chip_livre boolean := true;
  v_brinco_livre boolean := true;
BEGIN
  -- Retry (linha já gravada): preserva o vínculo existente e não reaplica
  -- efeitos colaterais no indivíduo.
  IF NEW.local_id IS NOT NULL THEN
    SELECT rp.individuo_id, rp.individuo_status_anterior
    INTO v_individuo_id, v_status_anterior
    FROM public.registros_pesagem rp
    WHERE rp.local_id = NEW.local_id;
    IF FOUND THEN
      NEW.individuo_id := v_individuo_id;
      NEW.individuo_status_anterior := v_status_anterior;
      RETURN NEW;
    END IF;
  END IF;

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
    CASE WHEN NEW.id_chip IS NOT NULL AND NEW.id_chip <> '' AND i.id_chip = NEW.id_chip THEN 0 ELSE 1 END,
    i.created_at
  LIMIT 1;

  -- Conflito de identificação: chip ou brinco da pesagem já pertence a OUTRO indivíduo ativo.
  -- Copiá-los violaria os índices únicos e abortaria a pesagem; mantém os do animal e registra.
  IF v_individuo_id IS NOT NULL THEN
    IF NEW.id_chip IS NOT NULL AND NEW.id_chip <> '' THEN
      v_chip_livre := NOT EXISTS (
        SELECT 1 FROM public.individuos o
        WHERE o.fazenda_id = NEW.fazenda_id AND o.deleted_at IS NULL
          AND o.id <> v_individuo_id AND o.id_chip = NEW.id_chip
      );
    END IF;
    IF NEW.id_brinco IS NOT NULL AND NEW.id_brinco <> '' THEN
      v_brinco_livre := NOT EXISTS (
        SELECT 1 FROM public.individuos o
        WHERE o.fazenda_id = NEW.fazenda_id AND o.deleted_at IS NULL
          AND o.id <> v_individuo_id AND o.id_brinco = NEW.id_brinco
      );
    END IF;

    IF NOT v_chip_livre OR NOT v_brinco_livre THEN
      INSERT INTO public.logs_sync_errors (fazenda_id, caderneta, registro_id, operation, error_code, error_message, error_details, payload)
      VALUES (
        NEW.fazenda_id, 'pesagem', NEW.local_id,
        'trg_registros_pesagem_upsert_individuo',
        'PESAGEM_ID_CONFLITO',
        'Chip ou brinco da pesagem pertence a outro indivíduo; identificação do animal mantida',
        'Individuo: ' || v_individuo_id::text || ' | Chip: ' || COALESCE(NEW.id_chip, 'NULL') || ' (livre=' || v_chip_livre::text
          || ') | Brinco: ' || COALESCE(NEW.id_brinco, 'NULL') || ' (livre=' || v_brinco_livre::text || ')',
        jsonb_build_object('individuo_id', v_individuo_id, 'id_chip', NEW.id_chip, 'id_brinco', NEW.id_brinco, 'peso_kg', NEW.peso_kg)
      );
    END IF;
  END IF;

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
      id_chip = CASE WHEN v_chip_livre THEN COALESCE(NULLIF(NEW.id_chip, ''), id_chip) ELSE id_chip END,
      id_brinco = CASE WHEN v_brinco_livre THEN COALESCE(NULLIF(NEW.id_brinco, ''), id_brinco) ELSE id_brinco END,
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
      id_chip = CASE WHEN v_chip_livre THEN COALESCE(NULLIF(NEW.id_chip, ''), id_chip) ELSE id_chip END,
      id_brinco = CASE WHEN v_brinco_livre THEN COALESCE(NULLIF(NEW.id_brinco, ''), id_brinco) ELSE id_brinco END,
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

CREATE OR REPLACE FUNCTION public.estornar_baixa_os(p_os_id uuid, p_usuario_id uuid DEFAULT NULL::uuid)
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
  IF public.caller_is_peao() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação restrita ao painel de gestão');
  END IF;

  SELECT * INTO v_os FROM public.ordens_servico WHERE id = p_os_id AND deleted_at IS NULL FOR UPDATE;
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
