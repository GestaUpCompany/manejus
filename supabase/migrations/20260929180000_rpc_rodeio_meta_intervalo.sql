-- Adiciona meta de intervalo de rodeio ao payload do relatório de Rodeio.
-- Cada registro passa a trazer:
--   meta_intervalo_dias   -> lotes.meta_intervalo_rodeio_dias do lote (null se
--                            o lote não tem meta ou o registro usa lote legado
--                            sem lote_id)
--   dias_desde_anterior   -> dias corridos desde o rodeio anterior do MESMO
--                            lote (buscado em todo o histórico, não só no
--                            período filtrado), null no primeiro rodeio do
--                            lote ou quando não há lote_id
-- A classificação dentro/fora da meta fica no front (relatorioRodeio/
-- agregacao.ts) para ser compartilhada entre página pública, PDF e
-- Infográfico Mensal.

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_rodeio(
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
  v_pastos jsonb;
  v_lotes jsonb;
  v_usuarios jsonb;
BEGIN
  -- Validar token
  SELECT fazenda_id, ativo, expira_em INTO v_fazenda_id, v_ativo, v_expira
  FROM relatorios_publicos
  WHERE id = p_token AND tipo = 'rodeio';

  IF NOT FOUND OR v_ativo = false OR (v_expira IS NOT NULL AND v_expira < now()) THEN
    RAISE EXCEPTION 'Token invalido ou expirado';
  END IF;

  -- Nome, logo e timezone da fazenda
  SELECT nome, logo_url, COALESCE(timezone, 'America/Cuiaba')
    INTO v_fazenda_nome, v_fazenda_logo_url, v_timezone
  FROM fazendas
  WHERE id = v_fazenda_id;

  -- Registros do período. pasto/lote resolvem pelo join no id (cadastro
  -- atual) com fallback para as colunas de texto legadas de registros
  -- antigos que só têm o nome solto.
  -- O rodeio anterior do lote é buscado em todo o histórico para que o
  -- primeiro registro do período também possa ser classificado contra a
  -- meta (data em timezone da fazenda, igual ao campo `data` exposto).
  WITH regs AS (
    SELECT
      r.id,
      r.data,
      COALESCE(p.nome, r.pasto) AS pasto_nome,
      COALESCE(l.nome, r.lote) AS lote_nome,
      r.nome_usuario,
      r.vaca,
      r.touro,
      r.bezerro,
      r.boi,
      r.garrote,
      r.novilha,
      r.total_cabecas,
      r.escore_gado,
      r.escore_fezes,
      r.equipe,
      r.equipe_nomes,
      r.gado_contado,
      r.diagnosticos,
      l.meta_intervalo_rodeio_dias,
      (SELECT MAX(r2.data)
         FROM registros_rodeio r2
        WHERE r2.lote_id = r.lote_id
          AND r2.deleted_at IS NULL
          AND r2.data < r.data) AS data_anterior,
      to_char(r.data AT TIME ZONE v_timezone, 'YYYY-MM-DD') AS data_dia,
      to_char(r.data AT TIME ZONE v_timezone, 'HH24:MI') AS horario_registro
    FROM registros_rodeio r
    LEFT JOIN pastos p ON p.id = r.pasto_id
    LEFT JOIN lotes l ON l.id = r.lote_id
    WHERE r.fazenda_id = v_fazenda_id
      AND r.deleted_at IS NULL
      AND (p_data_inicio IS NULL OR (r.data AT TIME ZONE v_timezone)::date >= p_data_inicio)
      AND (p_data_fim IS NULL OR (r.data AT TIME ZONE v_timezone)::date <= p_data_fim)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'registro_id', r.id,
    'data', r.data_dia,
    'horario', r.horario_registro,
    'pasto', r.pasto_nome,
    'lote', r.lote_nome,
    'nome_usuario', r.nome_usuario,
    'vaca', r.vaca,
    'touro', r.touro,
    'bezerro', r.bezerro,
    'boi', r.boi,
    'garrote', r.garrote,
    'novilha', r.novilha,
    'total_cabecas', r.total_cabecas,
    'escore_gado', r.escore_gado,
    'escore_fezes', r.escore_fezes,
    'equipe', r.equipe,
    'equipe_nomes', r.equipe_nomes,
    'gado_contado', r.gado_contado,
    'diagnosticos', r.diagnosticos,
    'meta_intervalo_dias', r.meta_intervalo_rodeio_dias,
    'dias_desde_anterior',
      CASE WHEN r.data_anterior IS NULL THEN NULL
           ELSE ((r.data AT TIME ZONE v_timezone)::date
               - (r.data_anterior AT TIME ZONE v_timezone)::date)
      END
  ) ORDER BY r.data DESC), '[]'::jsonb)
  INTO v_registros
  FROM regs r;

  -- Dimensões para os slicers do relatório público: distintas de TODO o
  -- histórico da fazenda (sem filtro de data), como faz o clima com
  -- pluviômetros, para não esconder opções ao filtrar período.
  SELECT COALESCE(jsonb_agg(nome ORDER BY nome), '[]'::jsonb)
  INTO v_pastos
  FROM (
    SELECT DISTINCT COALESCE(p.nome, r.pasto) AS nome
    FROM registros_rodeio r
    LEFT JOIN pastos p ON p.id = r.pasto_id
    WHERE r.fazenda_id = v_fazenda_id
      AND r.deleted_at IS NULL
      AND COALESCE(p.nome, r.pasto) IS NOT NULL
  ) d;

  SELECT COALESCE(jsonb_agg(nome ORDER BY nome), '[]'::jsonb)
  INTO v_lotes
  FROM (
    SELECT DISTINCT COALESCE(l.nome, r.lote) AS nome
    FROM registros_rodeio r
    LEFT JOIN lotes l ON l.id = r.lote_id
    WHERE r.fazenda_id = v_fazenda_id
      AND r.deleted_at IS NULL
      AND COALESCE(l.nome, r.lote) IS NOT NULL
  ) d;

  SELECT COALESCE(jsonb_agg(nome ORDER BY nome), '[]'::jsonb)
  INTO v_usuarios
  FROM (
    SELECT DISTINCT r.nome_usuario AS nome
    FROM registros_rodeio r
    WHERE r.fazenda_id = v_fazenda_id
      AND r.deleted_at IS NULL
      AND r.nome_usuario IS NOT NULL
  ) d;

  RETURN jsonb_build_object(
    'fazenda_id', v_fazenda_id,
    'dados', jsonb_build_object(
      'fazenda_nome', v_fazenda_nome,
      'fazenda_logo_url', v_fazenda_logo_url,
      'timezone', v_timezone,
      'pastos_disponiveis', v_pastos,
      'lotes_disponiveis', v_lotes,
      'usuarios_disponiveis', v_usuarios,
      'registros', v_registros
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_rodeio(uuid, date, date) TO anon, authenticated;
