-- Infográfico Anual, fase 2A: Maternidade e Manejo de Pastagens.
-- Mesmo padrão da fase 1 (20261111150000): cada RPC chama a RPC _fazenda do relatório mensal para o ano
-- civil inteiro (mesmas regras, mesmo controle de acesso via user_has_fazenda_access) e devolve só
-- agregados: 12 pontos por série + totais do ano + rankings top N. Nenhum registro individual sai do banco.
-- Aditiva: só cria funções novas. Rollback em supabase/rollbacks/.
-- Não são STABLE: as _fazenda gravam/apagam um token temporário em relatorios_publicos.

-- ───────────────────────────── Maternidade ─────────────────────────────
-- Regras idênticas às do front (src/features/relatorioMaternidade/agregacao.ts):
--  - cria morta = tipo_parto com Aborto ou Natimorto;
--  - parto = grupo de linhas com o mesmo parto_vinculo_id (gêmeos); sem vínculo, cada linha é um parto;
--  - intercorrência = parto com Cesárea, Auxiliado, Aborto ou Natimorto;
--  - peso médio só das crias vivas com peso > 0.
-- A RPC mensal limita a 5000 linhas; 'truncado' avisa quando o ano passou disso.
CREATE OR REPLACE FUNCTION public.get_infografico_anual_maternidade(p_fazenda_id uuid, p_ano int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_ini date; v_fim date; v_ult int; v_res jsonb;
BEGIN
  IF p_ano IS NULL OR p_ano < 2020 OR p_ano > extract(year FROM now())::int THEN
    RAISE EXCEPTION 'Ano inválido';
  END IF;
  SELECT data_inicio, data_fim, ultimo_mes INTO v_ini, v_fim, v_ult FROM public._infografico_anual_periodo(p_ano);
  v_res := public.get_dados_relatorio_maternidade_fazenda(p_fazenda_id, v_ini, v_fim);

  RETURN (
    WITH r AS (
      SELECT x->>'id' AS id,
             extract(month FROM (x->>'data')::date)::int AS mes,
             NULLIF(btrim(COALESCE(x->>'sexo', '')), '') AS sexo,
             NULLIF(btrim(COALESCE(x->>'raca', '')), '') AS raca,
             NULLIF(btrim(COALESCE(x->>'categoria_mae', '')), '') AS categoria_mae,
             NULLIF(x->>'peso_cria_kg', '')::numeric AS peso,
             COALESCE(x->>'parto_vinculo_id', x->>'id') AS grp,
             CASE WHEN jsonb_typeof(x->'tipo_parto') = 'array' THEN x->'tipo_parto' ELSE '[]'::jsonb END AS tp,
             CASE WHEN jsonb_typeof(x->'medicamentos') = 'array' THEN x->'medicamentos' ELSE '[]'::jsonb END AS meds,
             NULLIF(btrim(COALESCE(x->>'tratamento', '')), '') AS tratamento,
             NULLIF(btrim(COALESCE(x->>'mae', '')), '') AS mae
      FROM jsonb_array_elements(COALESCE(v_res->'dados'->'registros', '[]'::jsonb)) x
    ),
    f AS (
      SELECT r.*,
             (tp ?| ARRAY['Aborto', 'Natimorto']) AS morta,
             (tp ?| ARRAY['Cesárea', 'Cesarea', 'Auxiliado', 'Aborto', 'Natimorto']) AS interc,
             (tp ? 'Gêmeos') AS gemeo_tag,
             (tratamento IS NOT NULL OR jsonb_array_length(meds) > 0) AS medicado
      FROM r
    ),
    pt AS (
      SELECT grp, min(mes) AS mes, count(*) AS crias, bool_or(interc) AS interc, bool_or(medicado) AS medicado,
             (count(*) > 1 OR bool_or(gemeo_tag)) AS gemeos
      FROM f GROUP BY grp
    ),
    meses AS (SELECT generate_series(1, v_ult) AS mes)
    SELECT jsonb_build_object(
      'ano', p_ano, 'ultimo_mes', v_ult,
      'truncado', COALESCE((v_res->'dados'->>'registros_total')::int, 0) > jsonb_array_length(COALESCE(v_res->'dados'->'registros', '[]'::jsonb)),
      'kpis', jsonb_build_object(
        'partos', (SELECT count(*) FROM pt),
        'crias', (SELECT count(*) FROM f),
        'crias_vivas', (SELECT count(*) FROM f WHERE NOT morta),
        'crias_mortas', (SELECT count(*) FROM f WHERE morta),
        'taxa_perda', (SELECT CASE WHEN count(*) > 0 THEN round(count(*) FILTER (WHERE morta)::numeric / count(*), 4) END FROM f),
        'partos_gemeos', (SELECT count(*) FROM pt WHERE gemeos),
        'partos_intercorrencia', (SELECT count(*) FROM pt WHERE interc),
        'taxa_intercorrencia', (SELECT CASE WHEN count(*) > 0 THEN round(count(*) FILTER (WHERE interc)::numeric / count(*), 4) END FROM pt),
        'partos_medicados', (SELECT count(*) FROM pt WHERE medicado),
        'peso_medio_kg', (SELECT round(avg(peso), 2) FROM f WHERE NOT morta AND peso > 0),
        'pesadas', (SELECT count(*) FROM f WHERE NOT morta AND peso > 0),
        'machos', (SELECT count(*) FROM f WHERE lower(sexo) LIKE 'm%'),
        'femeas', (SELECT count(*) FROM f WHERE lower(sexo) LIKE 'f%'),
        'matrizes', (SELECT count(DISTINCT mae) FROM f)
      ),
      'mensal', (
        SELECT jsonb_agg(jsonb_build_object(
          'mes', meses.mes,
          'partos', (SELECT count(*) FROM pt WHERE pt.mes = meses.mes),
          'crias', (SELECT count(*) FROM f WHERE f.mes = meses.mes),
          'crias_mortas', (SELECT count(*) FROM f WHERE f.mes = meses.mes AND morta),
          'intercorrencias', (SELECT count(*) FROM pt WHERE pt.mes = meses.mes AND interc),
          'peso_medio_kg', (SELECT round(avg(peso), 2) FROM f WHERE f.mes = meses.mes AND NOT morta AND peso > 0)
        ) ORDER BY meses.mes) FROM meses
      ),
      'por_tipo_parto', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', t, 'valor', n) ORDER BY n DESC, t)
        FROM (SELECT t, count(*) n FROM f, jsonb_array_elements_text(f.tp) t GROUP BY t ORDER BY count(*) DESC, t LIMIT 8) q), '[]'::jsonb),
      'por_sexo', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', COALESCE(sexo, 'Não informado'), 'valor', n) ORDER BY n DESC)
        FROM (SELECT sexo, count(*) n FROM f GROUP BY sexo) q), '[]'::jsonb),
      'por_categoria_mae', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', COALESCE(categoria_mae, 'Não informado'), 'valor', n) ORDER BY n DESC)
        FROM (SELECT categoria_mae, count(*) n FROM f GROUP BY categoria_mae ORDER BY count(*) DESC LIMIT 8) q), '[]'::jsonb),
      'por_raca', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', COALESCE(raca, 'Não informado'), 'valor', n) ORDER BY n DESC)
        FROM (SELECT raca, count(*) n FROM f GROUP BY raca ORDER BY count(*) DESC LIMIT 8) q), '[]'::jsonb),
      'medicamentos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', nome, 'valor', n) ORDER BY n DESC, nome)
        FROM (
          SELECT COALESCE(NULLIF(btrim(m->>'nomeComercial'), ''), NULLIF(btrim(m->>'principioAtivo'), '')) AS nome, count(*) n
          FROM f, jsonb_array_elements(f.meds) m
          GROUP BY 1 HAVING COALESCE(NULLIF(btrim(m->>'nomeComercial'), ''), NULLIF(btrim(m->>'principioAtivo'), '')) IS NOT NULL
          ORDER BY count(*) DESC, 1 LIMIT 8
        ) q), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_infografico_anual_maternidade(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_infografico_anual_maternidade(uuid, int) TO authenticated;

-- ───────────────────────────── Manejo de Pastagens ─────────────────────────────
-- Movimentações = trocas de pasto (registros_pastagens). Ocupação = lote_pasto_historico recortada no ano:
-- cada ocupação é distribuída pelos meses em que esteve no pasto (dias-pasto = dias corridos, inclusive),
-- então um período que começou em dezembro do ano anterior só conta a parte de janeiro em diante.
-- UA/ha do ano e do mês = média ponderada pelos dias-pasto (nunca média das médias).
CREATE OR REPLACE FUNCTION public.get_infografico_anual_pastagens(p_fazenda_id uuid, p_ano int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_ini date; v_fim date; v_ult int; v_res jsonb;
BEGIN
  IF p_ano IS NULL OR p_ano < 2020 OR p_ano > extract(year FROM now())::int THEN
    RAISE EXCEPTION 'Ano inválido';
  END IF;
  SELECT data_inicio, data_fim, ultimo_mes INTO v_ini, v_fim, v_ult FROM public._infografico_anual_periodo(p_ano);
  v_res := public.get_dados_relatorio_pastagens_fazenda(p_fazenda_id, v_ini, v_fim);

  RETURN (
    WITH reg AS (
      SELECT extract(month FROM (x->>'data')::date)::int AS mes,
             NULLIF(btrim(COALESCE(x->>'lote', '')), '') AS lote,
             NULLIF(btrim(COALESCE(x->>'pasto_entrada', '')), '') AS pasto_entrada,
             COALESCE(NULLIF(x->>'total_animais', '')::numeric, 0) AS animais
      FROM jsonb_array_elements(COALESCE(v_res->'dados'->'registros', '[]'::jsonb)) x
    ),
    oc AS (
      SELECT t.n,
             NULLIF(btrim(COALESCE(t.x->>'lote', '')), '') AS lote,
             COALESCE(NULLIF(btrim(COALESCE(t.x->>'pasto', '')), ''), 'Sem pasto') AS pasto,
             NULLIF(btrim(COALESCE(t.x->>'modulo', '')), '') AS modulo,
             (t.x->>'data_entrada')::date AS ent,
             COALESCE(NULLIF(t.x->>'data_saida', '')::date, v_fim) AS sai,
             NULLIF(t.x->>'taxa_lotacao_ua_ha', '')::numeric AS ua,
             NULLIF(t.x->>'desvio_percent', '')::numeric AS desvio,
             COALESCE((t.x->>'em_andamento')::boolean, false) AS aberta
      FROM jsonb_array_elements(COALESCE(v_res->'dados'->'ocupacoes', '[]'::jsonb)) WITH ORDINALITY AS t(x, n)
    ),
    meses AS (SELECT generate_series(1, v_ult) AS mes),
    ocm AS (
      SELECT oc.*, m.mes,
             GREATEST(0, LEAST(oc.sai, (make_date(p_ano, m.mes, 1) + interval '1 month' - interval '1 day')::date, v_fim)
                         - GREATEST(oc.ent, make_date(p_ano, m.mes, 1)) + 1) AS dias
      FROM oc CROSS JOIN meses m
    ),
    ocd AS (SELECT * FROM ocm WHERE dias > 0),
    pi AS (
      SELECT p FROM jsonb_array_elements(COALESCE(v_res->'dados'->'pastos_info', '[]'::jsonb)) p
    )
    SELECT jsonb_build_object(
      'ano', p_ano, 'ultimo_mes', v_ult,
      'kpis', jsonb_build_object(
        'movimentacoes', (SELECT count(*) FROM reg),
        'cabecas_movimentadas', (SELECT COALESCE(sum(animais), 0) FROM reg),
        'lotes', (SELECT count(DISTINCT lote) FROM ocd),
        'pastos_ocupados', (SELECT count(DISTINCT pasto) FROM ocd),
        'dias_pasto', (SELECT COALESCE(sum(dias), 0) FROM ocd),
        'ua_ha_medio', (SELECT round(sum(ua * dias) / NULLIF(sum(dias) FILTER (WHERE ua IS NOT NULL), 0), 2) FROM ocd),
        'ocupacoes_concluidas', (SELECT count(DISTINCT n) FROM ocd WHERE NOT aberta),
        'ocupacoes_acima_meta', (SELECT count(DISTINCT n) FROM ocd WHERE NOT aberta AND desvio > 0),
        'desvio_medio_percent', (SELECT round(avg(d), 1) FROM (SELECT DISTINCT ON (n) n, desvio AS d FROM ocd WHERE NOT aberta AND desvio IS NOT NULL) q),
        'pastos_cadastrados', (SELECT count(*) FROM pi),
        'area_total_ha', (SELECT COALESCE(sum(NULLIF(p->>'area_util_ha', '')::numeric), 0) FROM pi)
      ),
      'mensal', (
        SELECT jsonb_agg(jsonb_build_object(
          'mes', meses.mes,
          'movimentacoes', (SELECT count(*) FROM reg WHERE reg.mes = meses.mes),
          'cabecas', (SELECT COALESCE(sum(animais), 0) FROM reg WHERE reg.mes = meses.mes),
          'dias_pasto', (SELECT COALESCE(sum(dias), 0) FROM ocd WHERE ocd.mes = meses.mes),
          'ua_ha', (SELECT round(sum(ua * dias) / NULLIF(sum(dias) FILTER (WHERE ua IS NOT NULL), 0), 2) FROM ocd WHERE ocd.mes = meses.mes),
          'lotes', (SELECT count(DISTINCT lote) FROM ocd WHERE ocd.mes = meses.mes),
          'pastos', (SELECT count(DISTINCT pasto) FROM ocd WHERE ocd.mes = meses.mes)
        ) ORDER BY meses.mes) FROM meses
      ),
      'por_pasto', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', pasto, 'modulo', modulo, 'dias', dias, 'ocupacoes', ocup, 'ua_ha', ua_ha) ORDER BY dias DESC)
        FROM (
          SELECT pasto, max(modulo) AS modulo, sum(dias) AS dias, count(DISTINCT n) AS ocup,
                 round(sum(ua * dias) / NULLIF(sum(dias) FILTER (WHERE ua IS NOT NULL), 0), 2) AS ua_ha
          FROM ocd GROUP BY pasto ORDER BY sum(dias) DESC LIMIT 10
        ) q), '[]'::jsonb),
      'por_lote', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', COALESCE(lote, 'Sem lote'), 'dias', dias, 'pastos', pastos) ORDER BY dias DESC)
        FROM (SELECT lote, sum(dias) AS dias, count(DISTINCT pasto) AS pastos FROM ocd GROUP BY lote ORDER BY sum(dias) DESC LIMIT 10) q), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_infografico_anual_pastagens(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_infografico_anual_pastagens(uuid, int) TO authenticated;
