-- Grants que faltaram em 20260926120000_mapa_areas.sql.
-- Sem eles o PostgREST responde 403 no SELECT de mapa_areas e a camada
-- de áreas carrega vazia no mapa. Mesmo padrão de mapa_estradas/mapa_pontos.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mapa_areas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mapa_areas TO anon;

GRANT EXECUTE ON FUNCTION public.salvar_geometrias_mapa(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remover_area(uuid) TO authenticated;
