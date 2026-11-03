-- Troca de fazenda no PWA entre fazendas do mesmo grupo, sem digitar acesso_id.
-- A origem vem do JWT do peão (nunca de parâmetro). Falhas devolvem sempre o mesmo
-- {success:false}, sem revelar se o destino existe. Só função nova: não altera tabela,
-- policy nem o login atual (autenticar_peao_app).
CREATE OR REPLACE FUNCTION public.trocar_fazenda_grupo(p_fazenda_destino_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origem uuid;
  v_grupo_o uuid;
  v_f record;
  v_p record;
BEGIN
  SELECT f.id, f.grupo_id INTO v_origem, v_grupo_o
  FROM public.peoes p
  JOIN public.fazendas f ON f.acesso_id = p.fazenda_id
  WHERE lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    AND coalesce(p.ativo, false) = true
    AND coalesce(f.ativo, false) = true
  LIMIT 1;

  IF v_origem IS NULL OR v_grupo_o IS NULL OR p_fazenda_destino_id IS NULL
     OR v_origem = p_fazenda_destino_id THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  SELECT f.id, f.grupo_id, f.acesso_id INTO v_f
  FROM public.fazendas f
  WHERE f.id = p_fazenda_destino_id AND coalesce(f.ativo, false) = true;

  IF v_f.id IS NULL OR v_f.grupo_id IS DISTINCT FROM v_grupo_o THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  SELECT p.email, p.password INTO v_p
  FROM public.peoes p
  WHERE p.fazenda_id = v_f.acesso_id AND coalesce(p.ativo, false) = true
  LIMIT 1;

  IF v_p.email IS NULL THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'acesso_id', v_f.acesso_id,
    'email', v_p.email,
    'password', v_p.password
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trocar_fazenda_grupo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trocar_fazenda_grupo(uuid) TO authenticated;
