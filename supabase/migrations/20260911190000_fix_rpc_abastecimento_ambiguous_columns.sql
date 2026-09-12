CREATE OR REPLACE FUNCTION public.get_dados_relatorio_abastecimento(
  p_token uuid,
  p_data_inicio date DEFAULT NULL::date,
  p_data_fim date DEFAULT NULL::date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fazenda_id uuid;
  v_ativo boolean;
  v_expira timestamptz;
  v_registros jsonb;
  v_maquinas jsonb;
  v_combustiveis jsonb;
  v_operacoes jsonb;
BEGIN
  SELECT fazenda_id, ativo, expira_em INTO v_fazenda_id, v_ativo, v_expira
  FROM relatorios_publicos
  WHERE id = p_token AND tipo = 'abastecimento';

  IF NOT FOUND OR v_ativo = false OR (v_expira IS NOT NULL AND v_expira < now()) THEN
    RAISE EXCEPTION 'Token invalido ou expirado';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'maquina', ra.maquina_veiculo,
    'marca', COALESCE(mv.nome, ra.maquina_veiculo),
    'modelo', COALESCE(mv.modelo, ''),
    'maquina_veiculo_id', ra.maquina_veiculo_id,
    'combustivel', ra.combustivel,
    'operacao', COALESCE(NULLIF(ra.tipo_operacao, ''), ra.tipo_operacao_outros, 'Nao informado'),
    'litros', ra.total_abastecido,
    'data', to_char(ra.data, 'YYYY-MM-DD'),
    'operador', ra.operador_motorista,
    'quem_abasteceu', ra.quem_abasteceu,
    'placa', ra.placa,
    'odometro', ra.odometro_horimetro,
    'total_bomba', ra.total_bomba,
    'observacao', ra.observacao
  ) ORDER BY ra.data, ra.created_at), '[]'::jsonb)
  INTO v_registros
  FROM registros_abastecimento ra
  LEFT JOIN maquinas_veiculos mv ON mv.id = ra.maquina_veiculo_id
  WHERE ra.fazenda_id = v_fazenda_id AND ra.deleted_at IS NULL
    AND (p_data_inicio IS NULL OR ra.data::date >= p_data_inicio)
    AND (p_data_fim IS NULL OR ra.data::date <= p_data_fim);

  SELECT COALESCE(jsonb_agg(DISTINCT ra.maquina_veiculo), '[]'::jsonb)
  INTO v_maquinas
  FROM registros_abastecimento ra
  WHERE ra.fazenda_id = v_fazenda_id AND ra.deleted_at IS NULL AND ra.maquina_veiculo IS NOT NULL AND ra.maquina_veiculo <> '';

  SELECT COALESCE(jsonb_agg(DISTINCT ra.combustivel), '[]'::jsonb)
  INTO v_combustiveis
  FROM registros_abastecimento ra
  WHERE ra.fazenda_id = v_fazenda_id AND ra.deleted_at IS NULL AND ra.combustivel IS NOT NULL AND ra.combustivel <> '';

  SELECT COALESCE(jsonb_agg(DISTINCT COALESCE(NULLIF(ra.tipo_operacao, ''), ra.tipo_operacao_outros, 'Nao informado')), '[]'::jsonb)
  INTO v_operacoes
  FROM registros_abastecimento ra
  WHERE ra.fazenda_id = v_fazenda_id AND ra.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'fazenda_id', v_fazenda_id,
    'dados', jsonb_build_object(
      'registros', v_registros,
      'maquinas_disponiveis', v_maquinas,
      'combustiveis_disponiveis', v_combustiveis,
      'operacoes_disponiveis', v_operacoes
    )
  );
END;
$function$;;
