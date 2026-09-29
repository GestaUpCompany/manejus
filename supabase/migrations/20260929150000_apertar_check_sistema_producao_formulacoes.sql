-- Aperta a check constraint de formulacoes.sistema_producao para aceitar
-- apenas "Pasto" e "Confinamento" (além de NULL = Ambos).
-- Os valores legados de fase (Cria/Recria/Engorda) já foram migrados para
-- 'Pasto' via backfill pontual anterior; esta constraint impede reintrodução.

ALTER TABLE formulacoes DROP CONSTRAINT IF EXISTS dietas_sistema_producao_check;

ALTER TABLE formulacoes ADD CONSTRAINT dietas_sistema_producao_check
  CHECK (sistema_producao IS NULL OR sistema_producao = ANY (ARRAY['Pasto', 'Confinamento']));
