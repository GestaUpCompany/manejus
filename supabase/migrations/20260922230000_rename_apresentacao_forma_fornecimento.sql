-- Renomeia apresentacao -> forma_fornecimento (termo preferido para
-- indicar se a formulação é a granel ou sacaria). Valores não mudam.
alter table public.formulacoes
  rename column apresentacao to forma_fornecimento;

alter table public.formulacoes
  rename constraint formulacoes_apresentacao_check to formulacoes_forma_fornecimento_check;

alter table public.registros_suplementacao
  rename column apresentacao to forma_fornecimento;

comment on column public.formulacoes.forma_fornecimento is 'granel | sacaria';
