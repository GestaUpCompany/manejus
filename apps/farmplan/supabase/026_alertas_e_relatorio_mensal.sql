-- =====================================================================
-- FARM PLAN · 026 · Alerta do Consultor e Relatório Mensal Automático
-- • alertas_consultor(): todo dia às 8h, cada consultor recebe no celular
--   (e por e-mail, se configurado) as fazendas que precisam de atenção:
--   3 dias ou mais sem baixa no app, ou abaixo da meta do mês.
-- • resumo_mensal(): os números do mês de uma fazenda, para o Relatório
--   Mensal em PDF que vai por e-mail para o produtor todo dia 1º.
-- • fazendas.email_relatorio: e-mails que recebem o relatório (Cadastros › Geral).
-- Quem chama é a função enviar-avisos. Pode rodar mais de uma vez.
-- =====================================================================
alter table fazendas add column if not exists email_relatorio text;

-- Cumprimento da meta: tarefas-dia já vencidas no mês (até ontem) com baixa Feito
create or replace function meta_do_mes(p_fz uuid, p_ini date, p_fim date)
returns table (planejadas int, feitas int)
language sql stable security definer set search_path = public
as $$
  with dias as (
    select d::date as d, extract(isoyear from d)::int as ano, extract(week from d)::int as sem, (extract(isodow from d)::int - 1) as dia
    from generate_series(p_ini, p_fim, interval '1 day') d
  )
  select count(*)::int,
         count(*) filter (where pl.status = 2 or exists (select 1 from baixas b where b.atividade_id = pl.atividade_id and b.ano = dias.ano and b.semana = dias.sem and b.dia = dias.dia and b.feito))::int
  from dias
  join planejamento pl on pl.fazenda_id = p_fz and pl.ano = dias.ano and pl.semana = dias.sem and pl.status <> 5
  join atividades a on a.id = pl.atividade_id and a.dias[dias.dia + 1];
$$;

create or replace function alertas_consultor()
returns table (user_id uuid, email text, nome text, titulo text, texto text, detalhe jsonb)
language sql stable security definer set search_path = public
as $$
  with h as (select (now() at time zone 'America/Cuiaba')::date as hoje),
  fz as (
    select f.id, f.nome, f.conta_id, coalesce(f.meta_mes, 80) as meta,
           (select max(b.registrado_em) from baixas b where b.fazenda_id = f.id) as ultima,
           m.planejadas, m.feitas,
           exists (select 1 from planejamento pl where pl.fazenda_id = f.id and pl.ano = extract(isoyear from h.hoje) and pl.semana = extract(week from h.hoje)) as tem_plano
    from fazendas f, h,
         lateral meta_do_mes(f.id, date_trunc('month', h.hoje - 1)::date, h.hoje - 1) m
  ),
  prob as (
    select fz.*, h.hoje,
           case when fz.ultima is null then null else (h.hoje - (fz.ultima at time zone 'America/Cuiaba')::date) end as dias_sem,
           case when fz.planejadas > 0 then round(100.0 * fz.feitas / fz.planejadas) end as pct
    from fz, h where fz.tem_plano
  ),
  ruins as (
    select * from prob
    where coalesce(dias_sem, 99) >= 3 or (planejadas >= 10 and pct < meta)
  )
  select c.user_id, c.email, c.nome,
         '⚠ ' || count(r.id) || case when count(r.id) = 1 then ' Fazenda Precisa de Atenção' else ' Fazendas Precisam de Atenção' end,
         string_agg(initcap(regexp_replace(r.nome, '^fazenda ', '', 'i')) || ': ' ||
           case when coalesce(r.dias_sem, 99) >= 3 then coalesce(r.dias_sem::text || ' dias sem baixa', 'nunca usou o app')
                else r.pct || '% (meta ' || r.meta || '%)' end, ' · ' order by r.nome),
         jsonb_agg(jsonb_build_object('fazenda', initcap(r.nome), 'dias_sem_baixa', r.dias_sem, 'pct', r.pct, 'meta', r.meta, 'planejadas', r.planejadas, 'feitas', r.feitas) order by r.nome)
  from consultores c
  join ruins r on r.conta_id = c.conta_id
  where c.ativo
  group by c.user_id, c.email, c.nome;
$$;
revoke execute on function alertas_consultor() from anon, authenticated;
revoke execute on function meta_do_mes(uuid, date, date) from anon;

-- Os números do mês de uma fazenda (para o PDF do produtor)
create or replace function resumo_mensal(p_fz uuid, p_ano int, p_mes int)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare ini date := make_date(p_ano, p_mes, 1); fim date := (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date;
        r jsonb; m record; semanas int[];
begin
  select array_agg(distinct extract(week from d)::int) into semanas from generate_series(ini, fim, interval '1 day') d where extract(isodow from d) = 4;
  select * into m from meta_do_mes(p_fz, ini, fim);
  select jsonb_build_object(
    'fazenda', initcap(f.nome), 'municipio', initcap(coalesce(f.municipio, '')), 'uf', f.uf, 'meta', coalesce(f.meta_mes, 80),
    'ano', p_ano, 'mes', p_mes, 'planejadas', m.planejadas, 'feitas', m.feitas,
    'pct', case when m.planejadas > 0 then round(100.0 * m.feitas / m.planejadas) end,
    'nao_deu', (select coalesce(jsonb_agg(jsonb_build_object('motivo', x.motivo, 'vezes', x.n) order by x.n desc), '[]'::jsonb) from (
        select initcap(coalesce(b.motivo, 'Sem Motivo')) as motivo, count(*) as n from baixas b
        where b.fazenda_id = p_fz and not b.feito and b.ano = p_ano and b.semana = any(semanas) group by 1) x),
    'imprevistos', (select count(*) from fora_do_plano x where x.fazenda_id = p_fz and x.ano = p_ano and x.semana = any(semanas) and x.tipo = 'imprevisto'),
    'fora_do_plano', (select count(*) from fora_do_plano x where x.fazenda_id = p_fz and x.ano = p_ano and x.semana = any(semanas) and x.tipo <> 'imprevisto'),
    'lista_imprevistos', (select coalesce(jsonb_agg(initcap(x.nome) order by x.registrado_em), '[]'::jsonb) from (select nome, registrado_em from fora_do_plano x
        where x.fazenda_id = p_fz and x.ano = p_ano and x.semana = any(semanas) and x.tipo = 'imprevisto' order by registrado_em limit 8) x),
    'nota_equipe', (select round(avg(a.nota), 2) from avaliacoes a where a.fazenda_id = p_fz and a.ano = p_ano and a.semana = any(semanas) and not a.nsa and a.nota is not null),
    'relatorios_no_grupo', (select count(*) from relatorios_dia r where r.fazenda_id = p_fz and r.ano = p_ano and r.semana = any(semanas)),
    'semanas', (select coalesce(jsonb_agg(jsonb_build_object('semana', s.w, 'planejadas', s.p, 'concluidas', s.c) order by s.w), '[]'::jsonb) from (
        select pl.semana as w, count(*) as p, count(*) filter (where pl.status = 2) as c from planejamento pl
        where pl.fazenda_id = p_fz and pl.ano = p_ano and pl.semana = any(semanas) and pl.status <> 5 group by pl.semana) s),
    'setores', (select coalesce(jsonb_agg(jsonb_build_object('setor', s.nome, 'planejadas', s.p, 'concluidas', s.c) order by s.nome), '[]'::jsonb) from (
        select initcap(coalesce(st.nome, 'Sem Setor')) as nome, count(*) as p, count(*) filter (where pl.status = 2) as c
        from planejamento pl join atividades a on a.id = pl.atividade_id left join setores st on st.id = a.setor_id
        where pl.fazenda_id = p_fz and pl.ano = p_ano and pl.semana = any(semanas) and pl.status <> 5 group by 1) s)
  ) into r from fazendas f where f.id = p_fz;
  return r;
end $$;
revoke execute on function resumo_mensal(uuid, int, int) from anon, authenticated;

-- Conferência
select * from alertas_consultor();
