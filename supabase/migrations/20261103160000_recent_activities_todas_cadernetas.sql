-- Atividades recentes do dashboard: passa a cobrir todas as cadernetas com registros_*
-- (antes só maternidade, enfermaria e rodeio, então o bloco ficava vazio para quem lança as demais).
-- Formato do JSON mantido (id, type, title, data); 'type' é o rótulo da caderneta.
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
          SELECT id, 'Maternidade' AS tipo, 'Registro de parto' AS titulo, data::text AS data, created_at
          FROM registros_maternidade
          WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
            AND (lote_id IS NULL OR lote_id IN (SELECT id FROM lotes WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
            AND (pasto_id IS NULL OR pasto_id IN (SELECT id FROM pastos WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
          UNION ALL
          SELECT id, 'Enfermaria', 'Registro de tratamento', data::text, created_at
          FROM registros_enfermaria
          WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
            AND (lote_id IS NULL OR lote_id IN (SELECT id FROM lotes WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
            AND (pasto_id IS NULL OR pasto_id IN (SELECT id FROM pastos WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
          UNION ALL
          SELECT id, 'Rodeio', 'Registro de rodeio', data::text, created_at
          FROM registros_rodeio
          WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
            AND (lote_id IS NULL OR lote_id IN (SELECT id FROM lotes WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
            AND (pasto_id IS NULL OR pasto_id IN (SELECT id FROM pastos WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
          UNION ALL SELECT id, 'Pastagens', 'Registro de pastagem', data::text, created_at FROM registros_pastagens WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id, 'Suplementação', 'Registro de suplementação', data::text, created_at FROM registros_suplementacao WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id, 'Bebedouros', 'Registro de bebedouro', data::text, created_at FROM registros_bebedouros WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id, 'Movimentação', 'Registro de movimentação', data::text, created_at FROM registros_movimentacao WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id, 'Morte', 'Registro de morte', data::text, created_at FROM registros_morte WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id, 'Pesagem', 'Registro de pesagem', data::text, created_at FROM registros_pesagem WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id, 'Leitura de cocho', 'Registro de leitura de cocho', data::text, created_at FROM registros_leitura_cocho WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id, 'Trato', 'Registro de trato', data::text, created_at FROM registros_oferta_trato WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id, 'Fábrica de confinamento', 'Registro de fábrica', data::text, created_at FROM registros_fabrica_confinamento WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id, 'Manejo de curral', 'Registro de manejo de curral', created_at::text, created_at FROM registros_manejo_curral WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id, 'Clima', 'Registro de clima', data::text, created_at FROM registros_clima WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id, 'Limpeza', 'Registro de limpeza', data::text, created_at FROM registros_limpeza WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id, 'Problemas', 'Registro de problema', data::text, created_at FROM registros_problemas WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id, 'Operações de máquinas', 'Registro de operação', data::text, created_at FROM registros_operacoes_maquinas WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id, 'Manutenção de máquinas', 'Registro de manutenção', data::text, created_at FROM registros_manutencao_maquinas WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id, 'Abastecimento', 'Registro de abastecimento', data::text, created_at FROM registros_abastecimento WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id, 'Almoxarifado', 'Registro de almoxarifado', data::text, created_at FROM registros_almoxarifado WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id, 'Cantina', 'Registro de cantina', data::text, created_at FROM registros_alimentacao WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id, 'Entrada de insumos', 'Entrada de insumos', created_at::text, created_at FROM registros_entrada_insumos WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
          UNION ALL SELECT id, 'Saída de insumos', 'Saída de insumos', created_at::text, created_at FROM registros_saida_insumos WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
        ) recentes
        ORDER BY created_at DESC
        LIMIT 10
      ) top10
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
