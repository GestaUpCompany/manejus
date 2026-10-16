-- ============================================================================
-- Indivíduos / Fase 0.3: peso_atual_kg com origem explícita e um só ritmo de atualização
-- ============================================================================
-- Escritores de peso_atual_kg: trigger de pesagem (peso medido), cron diário (estimativa por GMD) e formulário.
--   * peso_atual_origem ('pesagem' | 'estimado' | 'manual') e peso_atual_data dizem de onde veio o número.
--   * Trigger de pesagem: grava origem 'pesagem' e a data da pesagem (corpo base: 20261015200000).
--   * Cron update_pesos_individuos: só animal Vivo, só soma GMD se o peso é de dia anterior a hoje (nunca
--     soma duas vezes no mesmo dia nem em animal baixado) e marca origem 'estimado'.
--   * Remove atualizar_pesos_em_lote, calcular_peso_vivo_atual_individual e listar_individuos_para_atualizacao_peso:
--     sem uso no código, a primeira sobrescrevia pesagens e a segunda tinha bug (dias * dias).
--   * Backfill (só tabela individuos, sem tocar identificação): origem 'pesagem' para quem tem pesagem, 'manual' para os demais com peso.
-- Rollback: supabase/rollbacks/20261015210000_peso_atual_origem_e_cron_rollback.sql
-- ============================================================================

ALTER TABLE public.individuos
  ADD COLUMN IF NOT EXISTS peso_atual_origem text,
  ADD COLUMN IF NOT EXISTS peso_atual_data date;

ALTER TABLE public.individuos
  DROP CONSTRAINT IF EXISTS individuos_peso_atual_origem_check;
ALTER TABLE public.individuos
  ADD CONSTRAINT individuos_peso_atual_origem_check
  CHECK (peso_atual_origem IS NULL OR peso_atual_origem IN ('pesagem', 'estimado', 'manual'));

UPDATE public.individuos i
SET peso_atual_origem = 'pesagem',
    peso_atual_data = (SELECT max(p.data) FROM public.registros_pesagem p WHERE p.individuo_id = i.id AND p.deleted_at IS NULL)
WHERE i.peso_atual_kg IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.registros_pesagem p WHERE p.individuo_id = i.id AND p.deleted_at IS NULL);

UPDATE public.individuos
SET peso_atual_origem = 'manual'
WHERE peso_atual_kg IS NOT NULL AND peso_atual_origem IS NULL;

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
  v_data_saida_os date;
  v_comprador text;
  v_fazenda_destino_id uuid;
  v_motivo_saida text;
  v_destino_saida text;
  v_move boolean;
  v_confirma boolean;
  v_cur RECORD;
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

    SELECT tipo, tipo_venda, data_saida, comprador, fazenda_destino_id
    INTO v_tipo_os, v_tipo_venda, v_data_saida_os, v_comprador, v_fazenda_destino_id
    FROM public.ordens_servico WHERE id = NEW.os_id;
    v_status_venda := CASE
      WHEN v_tipo_os = 'transferencia' THEN 'Transferido'
      WHEN v_tipo_venda = 'abate' THEN 'Abatido'
      ELSE 'Venda Vivo'
    END;
    v_motivo_saida := CASE
      WHEN v_tipo_os = 'transferencia' THEN 'Transferência'
      WHEN v_tipo_venda = 'abate' THEN 'Abate'
      ELSE 'Venda'
    END;
    v_destino_saida := CASE
      WHEN v_tipo_os = 'transferencia' THEN (SELECT f.nome FROM public.fazendas f WHERE f.id = v_fazenda_destino_id)
      ELSE NULLIF(btrim(v_comprador), '')
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
      peso_atual_origem = CASE WHEN NEW.peso_kg IS NOT NULL THEN 'pesagem' ELSE peso_atual_origem END,
      peso_atual_data = CASE WHEN NEW.peso_kg IS NOT NULL THEN COALESCE((NEW.data AT TIME ZONE 'America/Cuiaba')::date, CURRENT_DATE) ELSE peso_atual_data END,
      idade_era = COALESCE(NEW.idade_era, idade_era),
      idade_atual_dias = COALESCE(NEW.idade_dias, idade_atual_dias),
      status = v_status_venda,
      -- Só registra a saída quando o animal estava Vivo: não sobrescreve a baixa anterior de um animal já baixado
      data_saida = CASE WHEN v_status_anterior = 'Vivo'
                        THEN COALESCE(v_data_saida_os, (NEW.data AT TIME ZONE 'America/Cuiaba')::date)
                        ELSE data_saida END,
      motivo_saida = CASE WHEN v_status_anterior = 'Vivo' THEN v_motivo_saida ELSE motivo_saida END,
      destino_saida = CASE WHEN v_status_anterior = 'Vivo' THEN v_destino_saida ELSE destino_saida END,
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
    -- Só os tipos que têm evento agregado próprio (entrada por compra/transferência, apartação, processamento
    -- pós-compra) movem o animal. Nos demais, a pesagem atualiza peso/idade, mas não muda lote, categoria nem
    -- raça: o agregado (quant_atual) não mudou, então mover o indivíduo criaria divergência sem aviso.
    v_move := NEW.tipo_manejo IN ('compra', 'processamento', 'transf_entrada', 'apartacao');

    SELECT i.lote_atual, i.categoria, i.raca, i.localizacao_incerta_desde
    INTO v_cur
    FROM public.individuos i WHERE i.id = v_individuo_id;

    -- Pesagem com leitura de brinco/chip num lote confirma onde o animal está: tipos com evento agregado
    -- próprio movem o animal, e um animal com localização incerta (apartação só por contagem) passa a ter o
    -- lote da pesagem. Em ambos os casos a incerteza é limpa.
    v_confirma := NEW.lote_id IS NOT NULL AND (v_move OR v_cur.localizacao_incerta_desde IS NOT NULL);

    IF NOT v_move THEN
      IF NEW.lote_id IS NOT NULL AND NOT v_confirma AND v_cur.lote_atual IS DISTINCT FROM NEW.lote_id THEN
        INSERT INTO public.logs_sync_errors (fazenda_id, caderneta, registro_id, operation, error_code, error_message, error_details, payload)
        VALUES (NEW.fazenda_id, 'pesagem', NEW.local_id, 'trg_registros_pesagem_upsert_individuo',
          'PESAGEM_LOTE_DIVERGENTE',
          'Lote da pesagem difere do lote do indivíduo; lote do animal mantido',
          'Individuo: ' || v_individuo_id::text || ' | Lote do animal: ' || COALESCE(v_cur.lote_atual::text, 'NULL') || ' | Lote da pesagem: ' || NEW.lote_id::text || ' | Tipo: ' || COALESCE(NEW.tipo_manejo, 'NULL'),
          jsonb_build_object('individuo_id', v_individuo_id, 'lote_animal', v_cur.lote_atual, 'lote_pesagem', NEW.lote_id, 'tipo_manejo', NEW.tipo_manejo));
      END IF;

      IF NEW.categoria IS NOT NULL AND lower(btrim(COALESCE(v_cur.categoria, ''))) <> lower(btrim(NEW.categoria)) THEN
        INSERT INTO public.logs_sync_errors (fazenda_id, caderneta, registro_id, operation, error_code, error_message, error_details, payload)
        VALUES (NEW.fazenda_id, 'pesagem', NEW.local_id, 'trg_registros_pesagem_upsert_individuo',
          'PESAGEM_CATEGORIA_DIVERGENTE',
          'Categoria da pesagem difere da categoria do indivíduo; categoria do animal mantida',
          'Individuo: ' || v_individuo_id::text || ' | Categoria do animal: ' || COALESCE(v_cur.categoria, 'NULL') || ' | Categoria da pesagem: ' || NEW.categoria || ' | Tipo: ' || COALESCE(NEW.tipo_manejo, 'NULL'),
          jsonb_build_object('individuo_id', v_individuo_id, 'categoria_animal', v_cur.categoria, 'categoria_pesagem', NEW.categoria, 'tipo_manejo', NEW.tipo_manejo));
      END IF;

      IF NEW.raca IS NOT NULL AND lower(btrim(COALESCE(v_cur.raca, ''))) <> lower(btrim(NEW.raca)) THEN
        INSERT INTO public.logs_sync_errors (fazenda_id, caderneta, registro_id, operation, error_code, error_message, error_details, payload)
        VALUES (NEW.fazenda_id, 'pesagem', NEW.local_id, 'trg_registros_pesagem_upsert_individuo',
          'PESAGEM_RACA_DIVERGENTE',
          'Raça da pesagem difere da raça do indivíduo; raça do animal mantida',
          'Individuo: ' || v_individuo_id::text || ' | Raça do animal: ' || COALESCE(v_cur.raca, 'NULL') || ' | Raça da pesagem: ' || NEW.raca || ' | Tipo: ' || COALESCE(NEW.tipo_manejo, 'NULL'),
          jsonb_build_object('individuo_id', v_individuo_id, 'raca_animal', v_cur.raca, 'raca_pesagem', NEW.raca, 'tipo_manejo', NEW.tipo_manejo));
      END IF;
    END IF;

    UPDATE public.individuos
    SET
      id_chip = CASE WHEN v_chip_livre THEN COALESCE(NULLIF(NEW.id_chip, ''), id_chip) ELSE id_chip END,
      id_brinco = CASE WHEN v_brinco_livre THEN COALESCE(NULLIF(NEW.id_brinco, ''), id_brinco) ELSE id_brinco END,
      sexo = COALESCE(NEW.sexo, sexo),
      categoria = CASE WHEN v_move THEN COALESCE(NEW.categoria, categoria) ELSE categoria END,
      raca = CASE WHEN v_move THEN COALESCE(NEW.raca, raca) ELSE raca END,
      lote_atual = CASE WHEN v_confirma THEN NEW.lote_id ELSE lote_atual END,
      localizacao_incerta_desde = CASE WHEN v_confirma THEN NULL ELSE localizacao_incerta_desde END,
      peso_atual_kg = COALESCE(NEW.peso_kg, peso_atual_kg),
      peso_atual_origem = CASE WHEN NEW.peso_kg IS NOT NULL THEN 'pesagem' ELSE peso_atual_origem END,
      peso_atual_data = CASE WHEN NEW.peso_kg IS NOT NULL THEN COALESCE((NEW.data AT TIME ZONE 'America/Cuiaba')::date, CURRENT_DATE) ELSE peso_atual_data END,
      idade_era = COALESCE(NEW.idade_era, idade_era),
      idade_atual_dias = COALESCE(NEW.idade_dias, idade_atual_dias),
      updated_at = now()
    WHERE id = v_individuo_id;
  ELSE
    INSERT INTO public.individuos (
      fazenda_id, id_chip, id_brinco, sexo, categoria, raca,
      lote_atual, peso_atual_kg, peso_atual_origem, peso_atual_data, idade_era, idade_atual_dias,
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
      CASE WHEN NEW.peso_kg IS NOT NULL THEN 'pesagem' END,
      CASE WHEN NEW.peso_kg IS NOT NULL THEN COALESCE((NEW.data AT TIME ZONE 'America/Cuiaba')::date, CURRENT_DATE) END,
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

CREATE OR REPLACE FUNCTION public.update_pesos_individuos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
BEGIN
  -- Estimativa diária: peso + GMD, só animal Vivo e só uma vez por dia (peso_atual_data < hoje)
  UPDATE public.individuos i
  SET peso_atual_kg = COALESCE(i.peso_atual_kg, i.pv_entrada_kg, i.peso_nascimento_kg) + i.gmd_kg_cab_dia,
      peso_atual_origem = CASE WHEN i.peso_atual_origem = 'pesagem' THEN 'pesagem' ELSE 'estimado' END,
      peso_atual_data = CURRENT_DATE,
      updated_at = now()
  WHERE i.deleted_at IS NULL
    AND i.status = 'Vivo'
    AND i.gmd_kg_cab_dia > 0
    AND COALESCE(i.peso_atual_kg, i.pv_entrada_kg, i.peso_nascimento_kg) IS NOT NULL
    AND (i.peso_atual_data IS NULL OR i.peso_atual_data < CURRENT_DATE);
END;
$function$;

DROP FUNCTION IF EXISTS public.atualizar_pesos_em_lote(integer, boolean, numeric);
DROP FUNCTION IF EXISTS public.calcular_peso_vivo_atual_individual(uuid, boolean);
DROP FUNCTION IF EXISTS public.listar_individuos_para_atualizacao_peso;
