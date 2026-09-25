-- RPC para relatório público de clima (pluviômetros)
-- Mesmo padrão da get_dados_relatorio_tratos:
-- SECURITY DEFINER, valida token, filtra por fazenda_id e intervalo de data.
--
-- Cada linha de registros_clima é uma sessão de leitura com medicoes jsonb
-- (uma entrada por pluviômetro: medicao em mm, temperatura, horario). O
-- relatório trabalha achatado: uma linha por medição, o que simplifica o
-- cross-filter no front e a tabela no PDF.
--
-- Retorna JSON com:
--   fazenda_nome, fazenda_logo_url, timezone
--   pluviometros_disponiveis: [{ pluviometro_id, pluviometro_nome, pluviometro_localizacao }]
--   registros: [{ registro_id, data, horario, pluviometro_id, pluviometro_nome,
--                pluviometro_localizacao, medicao_mm, temperatura,
--                temperatura_media, umidade_relativa, responsavel,
--                nome_usuario, observacao }]

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_clima(
  p_token uuid,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fazenda_id uuid;
  v_ativo boolean;
  v_expira timestamptz;
  v_fazenda_nome text;
  v_fazenda_logo_url text;
  v_timezone text;
  v_registros jsonb;
  v_pluviometros jsonb;
BEGIN
  -- Validar token
  SELECT fazenda_id, ativo, expira_em INTO v_fazenda_id, v_ativo, v_expira
  FROM relatorios_publicos
  WHERE id = p_token AND tipo = 'clima';

  IF NOT FOUND OR v_ativo = false OR (v_expira IS NOT NULL AND v_expira < now()) THEN
    RAISE EXCEPTION 'Token invalido ou expirado';
  END IF;

  -- Buscar nome, logo e timezone da fazenda
  SELECT nome, logo_url, COALESCE(timezone, 'America/Cuiaba') INTO v_fazenda_nome, v_fazenda_logo_url, v_timezone
  FROM fazendas
  WHERE id = v_fazenda_id;

  -- Pluviômetros disponíveis (sem filtro de data, derivados das medições para
  -- cobrir pluviômetros já inativos/excluídos que constam no histórico)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'pluviometro_id', pid,
    'pluviometro_nome', nome,
    'pluviometro_localizacao', loc
  ) ORDER BY nome), '[]'::jsonb)
  INTO v_pluviometros
  FROM (
    SELECT DISTINCT
      m->>'pluviometro_id' AS pid,
      m->>'pluviometro_nome' AS nome,
      m->>'pluviometro_localizacao' AS loc
    FROM registros_clima r,
         jsonb_array_elements(COALESCE(r.medicoes, '[]'::jsonb)) m
    WHERE r.fazenda_id = v_fazenda_id
      AND r.deleted_at IS NULL
      AND m->>'pluviometro_id' IS NOT NULL
  ) d;

  -- Registros achatados: uma linha por medição de pluviômetro
  WITH regs AS (
    SELECT
      r.id,
      r.data,
      r.medicoes,
      r.responsavel,
      r.nome_usuario,
      r.temperatura_media,
      r.umidade_relativa,
      r.observacao,
      to_char(r.data AT TIME ZONE v_timezone, 'YYYY-MM-DD') AS data_dia,
      to_char(r.data AT TIME ZONE v_timezone, 'HH24:MI') AS horario_registro
    FROM registros_clima r
    WHERE r.fazenda_id = v_fazenda_id
      AND r.deleted_at IS NULL
      AND (p_data_inicio IS NULL OR (r.data AT TIME ZONE v_timezone)::date >= p_data_inicio)
      AND (p_data_fim IS NULL OR (r.data AT TIME ZONE v_timezone)::date <= p_data_fim)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'registro_id', r.id,
    'data', r.data_dia,
    'horario', COALESCE(m->>'horario', r.horario_registro),
    'pluviometro_id', m->>'pluviometro_id',
    'pluviometro_nome', m->>'pluviometro_nome',
    'pluviometro_localizacao', m->>'pluviometro_localizacao',
    'medicao_mm', NULLIF(m->>'medicao', '')::numeric,
    'temperatura', NULLIF(m->>'temperatura', '')::numeric,
    'temperatura_media', r.temperatura_media,
    'umidade_relativa', r.umidade_relativa,
    'responsavel', r.responsavel,
    'nome_usuario', r.nome_usuario,
    'observacao', r.observacao
  ) ORDER BY r.data DESC, COALESCE(m->>'horario', r.horario_registro) DESC), '[]'::jsonb)
  INTO v_registros
  FROM regs r,
       jsonb_array_elements(COALESCE(r.medicoes, '[]'::jsonb)) m;

  RETURN jsonb_build_object(
    'fazenda_id', v_fazenda_id,
    'dados', jsonb_build_object(
      'fazenda_nome', v_fazenda_nome,
      'fazenda_logo_url', v_fazenda_logo_url,
      'timezone', v_timezone,
      'pluviometros_disponiveis', v_pluviometros,
      'registros', v_registros
    )
  );
END;
$function$;

-- Permissão para anon e authenticated (relatório público)
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_clima(uuid, date, date) TO anon, authenticated;
