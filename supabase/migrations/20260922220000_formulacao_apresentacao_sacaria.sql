-- Apresentação da formulação (a granel ou sacaria) e peso do saco.
-- Usado pelo PWA na suplementação: quando sacaria, o tratador informa
-- o número de sacos e o app converte para kg usando kg_por_saco.
alter table public.formulacoes
  add column apresentacao text not null default 'granel',
  add column kg_por_saco numeric;

alter table public.formulacoes
  add constraint formulacoes_apresentacao_check
    check (apresentacao in ('granel', 'sacaria')),
  add constraint formulacoes_kg_por_saco_check
    check (apresentacao <> 'sacaria' or (kg_por_saco is not null and kg_por_saco > 0));

-- Snapshot no lançamento de suplementação: registra se o suplemento foi
-- lançado a granel ou em sacos, e quantos sacos (kg_cocho segue em kg).
alter table public.registros_suplementacao
  add column apresentacao text,
  add column qtd_sacos numeric;

comment on column public.formulacoes.apresentacao is 'granel | sacaria';
comment on column public.formulacoes.kg_por_saco is 'Kg por saco, obrigatório quando apresentacao = sacaria';
comment on column public.registros_suplementacao.qtd_sacos is 'Número de sacos suplementados (preenchido quando a formulação é sacaria)';
