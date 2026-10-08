-- =====================================================================
-- FARM PLAN · 020 · Segurança e Limpeza
-- 1. Apagar um login (usuário de teste ou quem saiu da fazenda) sem
--    perder o histórico: as baixas e o cadastro da pessoa ficam, só
--    perdem o vínculo com o login.
-- 2. Tira das funções do banco qualquer acesso de quem não fez login.
-- 3. Conferência: tabelas sem proteção e lista de todos os logins.
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================

-- 1. Vínculos com o login passam a "soltar" quando o login é apagado
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tabela, a.attname as coluna
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
      and c.confdeltype = 'a' and c.connamespace = 'public'::regnamespace
      and not a.attnotnull
  loop
    execute format('alter table %s drop constraint %I', r.tabela, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references auth.users(id) on delete set null', r.tabela, r.conname, r.coluna);
  end loop;
end $$;

-- 2. Funções só para quem está logado (pula as que ainda não existem)
do $$
declare f text;
begin
  foreach f in array array['criar_fazenda(text, text, text)', 'apagar_fazenda(uuid, text)', 'copiar_plano_ano(uuid, int, int)', 'virar_semana(uuid)'] loop
    begin
      execute 'revoke execute on function ' || f || ' from anon';
    exception when undefined_function then null;
    end;
  end loop;
end $$;

-- 3. Conferência: tabelas sem proteção e lista de todos os logins.
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================

-- 1. Vínculos com o login passam a "soltar" quando o login é apagado
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tabela, a.attname as coluna
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
      and c.confdeltype = 'a' and c.connamespace = 'public'::regnamespace
      and not a.attnotnull
  loop
    execute format('alter table %s drop constraint %I', r.tabela, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references auth.users(id) on delete set null', r.tabela, r.conname, r.coluna);
  end loop;
end $$;

-- 2. Funções só para quem está logado
revoke execute on function criar_fazenda(text, text, text)     from anon;
revoke execute on function apagar_fazenda(uuid, text)          from anon;
revoke execute on function copiar_plano_ano(uuid, int, int)    from anon;
revoke execute on function virar_semana(uuid)                  from anon;

-- 3. Conferência (o resultado aparece embaixo)
select '⚠ Tabela sem Proteção' as item, c.relname::text as detalhe, 'Avise o Claude' as situacao
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity
union all
select '👤 Login',
       coalesce(u.raw_user_meta_data->>'usuario', u.email),
       coalesce((select string_agg(f.nome || ' (' || a.papel || ')', ', ' order by f.nome)
                 from acessos a join fazendas f on f.id = a.fazenda_id where a.user_id = u.id), 'Sem Fazenda')
       || ' · Último Acesso: ' || coalesce(to_char(u.last_sign_in_at at time zone 'America/Cuiaba', 'DD/MM/YYYY'), 'Nunca')
from auth.users u
order by 1, 2;
