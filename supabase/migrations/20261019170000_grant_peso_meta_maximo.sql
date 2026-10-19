-- ============================================================================
-- Fix: permission denied for function _peso_meta_maximo
-- ============================================================================
-- A função é usada nos CHECKs chk_planos_peso_meta_maximo e
-- chk_pcp_peso_meta_maximo, que rodam com o papel de quem grava (authenticated).
-- Sem EXECUTE, criar/editar plano com peso meta falhava no modal de dietas.
-- anon fica de fora: nenhuma escrita nessas tabelas acontece sem login.
-- ============================================================================

GRANT EXECUTE ON FUNCTION public._peso_meta_maximo() TO authenticated, service_role;
