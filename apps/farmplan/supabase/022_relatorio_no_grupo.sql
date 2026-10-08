-- =====================================================================
-- FARM PLAN · 022 · Relatório do Dia no Grupo
-- relatorios_dia: anota quando cada pessoa mandou o seu Relatório do Dia
-- pelo aplicativo para o grupo de WhatsApp da fazenda.
-- O Painel do Gestor mostra quem já mandou e quem ainda não mandou.
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================
create table if not exists relatorios_dia (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid not null references fazendas(id) on delete cascade,
  ano         int  not null,
  semana      int  not null,
  dia         int  not null check (dia between 0 and 6),        -- 0 = segunda
  pessoa_id   uuid references pessoas(id) on delete set null,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  feitas      int,
  total       int,
  canal       text,                                              -- compartilhar, whatsapp ou copiar
  enviado_em  timestamptz not null default now(),
  unique (fazenda_id, ano, semana, dia, user_id)
);
create index if not exists relatorios_dia_dia on relatorios_dia (fazenda_id, ano, semana, dia);

alter table relatorios_dia enable row level security;
drop policy if exists "ver relatorios dia"      on relatorios_dia;
drop policy if exists "anotar relatorio dia"    on relatorios_dia;
drop policy if exists "atualizar relatorio dia" on relatorios_dia;
create policy "ver relatorios dia" on relatorios_dia for select using (fazenda_id in (select minhas_fazendas()));
create policy "anotar relatorio dia" on relatorios_dia for insert with check (fazenda_id in (select minhas_fazendas()) and user_id = auth.uid());
create policy "atualizar relatorio dia" on relatorios_dia for update using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on relatorios_dia to authenticated;

select 'Relatório do Dia no Grupo pronto' as resultado;
