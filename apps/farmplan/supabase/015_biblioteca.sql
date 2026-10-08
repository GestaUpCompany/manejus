-- =====================================================================
-- FARM PLAN · 015 · Biblioteca de Atividades
-- Atividades-modelo (com 5M e semanas sugeridas) da consultoria.
-- Servem para montar o plano de uma fazenda nova em minutos.
-- Cada consultoria (conta) tem a sua biblioteca.
-- Já começa com as atividades da Fazenda Rio Juruena.
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================
create table if not exists biblioteca (
  id          uuid primary key default gen_random_uuid(),
  conta_id    uuid not null references contas(id) on delete cascade,
  nome        text not null,
  chave       text generated always as (lower(regexp_replace(nome, '[^[:alnum:]]', '', 'g'))) stored,
  setor_nome  text,
  tipo        text,
  urgencia    smallint default 2,
  dias        boolean[] not null default '{true,false,false,false,false,false,false}',
  local       text,
  como_fazer  jsonb,
  semanas     int[] not null default '{}',     -- semanas sugeridas no ano
  origem      text,                            -- de qual fazenda veio
  criado_em   timestamptz not null default now(),
  unique (conta_id, chave)
);

alter table biblioteca enable row level security;
drop policy if exists "ver biblioteca"   on biblioteca;
drop policy if exists "gerir biblioteca" on biblioteca;
-- Todos da consultoria veem; só o consultor altera
create policy "ver biblioteca" on biblioteca for select
  using (conta_id in (select conta_id from fazendas where id in (select minhas_fazendas())));
create policy "gerir biblioteca" on biblioteca for all
  using (exists (select 1 from acessos a join fazendas f on f.id = a.fazenda_id
                 where a.user_id = auth.uid() and a.papel = 'consultor' and f.conta_id = biblioteca.conta_id))
  with check (exists (select 1 from acessos a join fazendas f on f.id = a.fazenda_id
                 where a.user_id = auth.uid() and a.papel = 'consultor' and f.conta_id = biblioteca.conta_id));
grant select, insert, update, delete on biblioteca to authenticated;

-- Carga inicial: as atividades da Fazenda Rio Juruena, com as semanas planejadas em 2026
insert into biblioteca (conta_id, nome, setor_nome, tipo, urgencia, dias, local, como_fazer, semanas, origem)
select f.conta_id, a.nome, s.nome, a.tipo, a.urgencia, a.dias, a.local, a.como_fazer,
       coalesce((select array_agg(distinct p.semana order by p.semana) from planejamento p
                 where p.atividade_id = a.id and p.ano = 2026
                   and coalesce(p.observacao, '') not like 'Atrasada%'), '{}'),
       f.nome
from atividades a
join fazendas f on f.id = a.fazenda_id
left join setores s on s.id = a.setor_id
where f.nome ilike '%juruena%'
on conflict (conta_id, chave) do nothing;

select count(*) || ' atividades na biblioteca' as resultado from biblioteca;
