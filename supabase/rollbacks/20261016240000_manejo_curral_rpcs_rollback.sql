-- Rollback de 20261016240000_manejo_curral_rpcs (só remove as funções; dados e tabelas permanecem).
DROP FUNCTION IF EXISTS public.descartar_designacao_lote(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.confirmar_designacao_lote(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.aplicar_manejo_curral(uuid, uuid);
