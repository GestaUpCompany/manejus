-- =====================================================================
-- FARM PLAN · Gesta'Up · 034 · Frequência da Avaliação de Desempenho
-- Cada fazenda escolhe de quanto em quanto tempo avalia a equipe:
-- semanal, mensal, trimestral, semestral ou anual.
-- A nota dada vale para todas as semanas do período (Contrato, Bonificação
-- e Equipe do Mês continuam calculando do mesmo jeito).
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================
alter table fazendas add column if not exists periodo_avaliacao text not null default 'semanal';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fazendas_periodo_avaliacao_ck') then
    alter table fazendas add constraint fazendas_periodo_avaliacao_ck
      check (periodo_avaliacao in ('semanal', 'mensal', 'trimestral', 'semestral', 'anual'));
  end if;
end $$;

-- Conferência: deve mostrar a coluna com 'semanal' em todas as fazendas
select nome, periodo_avaliacao from fazendas order by nome;
