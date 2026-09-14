-- Converter odometro_horimetro de text para numeric(12,3) nullable
-- 12 registros com formato BR (ponto de milhar + virgula decimal) ja convertidos via MCP.
-- 6 registros restantes com texto livre ("Não marca") ou notacao cientifica absurda serao setados para NULL.

-- 1. Remover NOT NULL (maquinas sem horimetro/odometro podem ter NULL)
ALTER TABLE public.registros_abastecimento
  ALTER COLUMN odometro_horimetro DROP NOT NULL;

-- 2. Limpar valores nao-numericos restantes
UPDATE registros_abastecimento
SET odometro_horimetro = NULL
WHERE odometro_horimetro IS NOT NULL
  AND odometro_horimetro != ''
  AND odometro_horimetro !~ '^[0-9]+(\.[0-9]+)?$';

-- 3. Converter text -> numeric(12,3)
ALTER TABLE public.registros_abastecimento
  ALTER COLUMN odometro_horimetro TYPE numeric(12,3) USING odometro_horimetro::numeric;
