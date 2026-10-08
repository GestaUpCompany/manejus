-- =====================================================================
-- FARM PLAN · Gesta'Up
-- 001 · Tabelas do banco de dados (Semana 1, dia 1)
--
-- Como ler: cada "create table" cria uma TABELA (como uma aba de planilha).
-- Cada linha dentro dela é uma COLUNA. "references" liga uma tabela a outra.
-- Linhas que começam com "--" são comentários: o banco ignora.
--
-- Pensado para VÁRIAS FAZENDAS e venda futura:
--   conta  →  fazendas  →  pessoas, equipes, setores, atividades, baixas
-- =====================================================================

-- 1. CONTAS: o "cliente" dono das fazendas (hoje: a consultoria Gesta'Up)
create table contas (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  plano            text not null default 'consultoria',  -- futuro: 'basico', 'completo'
  limite_fazendas  int  not null default 100,
  limite_usuarios  int  not null default 1000,
  criado_em        timestamptz not null default now()
);

-- 2. FAZENDAS: cada fazenda pertence a uma conta
create table fazendas (
  id          uuid primary key default gen_random_uuid(),
  conta_id    uuid not null references contas(id),
  nome        text not null,
  municipio   text,
  uf          text,
  meta_mes    int  not null default 80,   -- % das tarefas com baixa
  recado      text,                       -- recado da semana para a equipe
  criado_em   timestamptz not null default now()
);

-- 3. ACESSOS: quem pode entrar em qual fazenda, e com qual papel
--    (um consultor pode ter acesso a várias fazendas)
create table acessos (
  user_id     uuid not null references auth.users(id) on delete cascade,
  fazenda_id  uuid not null references fazendas(id) on delete cascade,
  papel       text not null check (papel in ('consultor','gestor','administrativo','lider','colaborador')),
  primary key (user_id, fazenda_id)
);

-- 4. PESSOAS: a equipe da fazenda (com ou sem login)
create table pessoas (
  id           uuid primary key default gen_random_uuid(),
  fazenda_id   uuid not null references fazendas(id) on delete cascade,
  apelido      text not null,              -- como é chamado no app
  nome         text,                       -- nome completo
  cargo        text,
  superior_id  uuid references pessoas(id),
  user_id      uuid references auth.users(id),  -- preenchido quando a pessoa tiver login
  ativo        boolean not null default true,
  unique (fazenda_id, apelido)
);

-- 5. SETORES: Gado, Máquinas, Administrativo...
create table setores (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid not null references fazendas(id) on delete cascade,
  nome        text not null,
  dono_id     uuid references pessoas(id),
  unique (fazenda_id, nome)
);

-- 6. EQUIPES e quem faz parte delas
create table equipes (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid not null references fazendas(id) on delete cascade,
  nome        text not null,
  lider_id    uuid references pessoas(id),   -- vazio = só gestor ou administrativo dá baixa
  unique (fazenda_id, nome)
);
create table equipe_membros (
  equipe_id  uuid not null references equipes(id) on delete cascade,
  pessoa_id  uuid not null references pessoas(id) on delete cascade,
  primary key (equipe_id, pessoa_id)
);

-- 7. ATIVIDADES: a biblioteca do plano anual
create table atividades (
  id                  uuid primary key default gen_random_uuid(),
  fazenda_id          uuid not null references fazendas(id) on delete cascade,
  nome                text not null,
  setor_id            uuid references setores(id),
  tipo                text,                         -- 1 Rotina, 2 Estratégica...
  urgencia            smallint default 2,           -- 1 alta, 2 média, 3 baixa
  coordenador_id      uuid references pessoas(id),
  executor_pessoa_id  uuid references pessoas(id),  -- quem faz: uma pessoa...
  executor_equipe_id  uuid references equipes(id),  -- ...ou uma equipe
  local               text,
  dias                boolean[] not null default '{true,false,false,false,false,false,false}', -- seg..dom
  como_fazer          jsonb,                        -- os 5M
  criado_em           timestamptz not null default now()
);

-- 8. PLANEJAMENTO: em quais semanas do ano cada atividade acontece
--    status: 1 planejado, 2 concluído, 3 em andamento, 4 atrasado, 5 pausado
create table planejamento (
  id            uuid primary key default gen_random_uuid(),
  fazenda_id    uuid not null references fazendas(id) on delete cascade,
  atividade_id  uuid not null references atividades(id) on delete cascade,
  ano           int not null,
  semana        int not null check (semana between 1 and 53),
  status        smallint not null default 1,
  observacao    text,
  unique (atividade_id, ano, semana)
);

-- 9. BAIXAS: o que o pessoal registra no aplicativo, dia a dia
create table baixas (
  id              uuid primary key default gen_random_uuid(),
  fazenda_id      uuid not null references fazendas(id) on delete cascade,
  atividade_id    uuid not null references atividades(id) on delete cascade,
  ano             int not null,
  semana          int not null,
  dia             smallint not null check (dia between 0 and 6),  -- 0 = segunda
  feito           boolean not null default true,
  motivo          text,          -- quando "Não deu": chuva, máquina, falta de gente...
  observacao      text,
  registrado_por  uuid references auth.users(id),
  registrado_em   timestamptz not null default now(),
  unique (atividade_id, ano, semana, dia)
);

-- 10. SEGURANÇA: tranca todas as tabelas.
--     Ninguém lê nem grava nada até criarmos as regras de acesso (próximo passo).
alter table contas          enable row level security;
alter table fazendas        enable row level security;
alter table acessos         enable row level security;
alter table pessoas         enable row level security;
alter table setores         enable row level security;
alter table equipes         enable row level security;
alter table equipe_membros  enable row level security;
alter table atividades      enable row level security;
alter table planejamento    enable row level security;
alter table baixas          enable row level security;

-- 11. PRIMEIROS DADOS: a conta Gesta'Up e a Fazenda Rio Juruena
with nova_conta as (
  insert into contas (nome) values ('Gesta''Up Consultoria') returning id
)
insert into fazendas (conta_id, nome, uf)
select id, 'Fazenda Rio Juruena', 'MT' from nova_conta;
