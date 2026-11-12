-- Infográfico Anual: correções da fase 1.
-- 1) get_infografico_anual_consumo: a RPC mensal devolve info.erro como JSON null (escalar) quando o lote
--    não tem pendência, e jsonb_array_length(null JSON) falha com 22023. Mesmo filtro do loader do front.
-- 2) Mortes: categoria comparada pela forma normalizada (preço e agrupamento) e taxa de mortalidade
--    sobre o rebanho médio do ano (retrato mensal em rebanho_mensal ou estimativa pelo histórico).

-- ───────────────────────────── Consumo ─────────────────────────────
-- A RPC mensal entrega pontos diários por lote, por cabeça/dia (sem nº de cabeças do dia).
-- Os índices do ano são médias sobre os lote-dias com trato do ano inteiro (não média das médias mensais).
CREATE OR REPLACE FUNCTION public.get_infografico_anual_consumo(p_fazenda_id uuid, p_ano int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_ini date; v_fim date; v_ult int; v_res jsonb;
BEGIN
  IF p_ano IS NULL OR p_ano < 2020 OR p_ano > extract(year FROM now())::int THEN
    RAISE EXCEPTION 'Ano inválido';
  END IF;
  SELECT data_inicio, data_fim, ultimo_mes INTO v_ini, v_fim, v_ult FROM public._infografico_anual_periodo(p_ano);
  v_res := public.get_dados_relatorio_consumo_fazenda(p_fazenda_id, v_ini, v_fim);

  RETURN (
    WITH p AS (
      SELECT l->'info'->>'lote_nome' AS lote,
             CASE WHEN d->>'origem' = 'confinamento' THEN 'confinamento' ELSE 'pasto' END AS manejo,
             extract(month FROM left(d->>'data', 10)::date)::int AS mes,
             (d->>'trato_kg_cab_dia')::numeric AS mn,
             (d->>'trato_kg_ms_cab_dia')::numeric AS ms,
             (d->>'consumo_percent_pv')::numeric AS pv,
             (d->>'leitura_cocho')::numeric AS cocho,
             (d->>'custo_reais_cab_dia')::numeric AS custo
      FROM jsonb_array_elements(COALESCE(v_res->'dados'->'lotes', '[]'::jsonb)) l,
           jsonb_array_elements(COALESCE(l->'dados', '[]'::jsonb)) d
      WHERE CASE WHEN jsonb_typeof(l->'info'->'erro') = 'array' THEN jsonb_array_length(l->'info'->'erro') ELSE 0 END = 0
    ),
    meses AS (SELECT generate_series(1, v_ult) AS mes),
    lt AS (
      SELECT lote, max(manejo) manejo, count(*) dias, avg(mn) mn, avg(ms) ms, avg(pv) pv, avg(custo) custo, avg(cocho) cocho
      FROM p GROUP BY lote
    )
    SELECT jsonb_build_object(
      'ano', p_ano, 'ultimo_mes', v_ult,
      'kpis', jsonb_build_object(
        'lotes', (SELECT count(DISTINCT lote) FROM p),
        'lote_dias', (SELECT count(*) FROM p),
        'mn_kg_cab_dia', (SELECT round(avg(mn), 2) FROM p),
        'ms_kg_cab_dia', (SELECT round(avg(ms), 2) FROM p),
        'pct_pv', (SELECT round(avg(pv), 2) FROM p),
        'custo_cab_dia', (SELECT round(avg(custo), 2) FROM p),
        'leitura_cocho', (SELECT round(avg(cocho), 2) FROM p)
      ),
      'mensal', (
        SELECT jsonb_agg(jsonb_build_object(
          'mes', meses.mes,
          'lote_dias', (SELECT count(*) FROM p WHERE p.mes = meses.mes),
          'pasto', (SELECT jsonb_build_object('mn', round(avg(mn), 2), 'ms', round(avg(ms), 2), 'pv', round(avg(pv), 2), 'custo', round(avg(custo), 2), 'lote_dias', count(*)) FROM p WHERE p.mes = meses.mes AND manejo = 'pasto'),
          'confinamento', (SELECT jsonb_build_object('mn', round(avg(mn), 2), 'ms', round(avg(ms), 2), 'pv', round(avg(pv), 2), 'custo', round(avg(custo), 2), 'lote_dias', count(*)) FROM p WHERE p.mes = meses.mes AND manejo = 'confinamento')
        ) ORDER BY meses.mes) FROM meses
      ),
      'por_lote', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('lote', lote, 'manejo', manejo, 'dias', dias, 'mn', round(mn, 2), 'ms', round(ms, 2),
               'pv', round(pv, 2), 'custo', round(custo, 2), 'cocho', round(cocho, 2)) ORDER BY dias DESC, lote)
        FROM (SELECT * FROM lt ORDER BY dias DESC, lote LIMIT 15) t), '[]'::jsonb),
      'lotes_demais', (SELECT count(*) FROM (SELECT 1 FROM lt ORDER BY dias DESC, lote OFFSET 15) t)
    )
  );
END;
$$;

-- ═══════════════════ Categorias de mortalidade: comparação normalizada ═══════════════════
-- O PWA grava "bezerro", "Bezerro", "boi gordo"; precos_categorias usa "Bezerro", "Boi Gordo".
-- Mesmas regras de apps/manejus/src/features/relatorioMorte/categorias.ts.
CREATE OR REPLACE FUNCTION public._categoria_norm(p text)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public'
AS $$ SELECT NULLIF(trim(regexp_replace(lower(public.unaccent(COALESCE(p, ''))), '\s+', ' ', 'g')), '') $$;

CREATE OR REPLACE FUNCTION public._categoria_rotulo(p text)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT CASE public._categoria_norm(p)
    WHEN 'bezerro' THEN 'Bezerro' WHEN 'bezerra' THEN 'Bezerra'
    WHEN 'bezerro ao pe' THEN 'Bezerro ao pé' WHEN 'bezerra ao pe' THEN 'Bezerra ao pé'
    WHEN 'novilha' THEN 'Novilha' WHEN 'garrote' THEN 'Garrote'
    WHEN 'boi magro' THEN 'Boi Magro' WHEN 'boi gordo' THEN 'Boi Gordo'
    WHEN 'vaca' THEN 'Vaca' WHEN 'touro' THEN 'Touro'
    ELSE CASE WHEN public._categoria_norm(p) IS NULL THEN NULL
              ELSE upper(left(trim(regexp_replace(p, '\s+', ' ', 'g')), 1)) || substr(trim(regexp_replace(p, '\s+', ' ', 'g')), 2) END
  END
$$;

-- Não há cotação de bezerro(a) ao pé (nem em precos_categorias nem no preço de entrada dos lotes): vale a de bezerro(a).
CREATE OR REPLACE FUNCTION public._categoria_chave_preco(p text)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT CASE public._categoria_norm(p) WHEN 'bezerro ao pe' THEN 'bezerro' WHEN 'bezerra ao pe' THEN 'bezerra'
         ELSE public._categoria_norm(p) END
$$;

-- ═══════════════════ Rebanho por mês ═══════════════════
-- Retrato do rebanho (soma de quant_atual das categorias ativas) no 1º dia de cada mês, gravado pelo cron.
CREATE TABLE IF NOT EXISTS public.rebanho_mensal (
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  mes date NOT NULL CHECK (extract(day FROM mes) = 1),
  cabecas integer NOT NULL,
  registrado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fazenda_id, mes)
);
COMMENT ON TABLE public.rebanho_mensal IS 'Rebanho de cada fazenda no início de cada mês (cron registrar_rebanho_mensal). Base da taxa de mortalidade do Infográfico Anual; meses sem retrato usam _rebanho_estimado.';
ALTER TABLE public.rebanho_mensal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rebanho_mensal_select ON public.rebanho_mensal;
CREATE POLICY rebanho_mensal_select ON public.rebanho_mensal FOR SELECT TO authenticated
  USING (public.user_has_fazenda_access(fazenda_id));
REVOKE ALL ON public.rebanho_mensal FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.rebanho_mensal FROM authenticated;

CREATE OR REPLACE FUNCTION public.registrar_rebanho_mensal()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_mes date := date_trunc('month', now() AT TIME ZONE 'America/Cuiaba')::date;
  v_n integer;
BEGIN
  INSERT INTO public.rebanho_mensal (fazenda_id, mes, cabecas)
  SELECT l.fazenda_id, v_mes, COALESCE(sum(COALESCE(lc.quant_atual, 0)), 0)::int
  FROM public.lote_categorias lc JOIN public.lotes l ON l.id = lc.lote_id
  WHERE l.deleted_at IS NULL AND lc.ativo = true AND l.fazenda_id IS NOT NULL
  GROUP BY l.fazenda_id
  ON CONFLICT (fazenda_id, mes) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_rebanho_mensal() FROM PUBLIC, anon, authenticated;

-- Dia 1 às 00:05 de Cuiabá (04:05 UTC).
SELECT cron.unschedule('registrar_rebanho_mensal') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'registrar_rebanho_mensal');
SELECT cron.schedule('registrar_rebanho_mensal', '5 4 1 * *', 'SELECT public.registrar_rebanho_mensal();');

-- Rebanho estimado no início de p_dia: rebanho atual menos o saldo das movimentações externas a partir de p_dia.
-- Movimentações internas (apartação, novo lote, entrevero com destino) se anulam na fazenda e ficam de fora;
-- abate fica de fora como em calculate_quant_atual. É estimativa: lote cadastrado sem lançamento de entrada,
-- lote excluído sem saída ou lançamento errado deslocam o valor.
CREATE OR REPLACE FUNCTION public._rebanho_estimado(p_fazenda_id uuid, p_dia date)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH atual AS (
    SELECT COALESCE(sum(COALESCE(lc.quant_atual, 0)), 0) AS cab
    FROM lote_categorias lc JOIN lotes l ON l.id = lc.lote_id
    WHERE l.fazenda_id = p_fazenda_id AND l.deleted_at IS NULL AND lc.ativo = true
  ),
  ev AS (
    SELECT CASE
      WHEN motivo_movimentacao::text = 'Entrada' THEN numero_cabecas
      WHEN motivo_movimentacao::text = 'Transferencia' AND subtipo::text = 'Entrada' THEN numero_cabecas
      WHEN motivo_movimentacao::text = 'Transferencia' AND subtipo::text = 'Saida' THEN -numero_cabecas
      WHEN motivo_movimentacao::text = 'Ajuste' AND tipo_entrada::text = 'Ajuste' THEN numero_cabecas
      WHEN motivo_movimentacao::text = 'Ajuste' AND tipo_saida::text = 'Ajuste' THEN -numero_cabecas
      WHEN motivo_movimentacao::text IN ('Saída', 'Consumo', 'Doação', 'Entrevero') AND lote_destino_id IS NULL THEN -numero_cabecas
      ELSE 0 END AS delta
    FROM registros_movimentacao
    WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND (data AT TIME ZONE 'America/Cuiaba')::date >= p_dia
    UNION ALL
    SELECT 1 FROM registros_maternidade
    WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND (data AT TIME ZONE 'America/Cuiaba')::date >= p_dia
      AND (tipo_parto IS NULL OR NOT (tipo_parto ? 'Aborto' OR tipo_parto ? 'Natimorto'))
    UNION ALL
    SELECT -1 FROM registros_morte
    WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND (data AT TIME ZONE 'America/Cuiaba')::date >= p_dia
  )
  SELECT GREATEST(((SELECT cab FROM atual) - COALESCE((SELECT sum(delta) FROM ev), 0))::int, 0)
$$;
REVOKE ALL ON FUNCTION public._rebanho_estimado(uuid, date) FROM PUBLIC, anon, authenticated;

-- ═══════════════════ Mortes anual (nova versão) ═══════════════════
-- Taxa do ano = mortes do ano / rebanho médio do ano (média do rebanho no início de cada mês do período).
-- Rebanho do mês: retrato de rebanho_mensal quando existe; senão _rebanho_estimado (marcado como estimado).
-- Categorias agrupadas pelo rótulo normalizado; preço pela categoria normalizada (ao pé = bezerro(a)).
CREATE OR REPLACE FUNCTION public.get_infografico_anual_morte(p_fazenda_id uuid, p_ano int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_ini date; v_fim date; v_ult int; v_res jsonb;
BEGIN
  IF p_ano IS NULL OR p_ano < 2020 OR p_ano > extract(year FROM now())::int THEN
    RAISE EXCEPTION 'Ano inválido';
  END IF;
  SELECT data_inicio, data_fim, ultimo_mes INTO v_ini, v_fim, v_ult FROM public._infografico_anual_periodo(p_ano);
  v_res := public.get_dados_relatorio_morte_fazenda(p_fazenda_id, v_ini, v_fim);

  RETURN (
    WITH padrao(categoria, preco) AS (
      VALUES ('bezerro', 12::numeric), ('bezerra', 11.5), ('novilha', 11), ('garrote', 9.5),
             ('boi magro', 10), ('boi gordo', 11.67), ('vaca', 10.83), ('touro', 15)
    ),
    l AS (
      SELECT extract(month FROM (x->>'data')::date)::int AS mes,
             COALESCE(NULLIF(trim(x->>'causa_morte'), ''), 'Não informada') AS causa,
             COALESCE(public._categoria_rotulo(x->>'categoria'), 'Não informada') AS categoria,
             public._categoria_chave_preco(x->>'categoria') AS chave_preco,
             (x->>'peso_vivo')::numeric AS peso
      FROM jsonb_array_elements(COALESCE(v_res->'dados'->'linhas', '[]'::jsonb)) x
    ),
    lp AS (
      SELECT l.*, l.peso * COALESCE(
        (SELECT pc.preco_kg FROM precos_categorias pc
          WHERE pc.fazenda_id = p_fazenda_id AND public._categoria_norm(pc.categoria) = l.chave_preco LIMIT 1),
        (SELECT pd.preco FROM padrao pd WHERE pd.categoria = l.chave_preco), 10) AS perda
      FROM l
    ),
    meses AS (
      SELECT g AS mes, make_date(p_ano, g, 1) AS inicio FROM generate_series(1, v_ult) g
    ),
    reb AS (
      SELECT meses.mes,
             COALESCE(rm.cabecas, public._rebanho_estimado(p_fazenda_id, meses.inicio)) AS cabecas,
             rm.cabecas IS NULL AS estimado
      FROM meses LEFT JOIN rebanho_mensal rm ON rm.fazenda_id = p_fazenda_id AND rm.mes = meses.inicio
    ),
    tot AS (SELECT count(*) AS mortes FROM lp),
    rmed AS (
      SELECT NULLIF(avg(cabecas), 0) AS medio, bool_or(estimado) AS algum_estimado,
             count(*) FILTER (WHERE estimado) AS meses_estimados
      FROM reb
    )
    SELECT jsonb_build_object(
      'ano', p_ano, 'ultimo_mes', v_ult,
      'kpis', jsonb_build_object(
        'mortes', (SELECT mortes FROM tot),
        'rebanho_medio', (SELECT round(medio, 0) FROM rmed),
        'rebanho_estimado', (SELECT algum_estimado FROM rmed),
        'meses_rebanho_estimado', (SELECT meses_estimados FROM rmed),
        'taxa_mortalidade', (SELECT CASE WHEN medio IS NOT NULL THEN round((SELECT mortes FROM tot) / medio * 100, 2) END FROM rmed),
        'peso_total', (SELECT round(COALESCE(sum(peso), 0), 0) FROM lp),
        'mortes_com_peso', (SELECT count(peso) FROM lp),
        'perda_estimada', (SELECT round(COALESCE(sum(perda), 0), 2) FROM lp),
        'causa_principal', (SELECT causa FROM lp GROUP BY causa ORDER BY count(*) DESC, causa LIMIT 1)
      ),
      'mensal', (
        SELECT jsonb_agg(jsonb_build_object(
          'mes', reb.mes,
          'mortes', (SELECT count(*) FROM lp WHERE lp.mes = reb.mes),
          'perda', (SELECT round(COALESCE(sum(perda), 0), 2) FROM lp WHERE lp.mes = reb.mes),
          'rebanho', reb.cabecas,
          'rebanho_estimado', reb.estimado,
          'taxa', CASE WHEN reb.cabecas > 0 THEN round((SELECT count(*) FROM lp WHERE lp.mes = reb.mes)::numeric / reb.cabecas * 100, 2) END
        ) ORDER BY reb.mes) FROM reb
      ),
      'por_causa', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', causa, 'valor', n) ORDER BY n DESC, causa) FROM (SELECT causa, count(*) AS n FROM lp GROUP BY 1) t), '[]'::jsonb),
      'por_categoria', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', categoria, 'valor', n, 'perda', round(perda, 2)) ORDER BY n DESC, categoria) FROM (SELECT categoria, count(*) AS n, COALESCE(sum(perda), 0) AS perda FROM lp GROUP BY 1) t), '[]'::jsonb),
      'matriz', COALESCE((SELECT jsonb_agg(jsonb_build_object('causa', causa, 'categoria', categoria, 'valor', n)) FROM (SELECT causa, categoria, count(*) AS n FROM lp GROUP BY 1, 2) t), '[]'::jsonb)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_infografico_anual_morte(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_infografico_anual_morte(uuid, int) TO authenticated;
