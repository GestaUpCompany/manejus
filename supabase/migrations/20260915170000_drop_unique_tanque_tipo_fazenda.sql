-- Remove unique constraint que impedia múltiplos tanques do mesmo tipo de combustível por fazenda.
-- O sistema agora permite dois ou mais tanques ativos do mesmo tipo na mesma fazenda.

DROP INDEX IF EXISTS public.idx_tanques_combustivel_unique_tipo_fazenda;
