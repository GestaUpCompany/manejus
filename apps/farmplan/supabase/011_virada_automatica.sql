-- =====================================================================
-- FARM PLAN · 011 · Virada automática da semana (toda segunda-feira)
-- Regra do Farm Plan (a mesma do 004, agora sozinha):
--   • Semana passada: o que teve baixa "Feito" em TODOS os dias planejados
--     vira CONCLUÍDO automaticamente.
--   • O que não foi concluído (nem pausado) fica ATRASADO na semana passada
--     e aparece na semana nova como PLANEJADO, com o aviso
--     "Atrasada da semana X".
--   • Roda toda segunda às 02:00 (horário de Mato Grosso), para todas as fazendas.
--   • Não roda duas vezes na mesma semana (fica registrado em "viradas").
-- Pode rodar este arquivo mais de uma vez sem problema.
-- =====================================================================

-- 1. Registro de cada virada (para conferir e não repetir)
create table if not exists viradas (
  fazenda_id  uuid not null references fazendas(id) on delete cascade,
  ano         int not null,
  semana      int not null,
  concluidas  int not null default 0,   -- viraram concluído pelas baixas
  trazidas    int not null default 0,   -- atrasadas trazidas para a semana nova
  feito_em    timestamptz not null default now(),
  feito_por   text not null default 'automático',
  primary key (fazenda_id, ano, semana)
);
alter table viradas enable row level security;
drop policy if exists "ver viradas" on viradas;
create policy "ver viradas" on viradas for select using (fazenda_id in (select minhas_fazendas()));

-- 2. A função que faz a virada
create or replace function virar_semana(p_fazenda uuid default null)
returns table (fazenda text, semana_nova int, concluidas int, trazidas int)
language plpgsql security definer set search_path = public
as $$
declare
  hoje  date := (now() at time zone 'America/Cuiaba')::date;
  ant   date := hoje - 7;
  a_ano int := extract(isoyear from hoje)::int;  a_sem int := extract(week from hoje)::int;   -- semana nova
  p_ano int := extract(isoyear from ant)::int;   p_sem int := extract(week from ant)::int;    -- semana passada
  f record; n_conc int; n_traz int;
begin
  -- Chamada pelo site: só gestor, administrativo ou consultor da fazenda
  if auth.uid() is not null then
    if p_fazenda is null or not tenho_papel(p_fazenda, array['consultor','gestor','administrativo']) then
      raise exception 'Só Gestor, Administrativo ou Consultor Pode Fazer a Virada.';
    end if;
  end if;

  for f in select id, nome from fazendas where p_fazenda is null or id = p_fazenda loop
    continue when exists (select 1 from viradas v where v.fazenda_id = f.id and v.ano = a_ano and v.semana = a_sem);

    -- a) Concluído pelas baixas: todos os dias planejados com "Feito"
    update planejamento pl set status = 2
    from atividades a
    where pl.fazenda_id = f.id and pl.ano = p_ano and pl.semana = p_sem and pl.status in (1, 3, 4)
      and a.id = pl.atividade_id and true = any(a.dias)
      and not exists (
        select 1 from generate_series(0, 6) d
        where a.dias[d + 1] and not exists (
          select 1 from baixas b where b.atividade_id = pl.atividade_id and b.ano = p_ano and b.semana = p_sem and b.dia = d and b.feito))
    ;
    get diagnostics n_conc = row_count;

    -- b) Traz para a semana nova o que não foi concluído (pausado fica onde está)
    insert into planejamento (fazenda_id, atividade_id, ano, semana, status, observacao)
    select pl.fazenda_id, pl.atividade_id, a_ano, a_sem, 1, 'Atrasada da semana ' || p_sem
    from planejamento pl
    where pl.fazenda_id = f.id and pl.ano = p_ano and pl.semana = p_sem and pl.status in (1, 3, 4)
    on conflict (atividade_id, ano, semana) do update
      set observacao = coalesce(planejamento.observacao, excluded.observacao);
    get diagnostics n_traz = row_count;

    -- c) Marca como atrasado na semana passada
    update planejamento set status = 4
    where fazenda_id = f.id and ano = p_ano and semana = p_sem and status in (1, 3);

    insert into viradas (fazenda_id, ano, semana, concluidas, trazidas, feito_por)
    values (f.id, a_ano, a_sem, n_conc, n_traz, case when auth.uid() is null then 'automático' else 'manual' end);

    fazenda := f.nome; semana_nova := a_sem; concluidas := n_conc; trazidas := n_traz;
    return next;
  end loop;
end $$;

revoke all on function virar_semana(uuid) from public, anon;
grant execute on function virar_semana(uuid) to authenticated;

-- 3. Agenda: toda segunda às 06:00 UTC (= 02:00 em Mato Grosso)
create extension if not exists pg_cron;
select cron.unschedule('farmplan-virada-semanal') where exists (select 1 from cron.job where jobname = 'farmplan-virada-semanal');
select cron.schedule('farmplan-virada-semanal', '0 6 * * 1', $$select * from public.virar_semana()$$);

-- 4. Confere: agenda criada e semanas de hoje
select jobname, schedule, active from cron.job where jobname = 'farmplan-virada-semanal';
select extract(week from (now() at time zone 'America/Cuiaba')::date) as semana_atual;
