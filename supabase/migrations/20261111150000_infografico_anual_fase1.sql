-- Infográfico Anual, fase 1: Combustível, Consumo, Clima, Mortes e Rodeio.
-- Cada RPC chama a RPC _fazenda do relatório mensal para o ano civil inteiro
-- (mesmas regras de cálculo, mesmo controle de acesso via user_has_fazenda_access)
-- e devolve só agregados: 12 pontos por série + totais do ano + rankings top N.
-- Nenhum registro diário sai do banco. No ano corrente o período vai até hoje (Cuiabá).
-- Não são STABLE: as _fazenda gravam/apagam um token temporário em relatorios_publicos.

CREATE OR REPLACE FUNCTION public._infografico_anual_periodo(p_ano int)
RETURNS TABLE (data_inicio date, data_fim date, ultimo_mes int)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT make_date(p_ano, 1, 1),
         LEAST(make_date(p_ano, 12, 31), (now() AT TIME ZONE 'America/Cuiaba')::date),
         CASE WHEN p_ano < extract(year FROM (now() AT TIME ZONE 'America/Cuiaba'))::int THEN 12
              ELSE extract(month FROM (now() AT TIME ZONE 'America/Cuiaba'))::int END
$$;

-- ───────────────────────────── Combustível ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_infografico_anual_combustivel(p_fazenda_id uuid, p_ano int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_ini date; v_fim date; v_ult int;
  v_ab jsonb; v_est jsonb; v_regs jsonb; v_movs jsonb;
BEGIN
  IF p_ano IS NULL OR p_ano < 2020 OR p_ano > extract(year FROM now())::int THEN
    RAISE EXCEPTION 'Ano inválido';
  END IF;
  SELECT data_inicio, data_fim, ultimo_mes INTO v_ini, v_fim, v_ult FROM public._infografico_anual_periodo(p_ano);
  v_ab  := public.get_dados_relatorio_abastecimento_fazenda(p_fazenda_id, v_ini, v_fim);
  v_est := public.get_dados_relatorio_estoque_combustivel_fazenda(p_fazenda_id, v_ini, v_fim);
  v_regs := COALESCE(v_ab->'dados'->'registros', '[]'::jsonb);
  v_movs := COALESCE(v_est->'dados'->'movimentacoes', '[]'::jsonb);

  RETURN (
    WITH r AS (
      SELECT extract(month FROM (x->>'data')::date)::int AS mes,
             COALESCE(x->>'combustivel', 'Não informado') AS combustivel,
             COALESCE(x->>'maquina', 'Não informado') AS maquina,
             COALESCE(x->>'operacao', 'Não informado') AS operacao,
             COALESCE((x->>'litros')::numeric, 0) AS litros,
             (x->>'trabalho_periodo')::numeric AS trabalho,
             x->>'unidade_trabalho' AS unidade
      FROM jsonb_array_elements(v_regs) x
    ),
    m AS (
      SELECT extract(month FROM (x->>'data')::date)::int AS mes, x->>'tipo' AS tipo,
             COALESCE((x->>'quantidade_l')::numeric, 0) AS litros, COALESCE((x->>'valor')::numeric, 0) AS valor
      FROM jsonb_array_elements(v_movs) x
    ),
    meses AS (SELECT generate_series(1, v_ult) AS mes),
    maq AS (
      SELECT maquina, sum(litros) litros, count(*) n, max(unidade) unidade,
             sum(trabalho) FILTER (WHERE trabalho > 0) trabalho
      FROM r GROUP BY maquina
    )
    SELECT jsonb_build_object(
      'ano', p_ano, 'ultimo_mes', v_ult,
      'kpis', jsonb_build_object(
        'litros', (SELECT COALESCE(sum(litros), 0) FROM r),
        'abastecimentos', (SELECT count(*) FROM r),
        'maquinas', (SELECT count(DISTINCT maquina) FROM r),
        'entradas_l', (SELECT COALESCE(sum(litros), 0) FROM m WHERE tipo = 'entrada'),
        'entradas_valor', (SELECT COALESCE(sum(valor), 0) FROM m WHERE tipo = 'entrada'),
        'saldo_inicial_l', (SELECT COALESCE(sum((t->>'saldo_inicial_l')::numeric), 0) FROM jsonb_array_elements(COALESCE(v_est->'dados'->'tanques', '[]'::jsonb)) t),
        'saldo_final_l', (SELECT COALESCE(sum((t->>'saldo_final_l')::numeric), 0) FROM jsonb_array_elements(COALESCE(v_est->'dados'->'tanques', '[]'::jsonb)) t)
      ),
      'mensal', (
        SELECT jsonb_agg(jsonb_build_object(
          'mes', meses.mes,
          'litros', COALESCE((SELECT sum(litros) FROM r WHERE r.mes = meses.mes), 0),
          'abastecimentos', (SELECT count(*) FROM r WHERE r.mes = meses.mes),
          'por_combustivel', COALESCE((SELECT jsonb_object_agg(combustivel, l) FROM (SELECT combustivel, sum(litros) l FROM r WHERE r.mes = meses.mes GROUP BY 1) c), '{}'::jsonb),
          'entradas_l', COALESCE((SELECT sum(litros) FROM m WHERE m.mes = meses.mes AND tipo = 'entrada'), 0),
          'baixas_l', COALESCE((SELECT sum(litros) FROM m WHERE m.mes = meses.mes AND tipo = 'baixa'), 0)
        ) ORDER BY meses.mes) FROM meses
      ),
      'combustiveis', COALESCE((SELECT jsonb_agg(DISTINCT combustivel) FROM r), '[]'::jsonb),
      'por_maquina', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', maquina, 'litros', litros, 'abastecimentos', n, 'unidade', unidade,
               'consumo_medio', CASE WHEN trabalho > 0 THEN round(litros / trabalho, 2) END) ORDER BY litros DESC)
        FROM (SELECT * FROM maq ORDER BY litros DESC LIMIT 10) t), '[]'::jsonb),
      'maquinas_demais', (SELECT jsonb_build_object('qtd', count(*), 'litros', COALESCE(sum(litros), 0)) FROM (SELECT litros FROM maq ORDER BY litros DESC OFFSET 10) t),
      'por_operacao', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', operacao, 'valor', l) ORDER BY l DESC) FROM (SELECT operacao, sum(litros) l FROM r GROUP BY 1) o), '[]'::jsonb),
      'tanques', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('nome', t->>'nome', 'combustivel', t->>'combustivel',
               'saldo_inicial_l', t->'saldo_inicial_l', 'entradas_l', t->'entradas_l', 'baixas_l', t->'baixas_l',
               'ajustes_l', t->'ajustes_l', 'saldo_final_l', t->'saldo_final_l'))
        FROM jsonb_array_elements(COALESCE(v_est->'dados'->'tanques', '[]'::jsonb)) t), '[]'::jsonb)
    )
  );
END;
$$;

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
      WHERE COALESCE(jsonb_array_length(l->'info'->'erro'), 0) = 0
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

-- ───────────────────────────── Clima ─────────────────────────────
-- Mesmas regras de RelatorioClimaPublico.tsx: chuva da fazenda = média dos pluviômetros
-- (cada um é uma região); forte >= 25 mm e torrencial >= 50 mm pelo maior total do dia numa região.
CREATE OR REPLACE FUNCTION public.get_infografico_anual_clima(p_fazenda_id uuid, p_ano int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_ini date; v_fim date; v_ult int; v_res jsonb;
BEGIN
  IF p_ano IS NULL OR p_ano < 2020 OR p_ano > extract(year FROM now())::int THEN
    RAISE EXCEPTION 'Ano inválido';
  END IF;
  SELECT data_inicio, data_fim, ultimo_mes INTO v_ini, v_fim, v_ult FROM public._infografico_anual_periodo(p_ano);
  v_res := public.get_dados_relatorio_clima_fazenda(p_fazenda_id, v_ini, v_fim);

  RETURN (
    WITH r AS (
      SELECT (x->>'data')::date AS dia, extract(month FROM (x->>'data')::date)::int AS mes,
             COALESCE(x->>'pluviometro_id', x->>'pluviometro_nome', '—') AS pid,
             COALESCE(x->>'pluviometro_nome', '—') AS nome,
             COALESCE((x->>'medicao_mm')::numeric, 0) AS mm,
             (x->>'temperatura')::numeric AS temp,
             (x->>'umidade_relativa')::numeric AS umid
      FROM jsonb_array_elements(COALESCE(v_res->'dados'->'registros', '[]'::jsonb)) x
    ),
    np AS (SELECT GREATEST(count(DISTINCT pid), 1) n FROM r),
    dia_reg AS (SELECT dia, mes, pid, sum(mm) mm FROM r GROUP BY 1, 2, 3),
    dia AS (SELECT dia, mes, sum(mm) soma, max(mm) maior FROM dia_reg GROUP BY 1, 2),
    meses AS (SELECT generate_series(1, v_ult) AS mes),
    pm AS (
      SELECT meses.mes, pl.pid, COALESCE((SELECT sum(mm) FROM r WHERE r.mes = meses.mes AND r.pid = pl.pid), 0) mm
      FROM meses CROSS JOIN (SELECT DISTINCT pid FROM r) pl
    )
    SELECT jsonb_build_object(
      'ano', p_ano, 'ultimo_mes', v_ult,
      'kpis', jsonb_build_object(
        'mm_total', (SELECT round(COALESCE(sum(mm), 0) / (SELECT n FROM np), 1) FROM r),
        'pluviometros', (SELECT count(DISTINCT pid) FROM r),
        'dias_com_chuva', (SELECT count(*) FROM dia WHERE soma > 0),
        'dias_forte', (SELECT count(*) FROM dia WHERE maior >= 25 AND maior < 50),
        'dias_torrencial', (SELECT count(*) FROM dia WHERE maior >= 50),
        'maior_dia_mm', (SELECT round(max(maior), 1) FROM dia),
        'mes_mais_chuvoso', (SELECT mes FROM (SELECT mes, sum(mm) s FROM r GROUP BY mes) t ORDER BY s DESC LIMIT 1),
        'temp_media', (SELECT round(avg(temp), 1) FROM r),
        'temp_min', (SELECT min(temp) FROM r),
        'temp_max', (SELECT max(temp) FROM r),
        'umidade_media', (SELECT round(avg(umid), 1) FROM r)
      ),
      'mensal', (
        SELECT jsonb_agg(jsonb_build_object(
          'mes', meses.mes,
          'mm_fazenda', round(COALESCE((SELECT sum(mm) FROM r WHERE r.mes = meses.mes), 0) / (SELECT n FROM np), 1),
          'mm_min', (SELECT round(min(mm), 1) FROM pm WHERE pm.mes = meses.mes),
          'mm_max', (SELECT round(max(mm), 1) FROM pm WHERE pm.mes = meses.mes),
          'dias_chuva', (SELECT count(*) FROM dia WHERE dia.mes = meses.mes AND soma > 0),
          'dias_forte', (SELECT count(*) FROM dia WHERE dia.mes = meses.mes AND maior >= 25 AND maior < 50),
          'dias_torrencial', (SELECT count(*) FROM dia WHERE dia.mes = meses.mes AND maior >= 50),
          'temp_media', (SELECT round(avg(temp), 1) FROM r WHERE r.mes = meses.mes),
          'umidade_media', (SELECT round(avg(umid), 1) FROM r WHERE r.mes = meses.mes)
        ) ORDER BY meses.mes) FROM meses
      ),
      'por_pluviometro', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('nome', nome, 'mm_total', round(mm, 1), 'leituras', n, 'maior_leitura', round(maior, 1)) ORDER BY mm DESC)
        FROM (SELECT max(nome) nome, sum(mm) mm, count(*) n, max(mm) maior FROM r GROUP BY pid) t), '[]'::jsonb)
    )
  );
END;
$$;

-- ───────────────────────────── Mortes ─────────────────────────────
-- Taxa do ano = mortes do ano / rebanho da RPC mensal (mesmo denominador do PDF mensal).
-- Perda estimada: peso vivo × preço/kg da categoria (precos_categorias, com os mesmos padrões do loader do front).
CREATE OR REPLACE FUNCTION public.get_infografico_anual_morte(p_fazenda_id uuid, p_ano int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_ini date; v_fim date; v_ult int; v_res jsonb; v_rebanho numeric;
BEGIN
  IF p_ano IS NULL OR p_ano < 2020 OR p_ano > extract(year FROM now())::int THEN
    RAISE EXCEPTION 'Ano inválido';
  END IF;
  SELECT data_inicio, data_fim, ultimo_mes INTO v_ini, v_fim, v_ult FROM public._infografico_anual_periodo(p_ano);
  v_res := public.get_dados_relatorio_morte_fazenda(p_fazenda_id, v_ini, v_fim);
  v_rebanho := NULLIF((v_res->'dados'->>'rebanho_total')::numeric, 0);

  RETURN (
    WITH padrao(categoria, preco) AS (
      VALUES ('Bezerro', 12::numeric), ('Bezerra', 11.5), ('Novilha', 11), ('Garrote', 9.5),
             ('Boi Magro', 10), ('Boi Gordo', 11.67), ('Vaca', 10.83), ('Touro', 15)
    ),
    l AS (
      SELECT extract(month FROM (x->>'data')::date)::int AS mes,
             COALESCE(NULLIF(x->>'causa_morte', ''), 'Não informada') AS causa,
             COALESCE(NULLIF(x->>'categoria', ''), 'Não informada') AS categoria,
             (x->>'peso_vivo')::numeric AS peso
      FROM jsonb_array_elements(COALESCE(v_res->'dados'->'linhas', '[]'::jsonb)) x
    ),
    lp AS (
      SELECT l.*, l.peso * COALESCE(pc.preco_kg, pd.preco, 10) AS perda
      FROM l
      LEFT JOIN precos_categorias pc ON pc.fazenda_id = p_fazenda_id AND pc.categoria = l.categoria
      LEFT JOIN padrao pd ON pd.categoria = l.categoria
    ),
    meses AS (SELECT generate_series(1, v_ult) AS mes)
    SELECT jsonb_build_object(
      'ano', p_ano, 'ultimo_mes', v_ult,
      'kpis', jsonb_build_object(
        'mortes', (SELECT count(*) FROM lp),
        'rebanho', v_rebanho,
        'taxa_mortalidade', CASE WHEN v_rebanho IS NOT NULL THEN round((SELECT count(*) FROM lp) / v_rebanho * 100, 2) END,
        'peso_total', (SELECT round(COALESCE(sum(peso), 0), 0) FROM lp),
        'perda_estimada', (SELECT round(COALESCE(sum(perda), 0), 2) FROM lp),
        'causa_principal', (SELECT causa FROM lp GROUP BY causa ORDER BY count(*) DESC, causa LIMIT 1)
      ),
      'mensal', (
        SELECT jsonb_agg(jsonb_build_object(
          'mes', meses.mes,
          'mortes', (SELECT count(*) FROM lp WHERE lp.mes = meses.mes),
          'perda', (SELECT round(COALESCE(sum(perda), 0), 2) FROM lp WHERE lp.mes = meses.mes)
        ) ORDER BY meses.mes) FROM meses
      ),
      'por_causa', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', causa, 'valor', n) ORDER BY n DESC, causa) FROM (SELECT causa, count(*) n FROM lp GROUP BY 1) t), '[]'::jsonb),
      'por_categoria', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', categoria, 'valor', n, 'perda', round(perda, 2)) ORDER BY n DESC, categoria) FROM (SELECT categoria, count(*) n, COALESCE(sum(perda), 0) perda FROM lp GROUP BY 1) t), '[]'::jsonb),
      'matriz', COALESCE((SELECT jsonb_agg(jsonb_build_object('causa', causa, 'categoria', categoria, 'valor', n)) FROM (SELECT causa, categoria, count(*) n FROM lp GROUP BY 1, 2) t), '[]'::jsonb)
    )
  );
END;
$$;

-- ───────────────────────────── Rodeio ─────────────────────────────
-- Classificação dos diagnósticos igual a features/relatorioRodeio/agregacao.ts (DIAGNOSTICOS_RODEIO):
-- itens "inverted" (sanitários) alertam com 'S'; os demais (infraestrutura) alertam com 'N'.
CREATE OR REPLACE FUNCTION public.get_infografico_anual_rodeio(p_fazenda_id uuid, p_ano int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_ini date; v_fim date; v_ult int; v_res jsonb;
BEGIN
  IF p_ano IS NULL OR p_ano < 2020 OR p_ano > extract(year FROM now())::int THEN
    RAISE EXCEPTION 'Ano inválido';
  END IF;
  SELECT data_inicio, data_fim, ultimo_mes INTO v_ini, v_fim, v_ult FROM public._infografico_anual_periodo(p_ano);
  v_res := public.get_dados_relatorio_rodeio_fazenda(p_fazenda_id, v_ini, v_fim);

  RETURN (
    WITH diag(chave, label, sanitario) AS (
      VALUES ('bebedourosCochos', 'Bebedouros/Cochos', false),
             ('pastagensTaxaLotacao', 'Pastagens/Taxa de lotação', false),
             ('cercasCochosPorteiras', 'Cercas/Cochos/Porteiras', false),
             ('animaisMachucadosDoentesBichados', 'Animais machucados/doentes/bichados', true),
             ('carrapatosMoscas', 'Carrapatos/Moscas', true),
             ('animaisEntreverados', 'Animais entreverados', true),
             ('animalMorto', 'Animal morto', true)
    ),
    r AS (
      SELECT x->>'registro_id' AS id, extract(month FROM (x->>'data')::date)::int AS mes,
             COALESCE(NULLIF(x->>'pasto', ''), 'Sem identificação') AS pasto,
             COALESCE(NULLIF(x->>'lote', ''), 'Sem identificação') AS lote,
             (x->>'total_cabecas')::numeric AS cabecas,
             (x->>'escore_gado')::numeric AS escore_gado,
             (x->>'escore_fezes')::numeric AS escore_fezes,
             (x->>'meta_intervalo_dias')::int AS meta, (x->>'dias_desde_anterior')::int AS gap,
             x->'diagnosticos' AS diagnosticos
      FROM jsonb_array_elements(COALESCE(v_res->'dados'->'registros', '[]'::jsonb)) x
    ),
    a AS (
      SELECT r.id, r.mes, r.pasto, r.lote, d.label, d.sanitario
      FROM r JOIN diag d ON (CASE WHEN d.sanitario THEN r.diagnosticos->d.chave->>'valor' = 'S'
                                  ELSE r.diagnosticos->d.chave->>'valor' = 'N' END)
    ),
    meses AS (SELECT generate_series(1, v_ult) AS mes),
    local_rank AS (
      SELECT 'pasto' tipo, pasto nome, count(DISTINCT r.id) rodeios, (SELECT count(*) FROM a WHERE a.pasto = r.pasto) alertas, round(avg(escore_gado), 2) escore FROM r GROUP BY pasto
      UNION ALL
      SELECT 'lote', lote, count(DISTINCT r.id), (SELECT count(*) FROM a WHERE a.lote = r.lote), round(avg(escore_gado), 2) FROM r GROUP BY lote
    )
    SELECT jsonb_build_object(
      'ano', p_ano, 'ultimo_mes', v_ult,
      'kpis', jsonb_build_object(
        'rodeios', (SELECT count(*) FROM r),
        'lotes', (SELECT count(DISTINCT lote) FROM r),
        'pastos', (SELECT count(DISTINCT pasto) FROM r),
        'cabecas_media', (SELECT round(avg(cabecas), 0) FROM r),
        'escore_gado_medio', (SELECT round(avg(escore_gado), 2) FROM r),
        'escore_fezes_medio', (SELECT round(avg(escore_fezes), 2) FROM r),
        'rodeios_com_alerta', (SELECT count(DISTINCT id) FROM a),
        'pct_rodeios_com_alerta', (SELECT CASE WHEN count(*) > 0 THEN round((SELECT count(DISTINCT id) FROM a)::numeric / count(*) * 100, 1) END FROM r),
        'alertas_sanitarios', (SELECT count(*) FROM a WHERE sanitario),
        'pendencias_infra', (SELECT count(*) FROM a WHERE NOT sanitario),
        'rodeios_com_meta', (SELECT count(*) FROM r WHERE meta > 0),
        'dentro_meta', (SELECT count(*) FROM r WHERE meta > 0 AND gap IS NOT NULL AND gap <= meta),
        'fora_meta', (SELECT count(*) FROM r WHERE meta > 0 AND gap IS NOT NULL AND gap > meta)
      ),
      'mensal', (
        SELECT jsonb_agg(jsonb_build_object(
          'mes', meses.mes,
          'rodeios', (SELECT count(*) FROM r WHERE r.mes = meses.mes),
          'alertas_sanitarios', (SELECT count(*) FROM a WHERE a.mes = meses.mes AND sanitario),
          'pendencias_infra', (SELECT count(*) FROM a WHERE a.mes = meses.mes AND NOT sanitario),
          'escore_gado', (SELECT round(avg(escore_gado), 2) FROM r WHERE r.mes = meses.mes),
          'escore_fezes', (SELECT round(avg(escore_fezes), 2) FROM r WHERE r.mes = meses.mes)
        ) ORDER BY meses.mes) FROM meses
      ),
      'por_diagnostico', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'valor', n, 'sanitario', sanitario) ORDER BY n DESC, label) FROM (SELECT label, sanitario, count(*) n FROM a GROUP BY 1, 2) t), '[]'::jsonb),
      'por_pasto', COALESCE((SELECT jsonb_agg(jsonb_build_object('nome', nome, 'rodeios', rodeios, 'alertas', alertas, 'escore', escore) ORDER BY alertas DESC, rodeios DESC, nome) FROM (SELECT * FROM local_rank WHERE tipo = 'pasto' ORDER BY alertas DESC, rodeios DESC, nome LIMIT 10) t), '[]'::jsonb),
      'por_lote', COALESCE((SELECT jsonb_agg(jsonb_build_object('nome', nome, 'rodeios', rodeios, 'alertas', alertas, 'escore', escore) ORDER BY alertas DESC, rodeios DESC, nome) FROM (SELECT * FROM local_rank WHERE tipo = 'lote' ORDER BY alertas DESC, rodeios DESC, nome LIMIT 10) t), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public._infografico_anual_periodo(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_infografico_anual_combustivel(uuid, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_infografico_anual_consumo(uuid, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_infografico_anual_clima(uuid, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_infografico_anual_morte(uuid, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_infografico_anual_rodeio(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._infografico_anual_periodo(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_infografico_anual_combustivel(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_infografico_anual_consumo(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_infografico_anual_clima(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_infografico_anual_morte(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_infografico_anual_rodeio(uuid, int) TO authenticated;
