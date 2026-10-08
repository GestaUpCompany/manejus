-- =====================================================================
-- FARM PLAN · 030 · O Plano Muda Sozinho com as Baixas do App
-- Quando a equipe dá baixa no aplicativo, a semana da atividade no
-- Plano Anual, no Plano do Mês e nas Tarefas da Semana muda na hora:
--   • alguns dias feitos ......... Em Andamento (azul)
--   • todos os dias feitos ....... Concluído (verde)
--   • desfez todas as baixas ..... volta para Planejado
-- Pausado nunca é mexido. Atrasado só vira Concluído quando tudo foi feito.
-- A virada de segunda-feira continua igual (SQL 011).
-- Pode rodar mais de uma vez.
-- =====================================================================
create or replace function status_pela_baixa()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  r record; s int; total int; feitos int; novo int;
begin
  r := coalesce(new, old);
  select pl.status into s from planejamento pl where pl.atividade_id = r.atividade_id and pl.ano = r.ano and pl.semana = r.semana;
  if not found or s = 5 then return null; end if;          -- sem plano nesta semana, ou pausado
  select count(*) into total from atividades a, generate_series(0, 6) d where a.id = r.atividade_id and a.dias[d + 1];
  select count(distinct b.dia) into feitos from baixas b join atividades a on a.id = b.atividade_id
   where b.atividade_id = r.atividade_id and b.ano = r.ano and b.semana = r.semana and b.feito and a.dias[b.dia + 1];
  novo := case when total > 0 and feitos >= total then 2       -- todos os dias feitos
               when feitos > 0 then case when s = 4 then 4 else 3 end
               when s in (2, 3) then 1                          -- desfez as baixas
               else s end;
  if novo <> s then
    update planejamento set status = novo where atividade_id = r.atividade_id and ano = r.ano and semana = r.semana;
  end if;
  return null;
end $$;

drop trigger if exists trg_status_pela_baixa on baixas;
create trigger trg_status_pela_baixa after insert or update or delete on baixas
  for each row execute function status_pela_baixa();

-- Acerta a semana atual com as baixas que já foram dadas
with h as (select (now() at time zone 'America/Cuiaba')::date as d),
x as (
  select pl.atividade_id, pl.ano, pl.semana, pl.status,
         (select count(*) from generate_series(0, 6) d where a.dias[d + 1]) as total,
         (select count(distinct b.dia) from baixas b where b.atividade_id = pl.atividade_id and b.ano = pl.ano and b.semana = pl.semana and b.feito and a.dias[b.dia + 1]) as feitos
  from planejamento pl join atividades a on a.id = pl.atividade_id, h
  where pl.ano = extract(isoyear from h.d) and pl.semana = extract(week from h.d) and pl.status in (1, 3))
update planejamento pl set status = case when x.total > 0 and x.feitos >= x.total then 2 else 3 end
from x where pl.atividade_id = x.atividade_id and pl.ano = x.ano and pl.semana = x.semana and x.feitos > 0
  and pl.status <> case when x.total > 0 and x.feitos >= x.total then 2 else 3 end;

select 'Plano atualizando sozinho com as baixas' as resultado;
