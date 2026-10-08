-- ROLLBACK de 20261008100000_individuos_dados_de_saida.sql
-- NÃO fica em supabase/migrations/ de propósito. ATENÇÃO: apaga os valores já gravados nas 3 colunas.
-- Reverter depois da 20261008110000 exige reverter aquela antes (o trigger de morte escreve nestas colunas).
ALTER TABLE public.individuos
  DROP COLUMN IF EXISTS data_saida,
  DROP COLUMN IF EXISTS motivo_saida,
  DROP COLUMN IF EXISTS destino_saida;
