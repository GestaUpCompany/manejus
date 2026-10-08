-- ROLLBACK de 20261008120000_endurecer_triggers_pesagem_e_mae.sql
-- NÃO fica em supabase/migrations/ de propósito. Restaura os corpos anteriores dos dois gatilhos
-- (copiados do banco em 08/10/2026 antes da migration).

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

CREATE OR REPLACE FUNCTION public.ensure_mother_from_maternidade()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  mother_id UUID;
  is_new_mother BOOLEAN := false;
  raca_cria TEXT;
BEGIN
  IF NEW.individuo_id_mae IS NULL AND (
    NEW.id_brinco_mae IS NOT NULL OR
    NEW.id_chip_mae IS NOT NULL OR
    NEW.id_manejo_mae IS NOT NULL
  ) THEN
    SELECT id INTO mother_id
    FROM public.individuos
    WHERE fazenda_id = NEW.fazenda_id
      AND sexo = 'Fêmea'
      AND (
        (NEW.id_brinco_mae IS NOT NULL AND id_brinco = NEW.id_brinco_mae) OR
        (NEW.id_chip_mae IS NOT NULL AND id_chip = NEW.id_chip_mae) OR
        (NEW.id_manejo_mae IS NOT NULL AND id_manejo = NEW.id_manejo_mae)
      )
    LIMIT 1;

    IF mother_id IS NULL THEN
      is_new_mother := true;
      raca_cria := NEW.raca;
      IF raca_cria IS NULL OR raca_cria = '' THEN
        raca_cria := 'SRD';
      END IF;

      INSERT INTO public.individuos (
        fazenda_id, id_manejo, id_brinco, id_chip, sexo, raca,
        categoria, classificacao_matriz, numero_partos, origem, status
      ) VALUES (
        NEW.fazenda_id,
        NEW.id_manejo_mae,
        NEW.id_brinco_mae,
        NEW.id_chip_mae,
        'Fêmea',
        raca_cria,
        'Vaca Vazia',
        NEW.categoria_mae,
        1,
        NULL,
        'Vivo'
      )
      RETURNING id INTO mother_id;
    END IF;

    UPDATE public.registros_maternidade
    SET individuo_id_mae = mother_id
    WHERE id = NEW.id;

    IF NEW.individuo_id_cria IS NOT NULL THEN
      UPDATE public.individuos
      SET mae = mother_id,
          id_brinco_mae = NULL,
          id_chip_mae = NULL
      WHERE id = NEW.individuo_id_cria
        AND mae IS NULL;
    END IF;

    -- Sempre recalcula classificacao_matriz e numero_partos para manter consistencia
    UPDATE public.individuos
    SET classificacao_matriz = compute_classificacao_matriz(mother_id),
        numero_partos = (
          SELECT COUNT(*) FROM public.registros_maternidade
          WHERE individuo_id_mae = mother_id AND deleted_at IS NULL
        )
    WHERE id = mother_id;
  END IF;

  RETURN NEW;
END;
$function$;
