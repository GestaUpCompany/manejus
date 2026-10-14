-- Participantes da limpeza do bebedouro (opcional): { "funcionarios": [nomes], "diaristas": [nomes] }
alter table public.registros_bebedouros
  add column if not exists participantes_limpeza jsonb;

comment on column public.registros_bebedouros.participantes_limpeza is
  'Quem participou da limpeza: {"funcionarios": [nomes], "diaristas": [nomes]}. Null quando não informado.';
