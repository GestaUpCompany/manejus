-- =====================================================================
-- FARM PLAN · 027 · Relatório do Produtor (versão melhorada)
-- O resumo do mês ganha:
--  • comparação com o mês anterior (meta, nota, imprevistos)
--  • destaques da equipe (3 melhores notas do mês)
--  • indicadores do mês com farol (verde, amarelo, vermelho)
--  • o que vem no próximo mês (atividades mais importantes)
--  • dias com baixa no app
-- Quem usa é a função enviar-avisos (PDF e e-mail do dia 1º).
-- Pode rodar mais de uma vez.
-- =====================================================================
create or replace function resumo_mensal(p_fz uuid, p_ano int, p_mes int)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  ini date := make_date(p_ano, p_mes, 1);
  fim date := (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date;
  pini date := (make_date(p_ano, p_mes, 1) - interval '1 month')::date;
  pfim date := (make_date(p_ano, p_mes, 1) - interval '1 day')::date;
  nini date := (make_date(p_ano, p_mes, 1) + interval '1 month')::date;
  nfim date := (make_date(p_ano, p_mes, 1) + interval '2 month - 1 day')::date;
  r jsonb; m record; pm record;
  sem int[]; psem int[]; nsem int[];
  pano int := extract(year from pini)::int; nano int := extract(year from nini)::int;
  nota numeric; pnota numeric;
begin
  -- semanas de cada mês (a semana é do mês em que cai a quinta-feira)
  select array_agg(distinct extract(week from d)::int) into sem  from generate_series(ini,  fim,  interval '1 day') d where extract(isodow from d) = 4;
  select array_agg(distinct extract(week from d)::int) into psem from generate_series(pini, pfim, interval '1 day') d where extract(isodow from d) = 4;
  select array_agg(distinct extract(week from d)::int) into nsem from generate_series(nini, nfim, interval '1 day') d where extract(isodow from d) = 4;
  select * into m  from meta_do_mes(p_fz, ini, fim);
  select * into pm from meta_do_mes(p_fz, pini, pfim);
  select round(avg(a.nota), 2) into nota  from avaliacoes a where a.fazenda_id = p_fz and a.ano = p_ano and a.semana = any(sem)  and not a.nsa and a.nota is not null;
  select round(avg(a.nota), 2) into pnota from avaliacoes a where a.fazenda_id = p_fz and a.ano = pano  and a.semana = any(psem) and not a.nsa and a.nota is not null;

  select jsonb_build_object(
    'fazenda', initcap(f.nome), 'municipio', initcap(coalesce(f.municipio, '')), 'uf', f.uf, 'meta', coalesce(f.meta_mes, 80),
    'ano', p_ano, 'mes', p_mes, 'planejadas', m.planejadas, 'feitas', m.feitas,
    'pct', case when m.planejadas > 0 then round(100.0 * m.feitas / m.planejadas) end,
    'nota_equipe', nota,
    'nao_deu', (select coalesce(jsonb_agg(jsonb_build_object('motivo', x.motivo, 'vezes', x.n) order by x.n desc), '[]'::jsonb) from (
        select initcap(coalesce(b.motivo, 'Sem Motivo')) as motivo, count(*) as n from baixas b
        where b.fazenda_id = p_fz and not b.feito and b.ano = p_ano and b.semana = any(sem) group by 1) x),
    'imprevistos', (select count(*) from fora_do_plano x where x.fazenda_id = p_fz and x.ano = p_ano and x.semana = any(sem) and x.tipo = 'imprevisto'),
    'fora_do_plano', (select count(*) from fora_do_plano x where x.fazenda_id = p_fz and x.ano = p_ano and x.semana = any(sem) and x.tipo <> 'imprevisto'),
    'lista_imprevistos', (select coalesce(jsonb_agg(initcap(x.nome) order by x.registrado_em), '[]'::jsonb) from (select nome, registrado_em from fora_do_plano x
        where x.fazenda_id = p_fz and x.ano = p_ano and x.semana = any(sem) and x.tipo = 'imprevisto' order by registrado_em limit 8) x),
    'relatorios_no_grupo', (select count(*) from relatorios_dia r where r.fazenda_id = p_fz and r.ano = p_ano and r.semana = any(sem)),
    'dias_com_baixa', (select count(distinct (b.semana, b.dia)) from baixas b where b.fazenda_id = p_fz and b.ano = p_ano and b.semana = any(sem)),
    'semanas', (select coalesce(jsonb_agg(jsonb_build_object('semana', s.w, 'planejadas', s.p, 'concluidas', s.c) order by s.w), '[]'::jsonb) from (
        select pl.semana as w, count(*) as p, count(*) filter (where pl.status = 2) as c from planejamento pl
        where pl.fazenda_id = p_fz and pl.ano = p_ano and pl.semana = any(sem) and pl.status <> 5 group by pl.semana) s),
    'setores', (select coalesce(jsonb_agg(jsonb_build_object('setor', s.nome, 'planejadas', s.p, 'concluidas', s.c) order by s.nome), '[]'::jsonb) from (
        select initcap(coalesce(st.nome, 'Sem Setor')) as nome, count(*) as p, count(*) filter (where pl.status = 2) as c
        from planejamento pl join atividades a on a.id = pl.atividade_id left join setores st on st.id = a.setor_id
        where pl.fazenda_id = p_fz and pl.ano = p_ano and pl.semana = any(sem) and pl.status <> 5 group by 1) s),
    -- Mês anterior, para comparar
    'anterior', jsonb_build_object(
        'pct', case when pm.planejadas > 0 then round(100.0 * pm.feitas / pm.planejadas) end,
        'nota_equipe', pnota,
        'imprevistos', (select count(*) from fora_do_plano x where x.fazenda_id = p_fz and x.ano = pano and x.semana = any(psem) and x.tipo = 'imprevisto')),
    -- Destaques: as 3 maiores notas do mês (mínimo de 2 semanas avaliadas)
    'destaques', (select coalesce(jsonb_agg(jsonb_build_object('nome', d.nome, 'nota', d.nota) order by d.nota desc), '[]'::jsonb) from (
        select initcap(coalesce(p.apelido, p.nome)) as nome, round(avg(a.nota), 1) as nota
        from avaliacoes a join contrato_itens ci on ci.id = a.item_id join pessoas p on p.id = ci.pessoa_id
        where a.fazenda_id = p_fz and a.ano = p_ano and a.semana = any(sem) and not a.nsa and a.nota is not null and p.ativo
        group by p.id, p.apelido, p.nome having count(distinct a.semana) >= 2
        order by avg(a.nota) desc limit 3) d),
    -- Indicadores lançados no mês, com farol (1 verde · 2 amarelo · 3 vermelho)
    'indicadores', (select coalesce(jsonb_agg(jsonb_build_object('nome', i.nome, 'unidade', i.unidade, 'grupo', i.grupo, 'valor', i.v, 'casas', coalesce(i.casas, 1),
          'direcao', i.direcao, 'verde', i.verde, 'vermelho', i.vermelho,
          'farol', case when i.verde is null or i.vermelho is null then 0
                        when i.direcao = 'up' then case when i.v >= i.verde then 1 when i.v < i.vermelho then 3 else 2 end
                        else case when i.v <= i.verde then 1 when i.v >= i.vermelho then 3 else 2 end end) order by i.ordem), '[]'::jsonb)
        from (select ind.*, coalesce(iv.valor,
                case when ind.auto = 'escore' then nota
                     when ind.auto = 'atividades' then (select round(100.0 * count(*) filter (where pl.status = 2) / nullif(count(*), 0), 1)
                        from planejamento pl where pl.fazenda_id = p_fz and pl.ano = p_ano and pl.semana = any(sem) and pl.status <> 5) end) as v
              from indicadores ind left join indicador_valores iv on iv.indicador_id = ind.id and iv.ano = p_ano and iv.mes = p_mes
              where ind.fazenda_id = p_fz and ind.ativo) i
        where i.v is not null),
    -- O que vem no próximo mês: as atividades mais importantes (urgência e tipo)
    'proximo_mes', (select coalesce(jsonb_agg(jsonb_build_object('nome', x.nome, 'setor', x.setor, 'semanas', x.ws) order by x.urg, x.tipo, x.nome), '[]'::jsonb) from (
        select initcap(a.nome) as nome, initcap(coalesce(st.nome, '')) as setor, coalesce(a.urgencia, 2) as urg, coalesce(a.tipo, '9') as tipo,
               string_agg(pl.semana::text, ', ' order by pl.semana) as ws
        from planejamento pl join atividades a on a.id = pl.atividade_id left join setores st on st.id = a.setor_id
        where pl.fazenda_id = p_fz and pl.ano = nano and pl.semana = any(nsem) and pl.status <> 5
        group by a.id, a.nome, st.nome, a.urgencia, a.tipo
        order by coalesce(a.urgencia, 2), coalesce(a.tipo, '9'), a.nome limit 10) x),
    'proximo_total', (select count(distinct pl.atividade_id) from planejamento pl where pl.fazenda_id = p_fz and pl.ano = nano and pl.semana = any(nsem) and pl.status <> 5)
  ) into r from fazendas f where f.id = p_fz;
  return r;
end $$;
revoke execute on function resumo_mensal(uuid, int, int) from anon, authenticated;

select 'Relatório do produtor pronto' as resultado;
