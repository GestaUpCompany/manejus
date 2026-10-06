-- RPC publica de leitura minima de fazenda por acesso_id.
--
-- Com o isolamento de tenant (20261006180000), o role anon nao le mais a tabela
-- fazendas. O PWA precisa consultar a fazenda antes/durante a autenticacao do
-- peao (checkFarmActiveStatus no boot do app e getFazendaByAcessoId na janela
-- sem token). Sem esta RPC o app mostrava "Fazenda desativada" para fazendas
-- ativas.
--
-- Expoe apenas campos operacionais; cnpj/endereco/telefone/email/planilha_id/
-- bounding_box ficam fora. O caller precisa conhecer o acesso_id, entao a
-- funcao nao permite enumeracao alem do que a tela de login ja exige.

create or replace function public.get_fazenda_por_acesso(p_acesso_id text)
returns table (
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
language sql
stable
security definer
set search_path to 'public'
as $$
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

grant execute on function public.get_fazenda_por_acesso(text) to anon, authenticated;
