-- Corrige 42P17 "infinite recursion detected in policy for relation fazendas".
--
-- A policy fazendas_select_vinculo_ou_grupo fazia EXISTS sobre a propria tabela
-- fazendas para o check de mesmo grupo; subqueries em policy avaliam RLS de novo,
-- gerando recursao. O check de grupo vai para funcao SECURITY DEFINER, cujo owner
-- le fazendas sem RLS.

create or replace function public.caller_mesmo_grupo_fazenda(p_fazenda_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.fazendas alvo
    join public.fazendas mf
      on mf.grupo_id = alvo.grupo_id
     and mf.grupo_id is not null
    where alvo.id = p_fazenda_id
      and public.caller_has_fazenda_access(mf.id)
  );
$$;

grant execute on function public.caller_mesmo_grupo_fazenda(uuid) to authenticated;

drop policy if exists "fazendas_select_vinculo_ou_grupo" on public.fazendas;

create policy "fazendas_select_vinculo_ou_grupo" on public.fazendas
  for select to authenticated
  using (
    public.caller_has_fazenda_access(id)
    or public.is_admin_user()
    or public.caller_mesmo_grupo_fazenda(id)
  );
