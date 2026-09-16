-- retirada_id em movimentacoes_almoxarifado é um vínculo informativo, não pode
-- ser FK: em sync offline-first a devolução pode chegar antes da retirada que a
-- originou (outro aparelho ainda offline). A FK fazia o insert da movimentação
-- falhar e derrubava o registro inteiro. Sem a constraint, a devolução entra,
-- fica retida para revisão, e reprocessar_devolucoes_almoxarifado a libera
-- quando a retirada sincronizar.

ALTER TABLE public.movimentacoes_almoxarifado
  DROP CONSTRAINT IF EXISTS movimentacoes_almoxarifado_retirada_id_fkey;
