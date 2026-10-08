-- =====================================================================
-- FARM PLAN · 012 · Compromisso da Semana de Cada Líder (Reunião de 10 Min)
-- Na segunda, cada líder diz a 1 coisa mais importante da semana.
-- Na segunda seguinte, o gestor marca se fez.
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================
create table if not exists compromissos (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid not null references fazendas(id) on delete cascade,
  pessoa_id   uuid not null references pessoas(id) on delete cascade,
  ano         int  not null,
  semana      int  not null,
  texto       text not null,
  cumprido    boolean,                -- vazio = ainda não conferido
  atualizado_em timestamptz not null default now(),
  unique (pessoa_id, ano, semana)
);

alter table compromissos enable row level security;
drop policy if exists "ver compromissos"   on compromissos;
drop policy if exists "gerir compromissos" on compromissos;
create policy "ver compromissos"   on compromissos for select using (fazenda_id in (select minhas_fazendas()));
create policy "gerir compromissos" on compromissos for all
  using (tenho_papel(fazenda_id, array['consultor','gestor','administrativo','lider']))
  with check (tenho_papel(fazenda_id, array['consultor','gestor','administrativo','lider']));
grant select, insert, update, delete on compromissos to authenticated;

select 'Tabela de compromissos pronta' as resultado;
