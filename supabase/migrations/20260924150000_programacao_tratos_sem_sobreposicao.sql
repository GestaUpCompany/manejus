-- Impede vigências sobrepostas de programacao_tratos por (fazenda_id, tipo).
-- Antes desta constraint, salvar com data_inicio diferente criava uma vigência
-- paralela que sombreava a anterior sem truncá-la, fazendo currais sumirem da
-- folha de tratos. O save agora trunca/adia/desativa sobrepostas; esta
-- constraint é a garantia no nível do banco.

create extension if not exists btree_gist;

alter table public.programacao_tratos
  add constraint programacao_tratos_sem_sobreposicao
  exclude using gist (
    fazenda_id with =,
    tipo with =,
    daterange(data_inicio, data_fim, '[]') with &&
  ) where (ativo);
