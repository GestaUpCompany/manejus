-- Rollback de 20261020200000_fazendas_acesso_controle_individual.sql
-- Restaura a RPC como em 20261006200000_rpc_get_fazenda_por_acesso.sql e remove a coluna.
DROP FUNCTION IF EXISTS public.get_fazenda_por_acesso(text);

CREATE FUNCTION public.get_fazenda_por_acesso(p_acesso_id text)
RETURNS TABLE (
  id uuid,
  acesso_id text,
  nome text,
  ativo boolean,
  logo_url text,
  grupo_id uuid,
  timezone text,
  tolerancia_rotina_minutos integer,
  controle_acesso_habilitado boolean,
  acesso_confinamento boolean,
  acesso_comercial boolean,
  expediente_habilitado boolean,
  expediente_timezone text,
  expediente_dias jsonb,
  trava_suplementacao boolean,
  fp_escore_visivel_colaborador boolean,
  rbac_versao integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select
    f.id,
    f.acesso_id,
    f.nome,
    f.ativo,
    f.logo_url,
    f.grupo_id,
    f.timezone,
    f.tolerancia_rotina_minutos,
    f.controle_acesso_habilitado,
    f.acesso_confinamento,
    f.acesso_comercial,
    f.expediente_habilitado,
    f.expediente_timezone,
    f.expediente_dias,
    f.trava_suplementacao,
    f.fp_escore_visivel_colaborador,
    f.rbac_versao
  from public.fazendas f
  where lower(f.acesso_id) = lower(btrim(p_acesso_id));
$$;

GRANT EXECUTE ON FUNCTION public.get_fazenda_por_acesso(text) TO anon, authenticated;

ALTER TABLE public.fazendas DROP COLUMN IF EXISTS acesso_controle_individual;
