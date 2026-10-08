-- =====================================================================
-- FARM PLAN · 013 · Fora do Plano
-- O que foi feito no dia sem estar planejado (imprevistos).
-- Qualquer pessoa da fazenda lança pelo aplicativo; gestor vê no Painel.
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================
create table if not exists fora_do_plano (
  id             uuid primary key default gen_random_uuid(),
  fazenda_id     uuid not null references fazendas(id) on delete cascade,
  ano            int  not null,
  semana         int  not null,
  dia            int  not null check (dia between 0 and 6),   -- 0 = segunda
  nome           text not null,
  pessoa_id      uuid references pessoas(id) on delete set null,
  equipe_id      uuid references equipes(id) on delete set null,
  setor_id       uuid references setores(id) on delete set null,
  obs            text,
  registrado_por uuid default auth.uid(),
  registrado_em  timestamptz not null default now()
);
create index if not exists fora_do_plano_semana on fora_do_plano (fazenda_id, ano, semana);

alter table fora_do_plano enable row level security;
drop policy if exists "ver fora do plano"     on fora_do_plano;
drop policy if exists "lancar fora do plano"  on fora_do_plano;
drop policy if exists "apagar fora do plano"  on fora_do_plano;
create policy "ver fora do plano"    on fora_do_plano for select using (fazenda_id in (select minhas_fazendas()));
create policy "lancar fora do plano" on fora_do_plano for insert with check (fazenda_id in (select minhas_fazendas()));
create policy "apagar fora do plano" on fora_do_plano for delete
  using (registrado_por = auth.uid() or tenho_papel(fazenda_id, array['consultor','gestor','administrativo']));
grant select, insert, delete on fora_do_plano to authenticated;

select 'Tabela Fora do Plano pronta' as resultado;
