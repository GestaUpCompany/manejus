-- Rollback de 20261019170000_grant_peso_meta_maximo.sql
-- Atenção: sem esse GRANT, os CHECKs de peso meta voltam a falhar para authenticated.
REVOKE EXECUTE ON FUNCTION public._peso_meta_maximo() FROM authenticated, service_role;
