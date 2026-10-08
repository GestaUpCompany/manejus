-- =====================================================================
-- FARM PLAN · 014 · Imprevistos
-- O lançamento "Fora do Plano" passa a ter 2 tipos:
--   fora       = tarefa feita sem estar planejada
--   imprevisto = algo que aconteceu (máquina quebrou, animal doente...)
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================
alter table fora_do_plano add column if not exists tipo text not null default 'fora';
alter table fora_do_plano drop constraint if exists fora_do_plano_tipo_ok;
alter table fora_do_plano add constraint fora_do_plano_tipo_ok check (tipo in ('fora', 'imprevisto'));

select 'Imprevistos prontos' as resultado;
