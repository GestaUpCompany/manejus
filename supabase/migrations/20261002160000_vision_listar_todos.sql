-- Vision'Up: vision_listar_relatorios passa a aceitar p_fazenda_id NULL,
-- listando todos os links Vision com o nome da fazenda. O controller do MVP
-- gerencia relatórios de qualquer fazenda e precisa ver os links gerados sem
-- selecionar fazenda nem subir planilha.
--
-- A mudança de assinatura de retorno exige DROP + CREATE (CREATE OR REPLACE não
-- altera o row type de uma function existente).

DROP FUNCTION IF EXISTS public.vision_listar_relatorios(uuid);

CREATE FUNCTION public.vision_listar_relatorios(p_fazenda_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, titulo text, config jsonb, criado_em timestamptz, expira_em timestamptz, ativo boolean, fazenda_nome text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT rp.id, rp.titulo, rp.config, rp.criado_em, rp.expira_em, rp.ativo, f.nome AS fazenda_nome
  FROM relatorios_publicos rp
  JOIN fazendas f ON f.id = rp.fazenda_id
  WHERE rp.tipo = 'vision'
    AND (p_fazenda_id IS NULL OR rp.fazenda_id = p_fazenda_id)
    AND vision_tem_acesso()
  ORDER BY rp.criado_em DESC
$$;
