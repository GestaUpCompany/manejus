-- Tipo da manutenção: rotina, preventiva ou corretiva (nulo nos registros antigos).
alter table public.registros_manutencao_maquinas
  add column if not exists tipo_manutencao text
  check (tipo_manutencao is null or tipo_manutencao in ('rotina', 'preventiva', 'corretiva'));
