-- criar_medicamento_pwa passa a aceitar a unidade 'un' no conteúdo da embalagem (ex.: implante).
-- Corpo idêntico ao de 20261103200000_farmacia_frasco_inteiro.sql; só muda a lista aceita em p_conteudo_unidade.
-- Depende de 20261111100000_farmacia_unidade_un.sql (CHECK já aceita 'un').
-- Rollback: volte a lista para ('mL', 'mg') na versão de 20261103200000_farmacia_frasco_inteiro.sql.

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
     OR (p_conteudo IS NOT NULL AND (p_conteudo <= 0 OR p_conteudo_unidade NOT IN ('mL', 'mg', 'un'))) THEN
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
