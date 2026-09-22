-- Classificacao de itens vira lista fechada (CHECK) e o PWA ganha RPCs para
-- criar itens durante a entrada de estoque (peao nao tem INSERT direto nas
-- tabelas itens_*, que sao restritas a admin/controller).

ALTER TABLE public.itens_almoxarifado
  ADD CONSTRAINT itens_almoxarifado_classificacao_check
  CHECK (classificacao IN (
    'Ferramentas','Peças','Hidráulica','Elétrica','Insumos','Fertilizantes',
    'Corretivos','Defensivos','Herbicidas','Fungicidas','Inseticidas',
    'Adjuvantes','Sementes','Medicamentos','Equipamentos','Combustíveis',
    'Lubrificantes','EPI','Materiais de Construção'
  ));

ALTER TABLE public.itens_cantina
  ADD CONSTRAINT itens_cantina_classificacao_check
  CHECK (classificacao IN (
    'Perecíveis','Não Perecíveis','Bebidas','Limpeza/Higiene','Hortifruti','Carnes'
  ));

-- Cria item de almoxarifado a partir do PWA (entrada de estoque).
-- Idempotente por p_id (retry de sync) e deduplica por nome na fazenda:
-- se ja existe item com o mesmo nome, retorna o existente em vez de duplicar.
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
  IF FOUND THEN RETURN v_item; END IF;

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
  IF FOUND THEN RETURN v_item; END IF;

  INSERT INTO public.itens_cantina
    (id, fazenda_id, nome, classificacao, unidade_medida, controla_estoque)
  VALUES (p_id, p_fazenda_id, btrim(p_nome), p_classificacao, p_unidade_medida, true)
  RETURNING * INTO v_item;

  RETURN v_item;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.criar_item_almoxarifado_pwa(uuid, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_item_cantina_pwa(uuid, uuid, text, text, text) TO authenticated;
