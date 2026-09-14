-- Adicionar tanque_id e tanque_nome em registros_abastecimento
-- Linkagem passiva: o operador no PWA indica qual tanque usou, a baixa continua manual no Painel Web.

ALTER TABLE public.registros_abastecimento
  ADD COLUMN tanque_id uuid REFERENCES public.tanques_combustivel(id) ON DELETE SET NULL,
  ADD COLUMN tanque_nome text;

CREATE INDEX idx_registros_abastecimento_tanque_id
ON public.registros_abastecimento(tanque_id)
WHERE tanque_id IS NOT NULL;
