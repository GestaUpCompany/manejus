-- Corrige 20261103160000: registros_manutencao_maquinas tem id bigint e quebrava o UNION ALL (uuid x bigint).-- Todos os ids passam a text no UNION; no JSON final continuam strings.
-- Maternidade/enfermaria/rodeio mantêm o filtro de lote/pasto ativos.

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
          SELECT id::text, 'Maternidade' AS tipo, 'Registro de parto' AS titulo, data::text AS data, created_at
          FROM registros_maternidade
          WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
            AND (lote_id IS NULL OR lote_id IN (SELECT id FROM lotes WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
            AND (pasto_id IS NULL OR pasto_id IN (SELECT id FROM pastos WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
          UNION ALL
          SELECT id::text, 'Enfermaria', 'Registro de tratamento', data::text, created_at
          FROM registros_enfermaria
          WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
            AND (lote_id IS NULL OR lote_id IN (SELECT id FROM lotes WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
            AND (pasto_id IS NULL OR pasto_id IN (SELECT id FROM pastos WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
          UNION ALL
          SELECT id::text, 'Rodeio', 'Registro de rodeio', data::text, created_at
          FROM registros_rodeio
          WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
            AND (lote_id IS NULL OR lote_id IN (SELECT id FROM lotes WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
            AND (pasto_id IS NULL OR pasto_id IN (SELECT id FROM pastos WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
          UNION ALL SELECT id::text, 'Pastagens', 'Registro de pastagem', data::text, created_at FROM registros_pastagens WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id::text, 'Suplementação', 'Registro de suplementação', data::text, created_at FROM registros_suplementacao WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id::text, 'Bebedouros', 'Registro de bebedouro', data::text, created_at FROM registros_bebedouros WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id::text, 'Movimentação', 'Registro de movimentação', data::text, created_at FROM registros_movimentacao WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id::text, 'Morte', 'Registro de morte', data::text, created_at FROM registros_morte WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id::text, 'Pesagem', 'Registro de pesagem', data::text, created_at FROM registros_pesagem WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id::text, 'Leitura de cocho', 'Registro de leitura de cocho', data::text, created_at FROM registros_leitura_cocho WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id::text, 'Trato', 'Registro de trato', data::text, created_at FROM registros_oferta_trato WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id::text, 'Fábrica de confinamento', 'Registro de fábrica', data::text, created_at FROM registros_fabrica_confinamento WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id::text, 'Manejo de curral', 'Registro de manejo de curral', created_at::text, created_at FROM registros_manejo_curral WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id::text, 'Clima', 'Registro de clima', data::text, created_at FROM registros_clima WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id::text, 'Limpeza', 'Registro de limpeza', data::text, created_at FROM registros_limpeza WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id::text, 'Problemas', 'Registro de problema', data::text, created_at FROM registros_problemas WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id::text, 'Operações de máquinas', 'Registro de operação', data::text, created_at FROM registros_operacoes_maquinas WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id::text, 'Manutenção de máquinas', 'Registro de manutenção', data::text, created_at FROM registros_manutencao_maquinas WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id::text, 'Abastecimento', 'Registro de abastecimento', data::text, created_at FROM registros_abastecimento WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id::text, 'Almoxarifado', 'Registro de almoxarifado', data::text, created_at FROM registros_almoxarifado WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id::text, 'Cantina', 'Registro de cantina', data::text, created_at FROM registros_alimentacao WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id::text, 'Entrada de insumos', 'Entrada de insumos', created_at::text, created_at FROM registros_entrada_insumos WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id::text, 'Saída de insumos', 'Saída de insumos', created_at::text, created_at FROM registros_saida_insumos WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
        ) recentes
        ORDER BY created_at DESC
        LIMIT 10
      ) top10
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
