-- Rollback de 20261028100000_equideos_categorias_e_detalhar_tropa.sql
-- Não desfaz conversões já feitas por detalhar_tropa (categorias de equídeos criadas em lote_categorias).
DROP FUNCTION IF EXISTS public.detalhar_tropa(uuid, jsonb);
DROP FUNCTION IF EXISTS public.detalhar_tropa(uuid, uuid, jsonb);
DELETE FROM public.categoria_aliases WHERE alias = 'egua';
DELETE FROM public.categorias_animais WHERE slug IN ('cavalo', 'égua', 'jumento', 'jumenta', 'burro', 'mula');
