-- =====================================================================
-- FARM PLAN · 023 · Tempo de Execução e Meta das Atividades
-- execucoes: cada toque do colaborador no cronômetro do aplicativo
--   inicio  → começou a atividade
--   pausa   → parou (Almoço, Chuva, Máquina, Continua Amanhã, Outro)
--   retomada→ voltou a fazer
--   fim     → terminou, com a meta: bateu / parcial / nao e quanto fez
-- Todos os toques da mesma execução têm o mesmo execucao_id, mesmo que
-- a atividade atravesse o almoço ou vá para o dia seguinte.
-- A meta em número e o tempo previsto ficam no 5M da atividade
-- (Plano Anual → Como Fazer). Pode rodar mais de uma vez sem problema.
-- =====================================================================
create table if not exists execucoes (
  id            uuid primary key default gen_random_uuid(),
  execucao_id   uuid not null,                                     -- junta início, pausas e fim
  fazenda_id    uuid not null references fazendas(id) on delete cascade,
  atividade_id  uuid not null references atividades(id) on delete cascade,
  ano           int  not null,
  semana        int  not null,
  dia           int  not null check (dia between 0 and 6),          -- 0 = segunda
  evento        text not null check (evento in ('inicio', 'pausa', 'retomada', 'fim')),
  motivo        text,                                               -- motivo da pausa
  em            timestamptz not null,                               -- hora do toque no celular
  pessoa_id     uuid references pessoas(id) on delete set null,
  user_id       uuid default auth.uid() references auth.users(id) on delete set null,
  meta_status   text check (meta_status in ('bateu', 'parcial', 'nao')),
  meta_feito    numeric,                                            -- quanto fez (na unidade da meta)
  obs           text
);
create index if not exists execucoes_fazenda on execucoes (fazenda_id, em);
create index if not exists execucoes_exec on execucoes (execucao_id);

alter table execucoes enable row level security;
drop policy if exists "ver execucoes"     on execucoes;
drop policy if exists "marcar execucoes"  on execucoes;
drop policy if exists "apagar execucoes"  on execucoes;
create policy "ver execucoes" on execucoes for select using (fazenda_id in (select minhas_fazendas()));
create policy "marcar execucoes" on execucoes for insert with check (fazenda_id in (select minhas_fazendas()) and user_id = auth.uid());
create policy "apagar execucoes" on execucoes for delete using (user_id = auth.uid() or tenho_papel(fazenda_id, array['consultor','gestor','administrativo']));
grant select, insert, delete on execucoes to authenticated;

select 'Tempo e Meta prontos' as resultado;
