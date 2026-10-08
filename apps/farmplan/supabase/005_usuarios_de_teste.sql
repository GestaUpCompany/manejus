-- =====================================================================
-- FARM PLAN · Gesta'Up
-- 005 · Usuários de teste: gestor, líder e colaborador (Semana 1)
--
-- Antes de rodar: criar os 3 usuários em Authentication → Users → Add user
--   weltoncabral+odirlei@gestaup.com       → Odirlei (gestor)
--   weltoncabral+agnaldo@gestaup.com       → Agnaldo (líder da Equipe Máquinas)
--   weltoncabral+josemauricio@gestaup.com  → José Maurício (colaborador)
-- (o "+nome" faz os e-mails chegarem na sua própria caixa)
-- =====================================================================

-- 1. Liga cada login à pessoa da fazenda e dá o papel
with mapa(email, apelido, papel) as (values
  ('weltoncabral+odirlei@gestaup.com',      'Odirlei',       'gestor'),
  ('weltoncabral+agnaldo@gestaup.com',      'Agnaldo',       'lider'),
  ('weltoncabral+josemauricio@gestaup.com', 'José Maurício', 'colaborador')
),
liga as (
  update pessoas p set user_id = u.id
  from mapa m join auth.users u on u.email = m.email
  where p.apelido = m.apelido
    and p.fazenda_id = (select id from fazendas where nome = 'Fazenda Rio Juruena')
  returning p.fazenda_id, u.id as user_id, m.papel
)
insert into acessos (user_id, fazenda_id, papel)
select user_id, fazenda_id, papel from liga
on conflict (user_id, fazenda_id) do update set papel = excluded.papel;

-- 2. Quem registrou a baixa também pode desfazer (antes só gestor/administrativo)
drop policy if exists "apagar baixa" on baixas;
create policy "apagar baixa" on baixas for delete
  using (registrado_por = auth.uid() or tenho_papel(fazenda_id, array['consultor','gestor','administrativo']));

-- Conferência
select u.email, p.apelido as pessoa, a.papel
from acessos a
join auth.users u on u.id = a.user_id
left join pessoas p on p.user_id = a.user_id
order by a.papel;
