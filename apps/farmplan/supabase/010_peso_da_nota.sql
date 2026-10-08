-- =====================================================================
-- FARM PLAN · 010 · Peso da nota (cada fazenda decide)
-- Nota do colaborador no mês = peso_tarefas% das Funções + (100 - peso_tarefas)% dos Comportamentos.
-- Padrão 70 (igual à planilha). Muda em Cadastros › Geral e Setores.
-- =====================================================================
alter table fazendas add column if not exists peso_tarefas int not null default 70
  check (peso_tarefas between 0 and 100);
select nome, peso_tarefas, 100 - peso_tarefas as peso_comportamentos from fazendas;
