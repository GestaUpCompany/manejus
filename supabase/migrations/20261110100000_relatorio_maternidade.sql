-- Relatorio de Maternidade (tipo 'maternidade'): partos, crias e matrizes no periodo.
-- Parte 1: get_dados_relatorio_maternidade, SECURITY DEFINER validada por token (mesmo padrao do almoxarifado).
-- Parte 2: variante _fazenda para o Infografico Mensal (token temporario).
-- Devolve as linhas de registros_maternidade do periodo (deleted_at IS NULL, data no fuso America/Cuiaba),
-- limitadas a 5000, e a agregacao (KPIs, distribuicoes, matrizes) e feita no front/PDF a partir delas.
-- tipo_parto e um array jsonb de rotulos (Normal, Cesarea, Gemeos, Auxiliado, Aborto, Natimorto);
-- medicamentos e um array jsonb de objetos (nomeComercial, tipo, doseAplicada...).
-- Aditiva: so cria funcoes novas. Rollback em supabase/rollbacks/.

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_maternidade(
  p_token uuid,
  p_data_inicio date DEFAULT NULL::date,
  p_data_fim date DEFAULT NULL::date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_max_registros CONSTANT integer := 5000;
  v_fazenda_id uuid;
  v_ativo boolean;
  v_expira timestamptz;
  v_fazenda_nome text;
  v_fazenda_logo text;
  v_registros jsonb;
  v_total integer;
BEGIN
  SELECT fazenda_id, ativo, expira_em INTO v_fazenda_id, v_ativo, v_expira
  FROM relatorios_publicos
  WHERE id = p_token AND tipo = 'maternidade';

  IF NOT FOUND OR v_ativo = false OR (v_expira IS NOT NULL AND v_expira < now()) THEN
    RAISE EXCEPTION 'Token invalido ou expirado';
  END IF;

  SELECT f.nome, f.logo_url INTO v_fazenda_nome, v_fazenda_logo FROM fazendas f WHERE f.id = v_fazenda_id;

  SELECT COUNT(*) INTO v_total
  FROM registros_maternidade r
  WHERE r.fazenda_id = v_fazenda_id AND r.deleted_at IS NULL
    AND (p_data_inicio IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date >= p_data_inicio)
    AND (p_data_fim IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date <= p_data_fim);

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'data' DESC, x->>'id'), '[]'::jsonb) INTO v_registros
  FROM (
    SELECT jsonb_build_object(
      'id', r.id,
      'data', to_char(r.data AT TIME ZONE 'America/Cuiaba', 'YYYY-MM-DD'),
      'pasto', NULLIF(btrim(COALESCE(r.pasto, '')), ''),
      'lote', NULLIF(btrim(COALESCE(r.lote, '')), ''),
      'sexo', NULLIF(btrim(COALESCE(r.sexo, '')), ''),
      'raca', NULLIF(btrim(COALESCE(r.raca, '')), ''),
      'peso_cria_kg', r.peso_cria_kg,
      'tipo_parto', CASE WHEN jsonb_typeof(r.tipo_parto) = 'array' THEN r.tipo_parto ELSE '[]'::jsonb END,
      'categoria_mae', NULLIF(btrim(COALESCE(r.categoria_mae, '')), ''),
      'escore_matriz', NULLIF(btrim(COALESCE(r.escore_matriz, '')), ''),
      'docilidade_matriz', r.docilidade_matriz,
      'tratamento', NULLIF(btrim(COALESCE(r.tratamento, '')), ''),
      'medicamentos', CASE WHEN jsonb_typeof(r.medicamentos) = 'array' THEN r.medicamentos ELSE '[]'::jsonb END,
      'mae', COALESCE(NULLIF(btrim(r.id_manejo_mae), ''), NULLIF(btrim(r.id_brinco_mae), ''), NULLIF(btrim(r.id_chip_mae), '')),
      'cria', COALESCE(NULLIF(btrim(r.id_brinco_cria), ''), NULLIF(btrim(r.id_chip_cria), ''), NULLIF(btrim(r.id_provisorio_cria), '')),
      'parto_vinculo_id', r.parto_vinculo_id,
      'mae_adotiva', COALESCE(NULLIF(btrim(r.id_manejo_mae_adotiva), ''), NULLIF(btrim(r.id_brinco_mae_adotiva), ''), NULLIF(btrim(r.id_chip_mae_adotiva), '')),
      'observacao', NULLIF(btrim(COALESCE(r.observacao_parto, '')), ''),
      'responsavel', NULLIF(btrim(COALESCE(r.nome_usuario, '')), '')
    ) AS x
    FROM registros_maternidade r
    WHERE r.fazenda_id = v_fazenda_id AND r.deleted_at IS NULL
      AND (p_data_inicio IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date >= p_data_inicio)
      AND (p_data_fim IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date <= p_data_fim)
    ORDER BY r.data DESC, r.id
    LIMIT c_max_registros
  ) t;

  RETURN jsonb_build_object(
    'fazenda_id', v_fazenda_id,
    'dados', jsonb_build_object(
      'fazenda_nome', v_fazenda_nome,
      'fazenda_logo_url', v_fazenda_logo,
      'timezone', 'America/Cuiaba',
      'gerado_em', now(),
      'data_inicio', p_data_inicio,
      'data_fim', p_data_fim,
      'registros', v_registros,
      'registros_total', v_total
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_maternidade(uuid, date, date) TO anon, authenticated;

-- Variante para o Infografico Mensal: recebe fazenda_id, valida acesso do usuario autenticado
-- e reutiliza a RPC publica via token temporario.
CREATE OR REPLACE FUNCTION public.get_dados_relatorio_maternidade_fazenda(
  p_fazenda_id uuid,
  p_data_inicio date DEFAULT NULL::date,
  p_data_fim date DEFAULT NULL::date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token uuid;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Acesso negado à fazenda';
  END IF;
  INSERT INTO public.relatorios_publicos (fazenda_id, tipo, titulo)
  VALUES (p_fazenda_id, 'maternidade', 'Relatório temporário')
  RETURNING id INTO v_token;
  v_result := public.get_dados_relatorio_maternidade(v_token, p_data_inicio, p_data_fim);
  DELETE FROM public.relatorios_publicos WHERE id = v_token;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dados_relatorio_maternidade_fazenda(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_maternidade_fazenda(uuid, date, date) TO authenticated;
