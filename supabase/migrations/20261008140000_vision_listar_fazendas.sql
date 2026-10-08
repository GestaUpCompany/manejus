-- Vision'Up: lista de fazendas para o seletor do relatório.
--
-- Após o isolamento de tenant (20261006180000) a policy SELECT de fazendas só
-- mostra fazendas com vínculo, do mesmo grupo ou para admin. O usuário Vision
-- (usuarios.acesso_vision) escolhe qualquer fazenda ativa, então a leitura vai
-- por RPC SECURITY DEFINER gateada por vision_tem_acesso(), sem afrouxar a RLS.

CREATE OR REPLACE FUNCTION public.vision_listar_fazendas()
RETURNS TABLE(id uuid, nome text, acesso_id text, logo_url text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT f.id, f.nome, f.acesso_id, f.logo_url
  FROM fazendas f
  WHERE f.ativo = true
    AND vision_tem_acesso()
  ORDER BY f.nome
$$;

REVOKE ALL ON FUNCTION public.vision_listar_fazendas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vision_listar_fazendas() TO authenticated;
