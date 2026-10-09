-- ============================================================================
-- Indivíduos / Fase 4a (acompanhamento): fixa o search_path de gestacao_dias_padrao()
-- ============================================================================
-- O advisor de segurança (function_search_path_mutable) apontou a função criada em
-- 20261008160000 por não ter search_path definido. Constante (283), sem efeito colateral;
-- só alinha ao padrão das demais funções do schema. Sem impacto em dados, PWA ou painel.
-- Rollback: supabase/rollbacks/20261008161000_gestacao_dias_padrao_search_path_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gestacao_dias_padrao()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ SELECT 283 $function$;
