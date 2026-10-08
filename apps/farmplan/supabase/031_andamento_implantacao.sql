-- =====================================================================
-- FARM PLAN · Gesta'Up · 031 · Andamento da Implantação
-- Deixa o consultor (e o gestor) saber QUAIS pessoas da fazenda já
-- ligaram os avisos 🔔 no celular, sem mostrar os dados do celular.
-- Rodar uma vez: Supabase › SQL Editor › New query › colar › Run.
-- =====================================================================
create or replace function avisos_ligados(p_fazendas uuid[])
returns table (fazenda_id uuid, pessoa_id uuid)
language sql stable security definer set search_path = public
as $$
  select distinct p.fazenda_id, p.id
  from pessoas p
  join avisos_inscricoes a on a.user_id = p.user_id
  where p.fazenda_id = any(p_fazendas)
    and exists (select 1 from acessos x
                where x.user_id = auth.uid() and x.fazenda_id = p.fazenda_id
                  and x.papel in ('consultor', 'gestor', 'administrativo'));
$$;
revoke execute on function avisos_ligados(uuid[]) from anon, public;
grant execute on function avisos_ligados(uuid[]) to authenticated;

select 'SQL 031 OK · Andamento da Implantação' as resultado;
