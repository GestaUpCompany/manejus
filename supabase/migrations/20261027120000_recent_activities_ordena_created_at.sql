-- Atividades recentes do dashboard: ordena pelo momento do lançamento (created_at),
-- não pela data do evento (data). Registros lançados com data retroativa (ex.: pelo PWA
-- depois de sincronizar) passavam a ficar fora do top 10 e não apareciam no dashboard.
-- Formato do JSON de saída mantido (id, type, title, data).

CREATE OR REPLACE FUNCTION public.get_recent_activities(p_fazenda_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.guard_fazenda(p_fazenda_id);
  SELECT jsonb_build_object(
    'activities', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'type', tipo,
        'title', titulo,
        'data', data
      ) ORDER BY created_at DESC)
      FROM (
        SELECT * FROM (
          SELECT id, 'Maternidade' AS tipo, 'Registro de parto' AS titulo, data, created_at
          FROM registros_maternidade
          WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
            AND (lote_id IS NULL OR lote_id IN (SELECT id FROM lotes WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
            AND (pasto_id IS NULL OR pasto_id IN (SELECT id FROM pastos WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
          UNION ALL
          SELECT id, 'Enfermaria' AS tipo, 'Registro de tratamento' AS titulo, data, created_at
          FROM registros_enfermaria
          WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
            AND (lote_id IS NULL OR lote_id IN (SELECT id FROM lotes WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
            AND (pasto_id IS NULL OR pasto_id IN (SELECT id FROM pastos WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
          UNION ALL
          SELECT id, 'Rodeio' AS tipo, 'Registro de rodeio' AS titulo, data, created_at
          FROM registros_rodeio
          WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
            AND (lote_id IS NULL OR lote_id IN (SELECT id FROM lotes WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
            AND (pasto_id IS NULL OR pasto_id IN (SELECT id FROM pastos WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
        ) recentes
        ORDER BY created_at DESC
        LIMIT 10
      ) top10
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
