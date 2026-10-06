-- Vínculo do trato ao vagão/produção e foto da balança
--
-- O novo layout da folha de trato (PWA) exibe o saldo do vagão por trato e
-- permite fotografar o mostrador da balança como evidência do kg realizado.
-- Como pode haver dois ou mais vagões (produções de registros_fabrica_confinamento)
-- no mesmo trato do dia, o lançamento precisa dizer de qual vagão saiu.
--
-- 1. fabrica_confinamento_id: produção da fábrica que abasteceu este trato.
--    Preenchido apenas quando a produção já está sincronizada (id real); o
--    saldo operacional é calculado por vagao_id, que sempre sai preenchido.
-- 2. vagao_id: vagão de origem, obrigatório quando há produção registrada
--    para o trato; NULL quando o vagão foi abastecido fora do app.
-- 3. foto_url: foto do mostrador da balança (bucket fotos-registros).

ALTER TABLE public.registros_oferta_trato
  ADD COLUMN IF NOT EXISTS fabrica_confinamento_id uuid
    REFERENCES public.registros_fabrica_confinamento(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vagao_id uuid
    REFERENCES public.vagoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS foto_url text;

-- Saldo por produção: total_produzido - soma dos kg_ofertado_real vinculados.
CREATE INDEX IF NOT EXISTS idx_oferta_trato_fabrica
  ON public.registros_oferta_trato (fabrica_confinamento_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_oferta_trato_vagao
  ON public.registros_oferta_trato (vagao_id)
  WHERE deleted_at IS NULL;
