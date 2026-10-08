-- =====================================================================
-- FARM PLAN · 025 · Avisos no Celular (notificações)
-- 6h30 (hora de Mato Grosso): "Bom dia! Você tem 3 tarefas hoje"
-- 17h00: "Falta mandar o Relatório do Dia" (só para quem ainda não mandou)
-- Quem envia é a função enviar-avisos (Supabase). O agendamento (cron)
-- fica no arquivo de Segredos, porque leva a chave da função.
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================

-- 1. Os celulares que ligaram os avisos (um por aparelho)
create table if not exists avisos_inscricoes (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  criado_em  timestamptz not null default now()
);
alter table avisos_inscricoes enable row level security;
drop policy if exists "ver meus avisos" on avisos_inscricoes;
drop policy if exists "apagar meus avisos" on avisos_inscricoes;
create policy "ver meus avisos"    on avisos_inscricoes for select using (user_id = auth.uid());
create policy "apagar meus avisos" on avisos_inscricoes for delete using (user_id = auth.uid());

-- 2. Ligar os avisos deste celular (se outra pessoa usava o aparelho, passa para quem está logado)
create or replace function inscrever_aviso(p_endpoint text, p_p256dh text, p_auth text)
returns void language sql security definer set search_path = public
as $$
  insert into avisos_inscricoes (endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, criado_em = now();
$$;
revoke execute on function inscrever_aviso(text, text, text) from anon;

-- 3. Quem recebe o quê hoje ('manha' ou 'tarde'). Só a função enviar-avisos usa.
create or replace function avisos_do_dia(p_tipo text)
returns table (user_id uuid, titulo text, texto text)
language sql stable security definer set search_path = public
as $$
  with h as (
    select extract(isoyear from d)::int as ano, extract(week from d)::int as sem, (extract(isodow from d)::int - 1) as dia
    from (select (now() at time zone 'America/Cuiaba')::date as d) x
  ),
  tarefas as (
    select p.user_id, p.fazenda_id, p.apelido, a.id as atividade_id, a.nome
    from h
    join planejamento pl on pl.ano = h.ano and pl.semana = h.sem and pl.status not in (2, 5)
    join atividades a on a.id = pl.atividade_id and a.dias[h.dia + 1]
    join pessoas p on p.fazenda_id = a.fazenda_id and p.user_id is not null and p.ativo
    where a.executor_pessoa_id = p.id
       or exists (select 1 from equipe_membros m where m.equipe_id = a.executor_equipe_id and m.pessoa_id = p.id)
  ),
  por as (
    select t.user_id, t.fazenda_id, min(t.apelido) as apelido, count(*) as n,
           count(*) filter (where exists (select 1 from baixas b, h where b.atividade_id = t.atividade_id and b.ano = h.ano and b.semana = h.sem and b.dia = h.dia)) as resp,
           string_agg(t.nome, ', ' order by t.nome) as nomes
    from tarefas t group by t.user_id, t.fazenda_id
  )
  select por.user_id,
         case when p_tipo = 'manha' then 'Bom dia, ' || initcap(split_part(por.apelido, ' ', 1)) || '! ☀️'
              else '📲 Falta o Relatório do Dia' end,
         case when p_tipo = 'manha' then por.n || case when por.n = 1 then ' tarefa hoje: ' else ' tarefas hoje: ' end || left(initcap(por.nomes), 140)
              when por.n - por.resp = 1 then 'Ainda falta 1 tarefa sem ✓ Feito ou ✗ Não Deu. Depois mande o relatório no grupo.'
              when por.resp < por.n then 'Ainda faltam ' || (por.n - por.resp) || ' tarefas sem ✓ Feito ou ✗ Não Deu. Depois mande o relatório no grupo.'
              else 'Tudo respondido (' || por.n || ' de ' || por.n || '). Agora é só mandar o relatório no grupo da fazenda.' end
  from por, h
  where p_tipo = 'manha'
     or (p_tipo = 'tarde' and not exists (select 1 from relatorios_dia r
           where r.user_id = por.user_id and r.fazenda_id = por.fazenda_id and r.ano = h.ano and r.semana = h.sem and r.dia = h.dia));
$$;
revoke execute on function avisos_do_dia(text) from anon, authenticated;

-- 4. Conferência: quem receberia o aviso da manhã hoje
select * from avisos_do_dia('manha') limit 10;
