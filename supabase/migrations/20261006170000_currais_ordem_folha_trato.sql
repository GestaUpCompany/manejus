-- Ordem manual dos currais na folha de trato
--
-- A seção "Currais em trato" da Programação de Tratos (painel) permite
-- reordenar os currais arrastando. Essa ordem é respeitada pela folha de
-- lançamento do painel (LancamentoTratos, tela e PDF) e pela barra inferior
-- de currais da folha de trato no PWA (TratoConfinamentoPage).
--
-- A ordenação é por curral (não por ocupação): quando um lote novo entra no
-- curral, a posição se mantém. Currais sem ordem (NULL) aparecem por último,
-- ordenados por nome.

ALTER TABLE public.currais
  ADD COLUMN IF NOT EXISTS ordem_folha_trato integer;

-- Backfill: ordem alfabética dentro de cada fazenda para currais existentes.
WITH ordenados AS (
  SELECT id, row_number() OVER (PARTITION BY fazenda_id ORDER BY nome) AS pos
  FROM public.currais
  WHERE deleted_at IS NULL
)
UPDATE public.currais c
SET ordem_folha_trato = o.pos
FROM ordenados o
WHERE c.id = o.id;

CREATE INDEX IF NOT EXISTS idx_currais_ordem_folha_trato
  ON public.currais (fazenda_id, ordem_folha_trato);
