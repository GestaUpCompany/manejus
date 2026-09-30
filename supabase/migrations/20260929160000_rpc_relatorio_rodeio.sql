-- RPCs do relatório de Rodeio (link público + Infográfico Mensal).
-- Mesmo padrão da get_dados_relatorio_clima: SECURITY DEFINER, valida token em
-- relatorios_publicos, filtra por fazenda e período no timezone da fazenda.
--
-- A variante *_fazenda (authenticated, valida user_has_fazenda_access) existe
-- para o Infográfico Mensal, que consome os dados via loaders.ts sem link
-- público. Segue o padrão de 20260916000010_relatorio_geral_storage_e_acesso.sql.
--
-- Retorna JSON com:
--   fazenda_id
--   dados: { fazenda_nome, fazenda_logo_url, timezone,
--            pastos_disponiveis, lotes_disponiveis, usuarios_disponiveis,
--            registros: [...] }
--
-- Cada registro traz a contagem por categoria, escores, equipe e o jsonb
-- `diagnosticos` cru (o front/PDF classificam S/N conforme o item ser "OK?"
-- ou "problema", ver RODEIO_DIAGNOSTICOS no PWA pdfUtils.ts).

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
    'diagnosticos', r.diagnosticos
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

-- Variante para o Infográfico Mensal: recebe fazenda_id direto, valida acesso
-- do usuário autenticado e reutiliza a RPC pública via token temporário.
CREATE OR REPLACE FUNCTION public.get_dados_relatorio_rodeio_fazenda(
  p_fazenda_id uuid,
  p_data_inicio date,
  p_data_fim date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_token uuid;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Acesso negado à fazenda';
  END IF;
  INSERT INTO public.relatorios_publicos (fazenda_id, tipo, titulo)
  VALUES (p_fazenda_id, 'rodeio', 'Relatório temporário')
  RETURNING id INTO v_token;
  v_result := public.get_dados_relatorio_rodeio(v_token, p_data_inicio, p_data_fim);
  DELETE FROM public.relatorios_publicos WHERE id = v_token;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dados_relatorio_rodeio_fazenda(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_rodeio_fazenda(uuid, date, date) TO authenticated;
