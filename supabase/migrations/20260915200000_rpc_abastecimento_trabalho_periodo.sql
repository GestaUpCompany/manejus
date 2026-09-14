-- RPC get_dados_relatorio_abastecimento: adiciona calculo de horas/km trabalhadas entre abastecimentos
-- Usa LAG window function particionada por maquina para calcular diferenca entre leituras consecutivas
-- de odometro_horimetro. Deriva unidade (h para maquina, km para veiculo) do tipo do cadastro.

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

  -- Registros com LAG para calcular trabalho no periodo entre abastecimentos consecutivos
  -- O LAG e calculado sobre TODOS os registros da fazenda (sem filtro de data) para que
  -- o primeiro abastecimento dentro do periodo filtrado ainda tenha a leitura anterior.
  WITH registros_com_lag AS (
    SELECT
      ra.id, ra.data, ra.created_at, ra.maquina_veiculo, ra.maquina_veiculo_id,
      ra.combustivel, ra.total_abastecido, ra.tipo_operacao,
      ra.tipo_operacao_outros, ra.operador_motorista, ra.quem_abasteceu,
      ra.placa, ra.odometro_horimetro, ra.total_bomba, ra.observacao,
      mv.nome AS mv_nome, mv.modelo AS mv_modelo, mv.tipo AS maquina_tipo,
      LAG(ra.odometro_horimetro) OVER w AS odometro_anterior,
      ra.odometro_horimetro - LAG(ra.odometro_horimetro) OVER w AS diferenca
    FROM registros_abastecimento ra
    LEFT JOIN maquinas_veiculos mv ON mv.id = ra.maquina_veiculo_id
    WHERE ra.fazenda_id = v_fazenda_id AND ra.deleted_at IS NULL
    WINDOW w AS (
      PARTITION BY COALESCE(ra.maquina_veiculo_id::text, ra.maquina_veiculo)
      ORDER BY ra.data, ra.created_at
    )
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'maquina', maquina_veiculo,
    'marca', COALESCE(mv_nome, maquina_veiculo),
    'modelo', COALESCE(mv_modelo, ''),
    'maquina_veiculo_id', maquina_veiculo_id,
    'combustivel', combustivel,
    'operacao', COALESCE(NULLIF(tipo_operacao, ''), tipo_operacao_outros, 'Nao informado'),
    'litros', total_abastecido,
    'data', to_char(data, 'YYYY-MM-DD'),
    'operador', operador_motorista,
    'quem_abasteceu', quem_abasteceu,
    'placa', placa,
    'odometro', odometro_horimetro,
    'odometro_anterior', odometro_anterior,
    'trabalho_periodo', CASE WHEN diferenca IS NOT NULL AND diferenca > 0 THEN diferenca ELSE NULL END,
    'unidade_trabalho', CASE WHEN maquina_tipo = 'Veiculo' THEN 'km' WHEN maquina_tipo = 'Maquina' THEN 'h' ELSE NULL END,
    'consumo_por_unidade', CASE WHEN diferenca IS NOT NULL AND diferenca > 0 AND total_abastecido > 0
      THEN ROUND(total_abastecido / diferenca, 3) ELSE NULL END,
    'total_bomba', total_bomba,
    'observacao', observacao
  ) ORDER BY data, created_at), '[]'::jsonb)
  INTO v_registros
  FROM registros_com_lag
  WHERE (p_data_inicio IS NULL OR data::date >= p_data_inicio)
    AND (p_data_fim IS NULL OR data::date <= p_data_fim);

  -- Listas de filtros disponiveis (todas, sem filtro de data)
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
