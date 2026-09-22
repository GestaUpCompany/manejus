-- Ajuste nas RPCs de criação de item pelo PWA: quando a deduplicação por nome
-- encontra um item existente com controla_estoque=false, liga o flag. O usuário
-- esta registrando uma entrada de estoque; sem o flag o trigger ignoraria o
-- item silenciosamente e a entrada nao movimentaria saldo.

CREATE OR REPLACE FUNCTION public.criar_item_almoxarifado_pwa(
  p_id uuid,
  p_fazenda_id uuid,
  p_nome text,
  p_classificacao text,
  p_unidade text
)
RETURNS public.itens_almoxarifado
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item public.itens_almoxarifado;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.usuario_fazenda uf
    JOIN public.usuarios u ON u.id = uf.usuario_id
    WHERE u.auth_id = auth.uid()
      AND uf.fazenda_id = p_fazenda_id
      AND uf.ativo = true
  ) THEN
    RAISE EXCEPTION 'Usuário sem acesso a esta fazenda';
  END IF;

  IF p_nome IS NULL OR btrim(p_nome) = '' THEN
    RAISE EXCEPTION 'Nome do item é obrigatório';
  END IF;
  IF p_classificacao IS NULL OR p_classificacao NOT IN (
    'Ferramentas','Peças','Hidráulica','Elétrica','Insumos','Fertilizantes',
    'Corretivos','Defensivos','Herbicidas','Fungicidas','Inseticidas',
    'Adjuvantes','Sementes','Medicamentos','Equipamentos','Combustíveis',
    'Lubrificantes','EPI','Materiais de Construção'
  ) THEN
    RAISE EXCEPTION 'Classificação inválida';
  END IF;
  IF p_unidade IS NULL OR btrim(p_unidade) = '' THEN
    RAISE EXCEPTION 'Unidade é obrigatória';
  END IF;

  -- Retry de sync com o mesmo id: retorna o item ja criado.
  SELECT * INTO v_item FROM public.itens_almoxarifado WHERE id = p_id;
  IF FOUND THEN RETURN v_item; END IF;

  -- Dedup por nome normalizado na fazenda (item ja cadastrado no painel).
  SELECT * INTO v_item
  FROM public.itens_almoxarifado
  WHERE fazenda_id = p_fazenda_id
    AND lower(btrim(nome)) = lower(btrim(p_nome))
    AND deleted_at IS NULL
  LIMIT 1;
  IF FOUND THEN
    IF NOT v_item.controla_estoque THEN
      UPDATE public.itens_almoxarifado
         SET controla_estoque = true, updated_at = now()
       WHERE id = v_item.id
       RETURNING * INTO v_item;
    END IF;
    RETURN v_item;
  END IF;

  INSERT INTO public.itens_almoxarifado
    (id, fazenda_id, nome, classificacao, unidade, controla_estoque)
  VALUES (p_id, p_fazenda_id, btrim(p_nome), p_classificacao, btrim(p_unidade), true)
  RETURNING * INTO v_item;

  RETURN v_item;
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_item_cantina_pwa(
  p_id uuid,
  p_fazenda_id uuid,
  p_nome text,
  p_classificacao text,
  p_unidade_medida text
)
RETURNS public.itens_cantina
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item public.itens_cantina;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.usuario_fazenda uf
    JOIN public.usuarios u ON u.id = uf.usuario_id
    WHERE u.auth_id = auth.uid()
      AND uf.fazenda_id = p_fazenda_id
      AND uf.ativo = true
  ) THEN
    RAISE EXCEPTION 'Usuário sem acesso a esta fazenda';
  END IF;

  IF p_nome IS NULL OR btrim(p_nome) = '' THEN
    RAISE EXCEPTION 'Nome do item é obrigatório';
  END IF;
  IF p_classificacao IS NULL OR p_classificacao NOT IN (
    'Perecíveis','Não Perecíveis','Bebidas','Limpeza/Higiene','Hortifruti','Carnes'
  ) THEN
    RAISE EXCEPTION 'Classificação inválida';
  END IF;
  IF p_unidade_medida IS NULL OR p_unidade_medida NOT IN
    ('kg','g','L','mL','Unidade','Pacote') THEN
    RAISE EXCEPTION 'Unidade de medida inválida';
  END IF;

  SELECT * INTO v_item FROM public.itens_cantina WHERE id = p_id;
  IF FOUND THEN RETURN v_item; END IF;

  SELECT * INTO v_item
  FROM public.itens_cantina
  WHERE fazenda_id = p_fazenda_id
    AND lower(btrim(nome)) = lower(btrim(p_nome))
    AND deleted_at IS NULL
  LIMIT 1;
  IF FOUND THEN
    IF NOT v_item.controla_estoque THEN
      UPDATE public.itens_cantina
         SET controla_estoque = true, updated_at = now()
       WHERE id = v_item.id
       RETURNING * INTO v_item;
    END IF;
    RETURN v_item;
  END IF;

  INSERT INTO public.itens_cantina
    (id, fazenda_id, nome, classificacao, unidade_medida, controla_estoque)
  VALUES (p_id, p_fazenda_id, btrim(p_nome), p_classificacao, p_unidade_medida, true)
  RETURNING * INTO v_item;

  RETURN v_item;
END;
$function$;
