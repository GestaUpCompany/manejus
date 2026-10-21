-- Rollback de 20261021140000_medicamentos_sku.sql
-- Remove o SKU (os códigos já gravados são perdidos) e restaura a versão anterior da RPC (sem p_sku).
DROP FUNCTION IF EXISTS public.criar_medicamento_pwa(uuid, uuid, text, text, text, text, numeric, text, text);
DROP INDEX IF EXISTS public.uq_medicamentos_fazenda_sku;
DROP TRIGGER IF EXISTS trg_medicamentos_normalizar_sku ON public.medicamentos;
DROP FUNCTION IF EXISTS public.medicamentos_normalizar_sku();
ALTER TABLE public.medicamentos DROP COLUMN IF EXISTS sku;

CREATE OR REPLACE FUNCTION public.criar_medicamento_pwa(
  p_id uuid,
  p_fazenda_id uuid,
  p_nome_comercial text,
  p_tipo text,
  p_unidade text,
  p_principio_ativo text DEFAULT NULL,
  p_conteudo numeric DEFAULT NULL,
  p_conteudo_unidade text DEFAULT NULL
)
RETURNS public.medicamentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_med public.medicamentos;
  v_tipo public.medicamento_tipo;
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
  IF p_unidade IS NULL OR p_unidade NOT IN ('un', 'dose', 'frasco', 'caixa', 'mL', 'L', 'g', 'kg') THEN
    RAISE EXCEPTION 'Unidade de medida inválida';
  END IF;
  IF (p_conteudo IS NULL) <> (p_conteudo_unidade IS NULL)
     OR (p_conteudo IS NOT NULL AND (p_conteudo <= 0 OR p_conteudo_unidade NOT IN ('mL', 'mg'))) THEN
    RAISE EXCEPTION 'Conteúdo da embalagem inválido';
  END IF;

  -- Retry de sync com o mesmo id
  SELECT * INTO v_med FROM public.medicamentos WHERE id = p_id AND fazenda_id = p_fazenda_id;
  IF FOUND THEN RETURN v_med; END IF;

  -- Já cadastrado no painel (dedupe por nome na fazenda)
  SELECT * INTO v_med
  FROM public.medicamentos
  WHERE fazenda_id = p_fazenda_id
    AND lower(btrim(nome_comercial)) = lower(btrim(p_nome_comercial))
    AND deleted_at IS NULL
  LIMIT 1;
  IF FOUND THEN
    IF NOT v_med.controla_estoque THEN
      IF EXISTS (SELECT 1 FROM public.movimentacoes_farmacia WHERE medicamento_id = v_med.id AND deleted_at IS NULL) THEN
        UPDATE public.medicamentos SET controla_estoque = true WHERE id = v_med.id RETURNING * INTO v_med;
      ELSE
        UPDATE public.medicamentos
        SET controla_estoque = true,
            unidade = p_unidade,
            conteudo_por_unidade = COALESCE(p_conteudo, conteudo_por_unidade),
            conteudo_unidade = COALESCE(p_conteudo_unidade, conteudo_unidade)
        WHERE id = v_med.id
        RETURNING * INTO v_med;
      END IF;
    END IF;
    RETURN v_med;
  END IF;

  INSERT INTO public.medicamentos
    (id, fazenda_id, tipo, nome_comercial, principio_ativo, unidade, conteudo_por_unidade, conteudo_unidade, controla_estoque, ativo)
  VALUES
    (p_id, p_fazenda_id, v_tipo, btrim(p_nome_comercial), COALESCE(NULLIF(btrim(p_principio_ativo), ''), 'Não informado'),
     p_unidade, p_conteudo, p_conteudo_unidade, true, true)
  RETURNING * INTO v_med;
  RETURN v_med;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.criar_medicamento_pwa(uuid, uuid, text, text, text, text, numeric, text) TO authenticated;
