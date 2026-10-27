-- Lotes: lotação (UA/ha) e produtividade (kg/ha) informadas no cadastro do lote.
-- Aditiva e nullable: não quebra o PWA, que continua sem enviar as colunas novas.
ALTER TABLE public.lotes
  ADD COLUMN IF NOT EXISTS ua_ha numeric(10,2),
  ADD COLUMN IF NOT EXISTS kg_ha numeric(10,2);
