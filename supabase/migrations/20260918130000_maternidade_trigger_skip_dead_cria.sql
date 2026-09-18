
-- ----------------------------------------------------------------------------
-- Aborto/Natimorto: a cria não entra no rebanho.
--
-- O trigger create_individual_from_maternidade() criava um indivíduo sempre
-- que individuo_id_cria era NULL. Para crias mortas (aborto, natimorto de
-- gêmeos) isso falhava no NOT NULL de sexo — e pior, colocaria um animal
-- morto no rebanho como Vivo se os campos estivessem preenchidos.
-- Agora registros cujo tipo_parto contém 'Aborto' ou 'Natimorto' não geram
-- indivíduo nenhum.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_individual_from_maternidade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  pasto_uuid UUID;
  categoria_value TEXT;
  raca_normalizada TEXT;
  parto_array TEXT[];
  v_individuo_id UUID;
BEGIN
  IF NEW.individuo_id_cria IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Cria morta (aborto ou natimorto): não entra no rebanho.
  IF NEW.tipo_parto IS NOT NULL
     AND (NEW.tipo_parto ? 'Aborto' OR NEW.tipo_parto ? 'Natimorto') THEN
    RETURN NEW;
  END IF;

  IF NEW.sexo = 'Macho' THEN
    categoria_value := 'Bezerro ao Pé';
  ELSIF NEW.sexo = 'Fêmea' THEN
    categoria_value := 'Bezerra ao Pé';
  ELSE
    categoria_value := NULL;
  END IF;

  SELECT nome INTO raca_normalizada
  FROM public.racas
  WHERE fazenda_id = NEW.fazenda_id
    AND UPPER(TRIM(nome)) = UPPER(TRIM(COALESCE(NEW.raca, '')))
    AND (ativo IS NULL OR ativo = true)
  LIMIT 1;

  IF raca_normalizada IS NULL THEN
    raca_normalizada := NEW.raca;
  END IF;

  IF NEW.pasto_id IS NOT NULL THEN
    pasto_uuid := NEW.pasto_id;
  ELSE
    SELECT id INTO pasto_uuid FROM public.pastos WHERE nome = NEW.pasto AND fazenda_id = NEW.fazenda_id LIMIT 1;
  END IF;

  IF NEW.tipo_parto IS NOT NULL AND jsonb_array_length(NEW.tipo_parto) > 0 THEN
    SELECT ARRAY(SELECT value::text FROM jsonb_array_elements_text(NEW.tipo_parto) AS value) INTO parto_array;
  ELSE
    parto_array := NULL;
  END IF;

  INSERT INTO public.individuos (
    fazenda_id, data_nascimento, data_entrada_fazenda, peso_nascimento_kg,
    id_provisorio_cria, id_brinco, id_chip, lote_atual, pasto_atual, sexo, raca,
    parto, id_brinco_mae, id_chip_mae, categoria, origem, status, sync_status
  ) VALUES (
    NEW.fazenda_id, NEW.data::DATE, NEW.data::DATE, NEW.peso_cria_kg::NUMERIC,
    NEW.id_provisorio_cria, NEW.id_brinco_cria, NEW.id_chip_cria, NEW.lote_id,
    pasto_uuid, NEW.sexo, raca_normalizada,
    parto_array,
    NEW.id_brinco_mae, NEW.id_chip_mae, categoria_value, 'Nascimento', 'Vivo', 'automatico_incompleto'
  )
  RETURNING id INTO v_individuo_id;

  UPDATE public.registros_maternidade
  SET individuo_id_cria = v_individuo_id
  WHERE id = NEW.id;

  PERFORM public.notificar_individuo_incompleto(
    NEW.fazenda_id,
    v_individuo_id,
    NEW.id_provisorio_cria,
    NEW.id_brinco_cria,
    NEW.id_chip_cria
  );

  RETURN NEW;
END;
$function$;
