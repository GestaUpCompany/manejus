-- =====================================================================
-- FARM PLAN · 018 · Indicadores (Painel de Bordo)
-- indicadores        : quais indicadores a fazenda acompanha, com meta e farol
-- indicador_valores  : o resultado de cada mês
-- Os 12 indicadores padrão da planilha são criados pela própria tela
-- na primeira vez que a fazenda abre os Indicadores.
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================
create table if not exists indicadores (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid not null references fazendas(id) on delete cascade,
  ordem       int  not null default 0,
  nome        text not null,
  unidade     text,
  direcao     text not null default 'up' check (direcao in ('up', 'down')),   -- up = maior é melhor
  verde       numeric,      -- up: verde a partir de · down: verde até
  vermelho    numeric,      -- up: vermelho abaixo de · down: vermelho a partir de
  casas       int  not null default 2,
  auto        text check (auto in ('escore', 'atividades')),                   -- calculado pelo sistema
  ativo       boolean not null default true
);
create table if not exists indicador_valores (
  indicador_id uuid not null references indicadores(id) on delete cascade,
  fazenda_id   uuid not null references fazendas(id) on delete cascade,
  ano          int  not null,
  mes          int  not null check (mes between 1 and 12),
  valor        numeric not null,
  primary key (indicador_id, ano, mes)
);

alter table indicadores       enable row level security;
alter table indicador_valores enable row level security;
drop policy if exists "ver indicadores"   on indicadores;
drop policy if exists "gerir indicadores" on indicadores;
drop policy if exists "ver valores"       on indicador_valores;
drop policy if exists "gerir valores"     on indicador_valores;
create policy "ver indicadores"   on indicadores for select using (fazenda_id in (select minhas_fazendas()));
create policy "gerir indicadores" on indicadores for all
  using (tenho_papel(fazenda_id, array['consultor','gestor','administrativo']))
  with check (tenho_papel(fazenda_id, array['consultor','gestor','administrativo']));
create policy "ver valores"   on indicador_valores for select using (fazenda_id in (select minhas_fazendas()));
create policy "gerir valores" on indicador_valores for all
  using (tenho_papel(fazenda_id, array['consultor','gestor','administrativo']))
  with check (tenho_papel(fazenda_id, array['consultor','gestor','administrativo']));
grant select, insert, update, delete on indicadores, indicador_valores to authenticated;

select 'Indicadores prontos' as resultado;
