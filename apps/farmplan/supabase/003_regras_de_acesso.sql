-- =====================================================================
-- FARM PLAN · Gesta'Up
-- 003 · Regras de acesso (Semana 1)
--
-- As tabelas estão trancadas desde o 001. Aqui criamos as "chaves":
--   • cada pessoa só enxerga as fazendas em que tem acesso (tabela acessos);
--   • gestor, administrativo e consultor podem cadastrar e planejar;
--   • todos com acesso à fazenda podem registrar baixas.
--   (a regra fina "só o líder dá baixa na tarefa da equipe" entra na Semana 4)
--
-- Isso se chama RLS (Row Level Security): segurança linha por linha.
-- Mesmo que alguém descubra o endereço do banco, não vê dado de outra fazenda.
-- =====================================================================

-- 1. Funções de apoio ------------------------------------------------------

-- Lista as fazendas do usuário que está logado
create or replace function minhas_fazendas()
returns setof uuid
language sql stable security definer set search_path = public
as $$ select fazenda_id from acessos where user_id = auth.uid() $$;

-- Diz se o usuário logado tem um dos papéis informados naquela fazenda
create or replace function tenho_papel(fz uuid, papeis text[])
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from acessos
                     where user_id = auth.uid() and fazenda_id = fz and papel = any(papeis)) $$;

-- 2. Quem pode VER ---------------------------------------------------------
create policy "ver minhas fazendas"  on fazendas  for select using (id in (select minhas_fazendas()));
create policy "ver minha conta"      on contas    for select using (id in (select conta_id from fazendas where id in (select minhas_fazendas())));
create policy "ver meus acessos"     on acessos   for select using (user_id = auth.uid() or tenho_papel(fazenda_id, array['consultor','gestor']));
create policy "ver pessoas"          on pessoas      for select using (fazenda_id in (select minhas_fazendas()));
create policy "ver setores"          on setores      for select using (fazenda_id in (select minhas_fazendas()));
create policy "ver equipes"          on equipes      for select using (fazenda_id in (select minhas_fazendas()));
create policy "ver membros"          on equipe_membros for select using (equipe_id in (select id from equipes where fazenda_id in (select minhas_fazendas())));
create policy "ver atividades"       on atividades   for select using (fazenda_id in (select minhas_fazendas()));
create policy "ver planejamento"     on planejamento for select using (fazenda_id in (select minhas_fazendas()));
create policy "ver baixas"           on baixas       for select using (fazenda_id in (select minhas_fazendas()));

-- 3. Quem pode CADASTRAR e PLANEJAR (gestor, administrativo, consultor) -----
create policy "editar fazenda"       on fazendas     for update using (tenho_papel(id, array['consultor','gestor']));
create policy "gerir acessos"        on acessos      for all using (tenho_papel(fazenda_id, array['consultor','gestor']))
                                                       with check (tenho_papel(fazenda_id, array['consultor','gestor']));
create policy "gerir pessoas"        on pessoas      for all using (tenho_papel(fazenda_id, array['consultor','gestor','administrativo']))
                                                       with check (tenho_papel(fazenda_id, array['consultor','gestor','administrativo']));
create policy "gerir setores"        on setores      for all using (tenho_papel(fazenda_id, array['consultor','gestor','administrativo']))
                                                       with check (tenho_papel(fazenda_id, array['consultor','gestor','administrativo']));
create policy "gerir equipes"        on equipes      for all using (tenho_papel(fazenda_id, array['consultor','gestor','administrativo']))
                                                       with check (tenho_papel(fazenda_id, array['consultor','gestor','administrativo']));
create policy "gerir membros"        on equipe_membros for all
  using      (exists (select 1 from equipes e where e.id = equipe_id and tenho_papel(e.fazenda_id, array['consultor','gestor','administrativo'])))
  with check (exists (select 1 from equipes e where e.id = equipe_id and tenho_papel(e.fazenda_id, array['consultor','gestor','administrativo'])));
create policy "gerir atividades"     on atividades   for all using (tenho_papel(fazenda_id, array['consultor','gestor','administrativo']))
                                                       with check (tenho_papel(fazenda_id, array['consultor','gestor','administrativo']));
create policy "gerir planejamento"   on planejamento for all using (tenho_papel(fazenda_id, array['consultor','gestor','administrativo']))
                                                       with check (tenho_papel(fazenda_id, array['consultor','gestor','administrativo']));

-- 4. Quem pode dar BAIXA (todos com acesso à fazenda) ----------------------
create policy "registrar baixa"      on baixas for insert with check (fazenda_id in (select minhas_fazendas()) and registrado_por = auth.uid());
create policy "corrigir baixa"       on baixas for update using (registrado_por = auth.uid() or tenho_papel(fazenda_id, array['consultor','gestor','administrativo']));
create policy "apagar baixa"         on baixas for delete using (tenho_papel(fazenda_id, array['consultor','gestor','administrativo']));

-- 5. O seu acesso: Welton como CONSULTOR da Rio Juruena ----------------------
--    (só funciona depois de criar o seu usuário em Authentication → Users)
insert into acessos (user_id, fazenda_id, papel)
select u.id, f.id, 'consultor'
from auth.users u, fazendas f
where u.email = 'weltoncabral@gestaup.com' and f.nome = 'Fazenda Rio Juruena'
on conflict do nothing;

-- Conferência
select u.email, f.nome as fazenda, a.papel
from acessos a join auth.users u on u.id = a.user_id join fazendas f on f.id = a.fazenda_id;
