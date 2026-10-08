-- =====================================================================
-- FARM PLAN · Gesta'Up
-- 004 · Atrasadas da semana 39 vão para a semana 40 (Semana 1, dia 1)
--
-- Regra do Farm Plan: o que não foi concluído na semana passada
--   • fica marcado como ATRASADO na semana passada (status 4)
--   • aparece de novo na semana seguinte como PLANEJADO, com o aviso
--     "Atrasada da semana 39".
-- Hoje fazemos isso "na mão" para a Rio Juruena. Na Semana 4 do roteiro
-- o sistema passa a fazer sozinho, toda segunda-feira.
-- =====================================================================

-- 1. Copia para a semana 40 o que não foi concluído na 39
insert into planejamento (fazenda_id, atividade_id, ano, semana, status, observacao)
select fazenda_id, atividade_id, ano, 40, 1, 'Atrasada da semana 39'
from planejamento
where ano = 2026 and semana = 39 and status <> 2
on conflict (atividade_id, ano, semana) do nothing;

-- 2. Marca como atrasado na semana 39
update planejamento set status = 4
where ano = 2026 and semana = 39 and status in (1, 3);

-- Conferência
select semana, status, count(*) from planejamento
where ano = 2026 and semana in (39, 40)
group by semana, status order by semana, status;
