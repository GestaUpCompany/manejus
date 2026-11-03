-- Estoque de farmácia em frascos inteiros.
-- 1) criar_medicamento_pwa força 'frasco'; o conteúdo da embalagem vira apenas informativo.
-- 2) A baixa da Enfermaria passa a ler o inteiro `frascosUsados` de cada item de registros_enfermaria.medicamentos
--    (a dose em mL/mg continua só como texto). Item sem `frascosUsados` válido não baixa estoque.
-- farmacia_dose_para_estoque fica no banco, sem uso (deprecated).
-- As CHECK constraints (quantidade inteira; controla_estoque => unidade 'frasco') vão numa migration POSTERIOR,
-- depois da conversão dos dados: mesmo NOT VALID, o CHECK vale para todo UPDATE e quebraria o recálculo de saldo
-- dos medicamentos ainda em 'un'/'dose'.

COMMENT ON FUNCTION public.farmacia_dose_para_estoque(text, text, numeric, text)
  IS 'DEPRECATED: a baixa da Enfermaria usa frascosUsados (inteiro). Mantida só por compatibilidade.';

CREATE OR REPLACE FUNCTION public.criar_medicamento_pwa(
  p_id uuid, p_fazenda_id uuid, p_nome_comercial text, p_tipo text, p_unidade text,
  p_principio_ativo text DEFAULT NULL::text, p_conteudo numeric DEFAULT NULL::numeric,
  p_conteudo_unidade text DEFAULT NULL::text, p_sku text DEFAULT NULL::text)
RETURNS medicamentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_med public.medicamentos;
  v_tipo public.medicamento_tipo;
  v_sku text := NULLIF(btrim(p_sku), '');
BEGIN
  IF NOT public.caller_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Usuário sem acesso a esta fazenda';
  END IF;

  IF p_nome_comercial IS NULL OR btrim(p_nome_comercial) = '' THEN
    RAISE EXCEPTION 'Nome do medicamento é obrigatório';
  END IF;
  BEGIN
    v_tipo := p_tipo::public.medicamento_tipo;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Tipo de medicamento inválido';
  END;
  -- p_unidade é ignorado: o estoque de farmácia é sempre em frascos inteiros (parâmetro mantido por compatibilidade com PWAs antigos).
  IF (p_conteudo IS NULL) <> (p_conteudo_unidade IS NULL)
     OR (p_conteudo IS NOT NULL AND (p_conteudo <= 0 OR p_conteudo_unidade NOT IN ('mL', 'mg'))) THEN
    RAISE EXCEPTION 'Conteúdo da embalagem inválido';
  END IF;

  -- Retry de sync com o mesmo id
  SELECT * INTO v_med FROM public.medicamentos WHERE id = p_id AND fazenda_id = p_fazenda_id;
  IF FOUND THEN RETURN v_med; END IF;

  -- Já cadastrado no painel: primeiro pelo SKU, depois pelo nome (ignora maiúsculas e espaços nas pontas)
  v_med := NULL;
  IF v_sku IS NOT NULL THEN
    SELECT * INTO v_med
    FROM public.medicamentos
    WHERE fazenda_id = p_fazenda_id AND lower(sku) = lower(v_sku) AND deleted_at IS NULL
    LIMIT 1;
  END IF;
  IF v_med.id IS NULL THEN
    SELECT * INTO v_med
    FROM public.medicamentos
    WHERE fazenda_id = p_fazenda_id
      AND lower(btrim(nome_comercial)) = lower(btrim(p_nome_comercial))
      AND deleted_at IS NULL
    LIMIT 1;
  END IF;
  IF v_med.id IS NOT NULL THEN
    IF NOT v_med.controla_estoque THEN
      IF EXISTS (SELECT 1 FROM public.movimentacoes_farmacia WHERE medicamento_id = v_med.id AND deleted_at IS NULL) THEN
        UPDATE public.medicamentos SET controla_estoque = true WHERE id = v_med.id RETURNING * INTO v_med;
      ELSE
        UPDATE public.medicamentos
        SET controla_estoque = true,
            unidade = 'frasco',
            conteudo_por_unidade = COALESCE(p_conteudo, conteudo_por_unidade),
            conteudo_unidade = COALESCE(p_conteudo_unidade, conteudo_unidade)
        WHERE id = v_med.id
        RETURNING * INTO v_med;
      END IF;
    END IF;
    -- Preenche o SKU do existente se ele ainda não tinha e o app informou um
    IF v_med.sku IS NULL AND v_sku IS NOT NULL THEN
      UPDATE public.medicamentos SET sku = v_sku WHERE id = v_med.id RETURNING * INTO v_med;
    END IF;
    RETURN v_med;
  END IF;

  INSERT INTO public.medicamentos
    (id, fazenda_id, tipo, nome_comercial, principio_ativo, dose_recomendada, unidade, conteudo_por_unidade, conteudo_unidade, controla_estoque, ativo, sku)
  VALUES
    (p_id, p_fazenda_id, v_tipo, btrim(p_nome_comercial), COALESCE(NULLIF(btrim(p_principio_ativo), ''), 'Não informado'), 'Não informada',
     'frasco', p_conteudo, p_conteudo_unidade, true, true, v_sku)
  RETURNING * INTO v_med;
  RETURN v_med;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_enfermaria_baixa_farmacia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item record;
  v_med_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.medicamentos IS NOT DISTINCT FROM NEW.medicamentos
     AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at
     AND OLD.data IS NOT DISTINCT FROM NEW.data THEN
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE public.movimentacoes_farmacia
    SET deleted_at = now(), updated_at = now()
    WHERE registro_origem_id = OLD.id AND origem = 'enfermaria' AND deleted_at IS NULL;
  END IF;
  IF TG_OP = 'DELETE' OR NEW.deleted_at IS NOT NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  -- Soma os frascos inteiros por medicamento. Só conta frascosUsados composto apenas de dígitos (> 0).
  FOR v_item IN
    SELECT i.value->>'medicamentoId' AS mid_txt,
           SUM((i.value->>'frascosUsados')::integer) AS frascos
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(NEW.medicamentos) = 'array' THEN NEW.medicamentos ELSE '[]'::jsonb END
         ) i
    WHERE (i.value->>'frascosUsados') ~ '^[0-9]{1,6}$'
    GROUP BY 1
  LOOP
    IF v_item.frascos IS NULL OR v_item.frascos <= 0 THEN CONTINUE; END IF;
    BEGIN
      SELECT id INTO v_med_id
      FROM public.medicamentos
      WHERE id = NULLIF(v_item.mid_txt, '')::uuid
        AND fazenda_id = NEW.fazenda_id AND controla_estoque AND deleted_at IS NULL;
    EXCEPTION WHEN invalid_text_representation THEN
      CONTINUE;
    END;
    IF v_med_id IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.movimentacoes_farmacia
      (fazenda_id, medicamento_id, tipo_movimentacao, quantidade, origem, registro_origem_id, data, nome_usuario, observacao)
    VALUES
      (NEW.fazenda_id, v_med_id, 'baixa', v_item.frascos, 'enfermaria', NEW.id,
       (NEW.data AT TIME ZONE 'America/Cuiaba')::date, NEW.nome_usuario, 'Baixa automática da Enfermaria');
    v_med_id := NULL;
  END LOOP;
  RETURN NEW;
END;
$function$;
