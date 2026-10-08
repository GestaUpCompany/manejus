-- =====================================================================
-- FARM PLAN · 024 · Consultores da Gesta'Up
-- Cada consultor da equipe tem o próprio login (e-mail e senha) e enxerga
-- todas as fazendas da consultoria. Fazenda nova já nasce com acesso
-- para todos os consultores ativos. Pode rodar mais de uma vez sem problema.
-- =====================================================================

-- 1. Lista dos consultores da consultoria
create table if not exists consultores (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  conta_id   uuid not null references contas(id),
  nome       text not null,
  email      text not null,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);
alter table consultores enable row level security;

-- 2. A consultoria (conta) de quem está logado como consultor
create or replace function minha_conta() returns uuid
language sql stable security definer set search_path = public
as $$ select f.conta_id from acessos a join fazendas f on f.id = a.fazenda_id
      where a.user_id = auth.uid() and a.papel = 'consultor' limit 1 $$;
revoke execute on function minha_conta() from anon;

drop policy if exists "ver consultores da minha conta" on consultores;
create policy "ver consultores da minha conta" on consultores for select using (conta_id = minha_conta());
-- Gravar/alterar consultores: só pela função criar-acesso (chave secreta)

-- 3. Quem já é consultor hoje entra na lista
insert into consultores (user_id, conta_id, nome, email)
select distinct on (a.user_id) a.user_id, f.conta_id,
       coalesce(nullif(u.raw_user_meta_data->>'nome', ''), initcap(split_part(u.email, '@', 1))), u.email
from acessos a join fazendas f on f.id = a.fazenda_id join auth.users u on u.id = a.user_id
where a.papel = 'consultor'
on conflict (user_id) do nothing;

-- 4. Fazenda nova: acesso para quem criou e para todos os consultores ativos
create or replace function criar_fazenda(p_nome text, p_uf text default null, p_municipio text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_conta uuid; v_fz uuid;
begin
  select f.conta_id into v_conta
  from acessos a join fazendas f on f.id = a.fazenda_id
  where a.user_id = auth.uid() and a.papel = 'consultor'
  limit 1;
  if v_conta is null then raise exception 'Só o Consultor Pode Criar Fazendas.'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o Nome da Fazenda.'; end if;
  if exists (select 1 from fazendas where conta_id = v_conta and lower(trim(nome)) = lower(trim(p_nome))) then
    raise exception 'Já Existe uma Fazenda com Esse Nome.';
  end if;
  insert into fazendas (conta_id, nome, uf, municipio) values (v_conta, trim(p_nome), upper(nullif(trim(p_uf), '')), nullif(trim(p_municipio), ''))
  returning id into v_fz;
  insert into acessos (user_id, fazenda_id, papel) values (auth.uid(), v_fz, 'consultor')
    on conflict (user_id, fazenda_id) do nothing;
  insert into acessos (user_id, fazenda_id, papel)
    select c.user_id, v_fz, 'consultor' from consultores c where c.conta_id = v_conta and c.ativo
    on conflict (user_id, fazenda_id) do nothing;
  return v_fz;
end $$;
revoke execute on function criar_fazenda(text, text, text) from anon;

-- 5. Conferência: deve mostrar você (e depois cada consultor que for cadastrado)
select nome, email, ativo from consultores order by nome;
