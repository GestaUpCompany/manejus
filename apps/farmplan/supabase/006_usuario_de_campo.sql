-- =====================================================================
-- FARM PLAN · 006 · Usuário de campo (entrar sem e-mail)
-- Guarda o nome de usuário de cada pessoa (ex.: agnaldo.riojuruena).
-- Quem cria o acesso é a função "criar-acesso" (Edge Function), chamada
-- pela tela Cadastros. Pode rodar mais de uma vez sem problema.
-- =====================================================================
alter table pessoas add column if not exists usuario text;
create unique index if not exists pessoas_usuario_unico on pessoas (usuario);

-- Confere: pessoas da Rio Juruena e quem já tem acesso
select p.apelido, p.usuario, a.papel
from pessoas p left join acessos a on a.user_id = p.user_id and a.fazenda_id = p.fazenda_id
order by p.apelido;
