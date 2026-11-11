-- Manutenção pode ser de máquina/veículo ou de implemento (nome em veiculo_trator).
alter table public.registros_manutencao_maquinas
  add column if not exists tipo_equipamento text not null default 'maquina'
  check (tipo_equipamento in ('maquina', 'implemento'));
