-- =====================================================================
-- FARM PLAN · 028 · Relatório Semanal no WhatsApp (toda segunda-feira)
-- • fazendas.whatsapp_relatorio: números que recebem o relatório da semana
-- • resumo_semanal(): os números da semana passada (para o PDF e a mensagem)
-- • agendamento: toda segunda às 7h (Cuiabá) a função enviar-avisos manda
--   o PDF da semana no WhatsApp de cada fazenda (copia o agendamento do
--   relatório mensal, sem precisar de nenhuma chave secreta aqui)
-- Pode rodar mais de uma vez.
-- =====================================================================
alter table fazendas add column if not exists whatsapp_relatorio text;

create or replace function resumo_semanal(p_fz uuid, p_ano int, p_semana int)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  ini date := to_date(p_ano::text || lpad(p_semana::text, 2, '0') || '1', 'IYYYIWID');
  fim date; pini date; pfim date; m record; pm record; r jsonb;
  pano int; psem int; nano int; nsem int; nota numeric;
begin
  fim := ini + 6; pini := ini - 7; pfim := ini - 1;
  pano := extract(isoyear from pini)::int; psem := extract(week from pini)::int;
  nano := extract(isoyear from ini + 7)::int; nsem := extract(week from ini + 7)::int;
  select * into m  from meta_do_mes(p_fz, ini, fim);
  select * into pm from meta_do_mes(p_fz, pini, pfim);
  select round(avg(a.nota), 2) into nota from avaliacoes a where a.fazenda_id = p_fz and a.ano = p_ano and a.semana = p_semana and not a.nsa and a.nota is not null;

  select jsonb_build_object(
    'periodo', 'semana', 'fazenda', initcap(f.nome), 'municipio', initcap(coalesce(f.municipio, '')), 'uf', f.uf, 'meta', coalesce(f.meta_mes, 80),
    'ano', p_ano, 'semana', p_semana, 'inicio', to_char(ini, 'DD/MM'), 'fim', to_char(fim, 'DD/MM/YYYY'),
    'mes', extract(month from ini)::int,
    'planejadas', m.planejadas, 'feitas', m.feitas,
    'pct', case when m.planejadas > 0 then round(100.0 * m.feitas / m.planejadas) end,
    'nota_equipe', nota,
    -- tarefas-dia de cada dia da semana (segunda a domingo)
    'dias', (select coalesce(jsonb_agg(jsonb_build_object('dia', x.dia, 'planejadas', x.p, 'feitas', x.f) order by x.dia), '[]'::jsonb) from (
        select d.dia, count(*) as p,
               count(*) filter (where pl.status = 2 or exists (select 1 from baixas b where b.atividade_id = pl.atividade_id and b.ano = p_ano and b.semana = p_semana and b.dia = d.dia and b.feito)) as f
        from generate_series(0, 6) as d(dia)
        join planejamento pl on pl.fazenda_id = p_fz and pl.ano = p_ano and pl.semana = p_semana and pl.status <> 5
        join atividades a on a.id = pl.atividade_id and a.dias[d.dia + 1]
        group by d.dia) x),
    'setores', (select coalesce(jsonb_agg(jsonb_build_object('setor', x.nome, 'planejadas', x.p, 'concluidas', x.f) order by x.nome), '[]'::jsonb) from (
        select initcap(coalesce(st.nome, 'Sem Setor')) as nome, count(*) as p,
               count(*) filter (where pl.status = 2 or exists (select 1 from baixas b where b.atividade_id = pl.atividade_id and b.ano = p_ano and b.semana = p_semana and b.dia = d.dia and b.feito)) as f
        from generate_series(0, 6) as d(dia)
        join planejamento pl on pl.fazenda_id = p_fz and pl.ano = p_ano and pl.semana = p_semana and pl.status <> 5
        join atividades a on a.id = pl.atividade_id and a.dias[d.dia + 1]
        left join setores st on st.id = a.setor_id
        group by 1) x),
    'nao_deu', (select coalesce(jsonb_agg(jsonb_build_object('motivo', x.motivo, 'vezes', x.n) order by x.n desc), '[]'::jsonb) from (
        select initcap(coalesce(b.motivo, 'Sem Motivo')) as motivo, count(*) as n from baixas b
        where b.fazenda_id = p_fz and not b.feito and b.ano = p_ano and b.semana = p_semana group by 1) x),
    'imprevistos', (select count(*) from fora_do_plano x where x.fazenda_id = p_fz and x.ano = p_ano and x.semana = p_semana and x.tipo = 'imprevisto'),
    'fora_do_plano', (select count(*) from fora_do_plano x where x.fazenda_id = p_fz and x.ano = p_ano and x.semana = p_semana and x.tipo <> 'imprevisto'),
    'lista_imprevistos', (select coalesce(jsonb_agg(initcap(x.nome) order by x.registrado_em), '[]'::jsonb) from (select nome, registrado_em from fora_do_plano x
        where x.fazenda_id = p_fz and x.ano = p_ano and x.semana = p_semana and x.tipo = 'imprevisto' order by registrado_em limit 8) x),
    'relatorios_no_grupo', (select count(*) from relatorios_dia r where r.fazenda_id = p_fz and r.ano = p_ano and r.semana = p_semana),
    'dias_com_baixa', (select count(distinct b.dia) from baixas b where b.fazenda_id = p_fz and b.ano = p_ano and b.semana = p_semana),
    'anterior', jsonb_build_object(
        'pct', case when pm.planejadas > 0 then round(100.0 * pm.feitas / pm.planejadas) end,
        'nota_equipe', (select round(avg(a.nota), 2) from avaliacoes a where a.fazenda_id = p_fz and a.ano = pano and a.semana = psem and not a.nsa and a.nota is not null),
        'imprevistos', (select count(*) from fora_do_plano x where x.fazenda_id = p_fz and x.ano = pano and x.semana = psem and x.tipo = 'imprevisto')),
    'destaques', (select coalesce(jsonb_agg(jsonb_build_object('nome', d.nome, 'nota', d.nota) order by d.nota desc), '[]'::jsonb) from (
        select initcap(coalesce(p.apelido, p.nome)) as nome, round(avg(a.nota), 1) as nota
        from avaliacoes a join contrato_itens ci on ci.id = a.item_id join pessoas p on p.id = ci.pessoa_id
        where a.fazenda_id = p_fz and a.ano = p_ano and a.semana = p_semana and not a.nsa and a.nota is not null and p.ativo
        group by p.id, p.apelido, p.nome order by avg(a.nota) desc limit 3) d),
    'indicadores', '[]'::jsonb,
    'proximo_mes', (select coalesce(jsonb_agg(jsonb_build_object('nome', x.nome, 'setor', x.setor, 'semanas', x.ws) order by x.urg, x.tipo, x.nome), '[]'::jsonb) from (
        select initcap(a.nome) as nome, initcap(coalesce(st.nome, '')) as setor, coalesce(a.urgencia, 2) as urg, coalesce(a.tipo, '9') as tipo,
               array_to_string(array(select (array['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'])[i] from generate_series(1, 7) i where a.dias[i]), ', ') as ws
        from planejamento pl join atividades a on a.id = pl.atividade_id left join setores st on st.id = a.setor_id
        where pl.fazenda_id = p_fz and pl.ano = nano and pl.semana = nsem and pl.status <> 5
        order by coalesce(a.urgencia, 2), coalesce(a.tipo, '9'), a.nome limit 10) x),
    'proximo_total', (select count(*) from planejamento pl where pl.fazenda_id = p_fz and pl.ano = nano and pl.semana = nsem and pl.status <> 5)
  ) into r from fazendas f where f.id = p_fz;
  return r;
end $$;
revoke execute on function resumo_semanal(uuid, int, int) from anon, authenticated;

-- Agendamento: toda segunda às 7h de Cuiabá (11h UTC). Copia o do relatório mensal.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'farmplan-relatorio-semanal') then
    perform cron.unschedule('farmplan-relatorio-semanal');
  end if;
  perform cron.schedule('farmplan-relatorio-semanal', '0 11 * * 1', regexp_replace(command, 'mensal', 'semanal', 'g'))
  from cron.job where jobname = 'farmplan-relatorio-mensal';
end $$;

select jobname, schedule from cron.job where jobname like 'farmplan-relatorio%';
