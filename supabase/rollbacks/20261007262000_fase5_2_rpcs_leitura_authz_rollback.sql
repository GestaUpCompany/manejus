-- ROLLBACK da Fase 5.2 (migration 20261007262000_fase5_2_rpcs_leitura_authz.sql)
-- NÃO fica em supabase/migrations/ de propósito. ATENÇÃO: reabre as 20 RPCs de leitura para anon.
-- Restaura os corpos originais (capturados antes da migration), reabre EXECUTE e remove os guards.

CREATE OR REPLACE FUNCTION public.get_admin_evolution(start_date timestamp with time zone)
 RETURNS TABLE(month text, fazendas bigint, usuarios bigint, individuos bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', start_date::timestamptz),
      date_trunc('month', NOW()),
      interval '1 month'
    ) AS month_start
  )
  SELECT
    to_char(m.month_start, 'YYYY-MM') AS month,
    COALESCE((SELECT COUNT(*) FROM fazendas WHERE date_trunc('month', created_at) = m.month_start), 0)::BIGINT AS fazendas,
    COALESCE((SELECT COUNT(*) FROM usuarios WHERE date_trunc('month', created_at) = m.month_start), 0)::BIGINT AS usuarios,
    COALESCE((SELECT COUNT(*) FROM individuos WHERE date_trunc('month', created_at) = m.month_start), 0)::BIGINT AS individuos
  FROM months m
  ORDER BY m.month_start;
$function$;

CREATE OR REPLACE FUNCTION public.get_registros_atividades(periodo text DEFAULT 'day'::text)
 RETURNS TABLE(caderneta text, fazenda_id uuid, fazenda_nome text, periodo_inicio date, quantidade bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_start_date DATE;
  v_trunc TEXT;
BEGIN
  IF periodo NOT IN ('day', 'week', 'month') THEN
    periodo := 'day';
  END IF;

  CASE periodo
    WHEN 'day' THEN
      v_trunc := 'day';
      v_start_date := CURRENT_DATE - INTERVAL '30 days';
    WHEN 'week' THEN
      v_trunc := 'week';
      v_start_date := DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '12 weeks';
    WHEN 'month' THEN
      v_trunc := 'month';
      v_start_date := DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '12 months';
  END CASE;

  RETURN QUERY
  WITH all_registros AS (
    SELECT 'Abastecimento' AS caderneta, public.registros_abastecimento.fazenda_id, public.registros_abastecimento.created_at FROM public.registros_abastecimento
    UNION ALL
    SELECT 'Almoxarifado', public.registros_almoxarifado.fazenda_id, public.registros_almoxarifado.created_at FROM public.registros_almoxarifado
    UNION ALL
    SELECT 'Bebedouros', public.registros_bebedouros.fazenda_id, public.registros_bebedouros.created_at FROM public.registros_bebedouros
    UNION ALL
    SELECT 'Cantina', public.registros_alimentacao.fazenda_id, public.registros_alimentacao.created_at FROM public.registros_alimentacao
    UNION ALL
    SELECT 'Clima', public.registros_clima.fazenda_id, public.registros_clima.created_at FROM public.registros_clima
    UNION ALL
    SELECT 'Enfermaria', public.registros_enfermaria.fazenda_id, public.registros_enfermaria.created_at FROM public.registros_enfermaria
    UNION ALL
    SELECT 'Entrada Insumos', public.registros_entrada_insumos.fazenda_id, public.registros_entrada_insumos.created_at FROM public.registros_entrada_insumos
    UNION ALL
    SELECT 'Leitura Cocho', public.registros_leitura_cocho.fazenda_id, public.registros_leitura_cocho.created_at FROM public.registros_leitura_cocho
    UNION ALL
    SELECT 'Limpeza', public.registros_limpeza.fazenda_id, public.registros_limpeza.created_at FROM public.registros_limpeza
    UNION ALL
    SELECT 'Manutenção Máquinas', public.registros_manutencao_maquinas.fazenda_id, public.registros_manutencao_maquinas.created_at FROM public.registros_manutencao_maquinas
    UNION ALL
    SELECT 'Maternidade', public.registros_maternidade.fazenda_id, public.registros_maternidade.created_at FROM public.registros_maternidade
    UNION ALL
    SELECT 'Morte', public.registros_morte.fazenda_id, public.registros_morte.created_at FROM public.registros_morte
    UNION ALL
    SELECT 'Movimentação', public.registros_movimentacao.fazenda_id, public.registros_movimentacao.created_at FROM public.registros_movimentacao
    UNION ALL
    SELECT 'Operações Máquinas', public.registros_operacoes_maquinas.fazenda_id, public.registros_operacoes_maquinas.created_at FROM public.registros_operacoes_maquinas
    UNION ALL
    SELECT 'Pastagens', public.registros_pastagens.fazenda_id, public.registros_pastagens.created_at FROM public.registros_pastagens
    UNION ALL
    SELECT 'Problemas', public.registros_problemas.fazenda_id, public.registros_problemas.created_at FROM public.registros_problemas
    UNION ALL
    SELECT 'Rodeio', public.registros_rodeio.fazenda_id, public.registros_rodeio.created_at FROM public.registros_rodeio
    UNION ALL
    SELECT 'Saída Insumos', public.registros_saida_insumos.fazenda_id, public.registros_saida_insumos.created_at FROM public.registros_saida_insumos
    UNION ALL
    SELECT 'Suplementação', public.registros_suplementacao.fazenda_id, public.registros_suplementacao.created_at FROM public.registros_suplementacao
  )
  SELECT
    ar.caderneta,
    ar.fazenda_id::UUID,
    COALESCE(f.nome, 'Fazenda desconhecida') AS fazenda_nome,
    DATE_TRUNC(v_trunc, ar.created_at)::DATE AS periodo_inicio,
    COUNT(*) AS quantidade
  FROM all_registros ar
  LEFT JOIN public.fazendas f ON f.id = ar.fazenda_id::UUID
  WHERE ar.created_at >= v_start_date
  GROUP BY ar.caderneta, ar.fazenda_id, f.nome, DATE_TRUNC(v_trunc, ar.created_at)
  ORDER BY periodo_inicio DESC, quantidade DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.obter_execucoes_rotina(p_fazenda_id uuid, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date, p_funcionario_id uuid DEFAULT NULL::uuid, p_caderneta_id text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, fazenda_id uuid, funcionario_id uuid, funcionario_nome text, rotina_id uuid, caderneta_id text, data date, horario_programado time without time zone, primeiro_acesso timestamp with time zone, primeiro_registro timestamp with time zone, primeiro_acesso_local text, primeiro_registro_local text, status text, observacao text, concluido boolean, total integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_tol INTEGER;
  v_tz TEXT;
BEGIN
  SELECT COALESCE(faz.tolerancia_rotina_minutos, 30), COALESCE(faz.timezone, 'UTC')
  INTO v_tol, v_tz
  FROM public.fazendas AS faz
  WHERE faz.id = p_fazenda_id;

  RETURN QUERY
  WITH base AS (
    SELECT
      er.id AS exec_id,
      er.fazenda_id AS exec_fazenda_id,
      er.funcionario_id AS exec_funcionario_id,
      f.nome AS exec_funcionario_nome,
      er.rotina_id AS exec_rotina_id,
      er.caderneta_id AS exec_caderneta_id,
      er.data AS exec_data,
      er.horario_programado AS exec_horario_programado,
      er.primeiro_acesso AS exec_primeiro_acesso,
      er.primeiro_registro AS exec_primeiro_registro,
      er.primeiro_acesso_local AS exec_primeiro_acesso_local,
      er.primeiro_registro_local AS exec_primeiro_registro_local,
      er.status AS exec_status,
      er.observacao AS exec_observacao,
      er.concluido AS exec_concluido,
      CASE
        WHEN er.status = 'dispensado' THEN 'dispensado'
        WHEN er.primeiro_registro IS NULL THEN 'nao_executado'
        WHEN er.horario_programado IS NULL THEN 'no_horario'
        ELSE 'calcular'
      END AS status_pre,
      COALESCE(
        er.primeiro_registro_local::TIME,
        (er.primeiro_registro AT TIME ZONE v_tz)::TIME
      ) AS registro_time_local
    FROM public.execucoes_rotina er
    JOIN public.funcionarios f ON f.id = er.funcionario_id
    WHERE er.fazenda_id = p_fazenda_id
      AND (p_data_inicio IS NULL OR er.data >= p_data_inicio)
      AND (p_data_fim IS NULL OR er.data <= p_data_fim)
      AND (p_funcionario_id IS NULL OR er.funcionario_id = p_funcionario_id)
      AND (p_caderneta_id IS NULL OR er.caderneta_id = p_caderneta_id)
  ),
  base_status AS (
    SELECT
      b.*,
      CASE
        WHEN b.status_pre = 'dispensado' THEN 'dispensado'
        WHEN b.status_pre = 'nao_executado' THEN 'nao_executado'
        WHEN b.status_pre = 'no_horario' THEN 'no_horario'
        WHEN b.registro_time_local IS NULL THEN 'nao_executado'
        WHEN ABS(EXTRACT(EPOCH FROM (b.registro_time_local - b.exec_horario_programado)) / 60) <= v_tol THEN 'no_horario'
        WHEN b.registro_time_local > b.exec_horario_programado THEN 'atrasado'
        ELSE 'antecipado'
      END AS status_calculado
    FROM base b
  ),
  filtrada AS (
    SELECT * FROM base_status
    WHERE (p_status IS NULL OR status_calculado = p_status)
  ),
  contagem AS (
    SELECT COUNT(*)::INTEGER AS total FROM filtrada
  )
  SELECT
    filtrada.exec_id,
    filtrada.exec_fazenda_id,
    filtrada.exec_funcionario_id,
    filtrada.exec_funcionario_nome,
    filtrada.exec_rotina_id,
    filtrada.exec_caderneta_id,
    filtrada.exec_data,
    filtrada.exec_horario_programado,
    filtrada.exec_primeiro_acesso,
    filtrada.exec_primeiro_registro,
    filtrada.exec_primeiro_acesso_local,
    filtrada.exec_primeiro_registro_local,
    filtrada.status_calculado,
    filtrada.exec_observacao,
    filtrada.exec_concluido,
    contagem.total
  FROM filtrada, contagem
  ORDER BY filtrada.exec_data DESC, filtrada.exec_funcionario_nome ASC, filtrada.exec_caderneta_id ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resumo_execucoes_rotina(p_fazenda_id uuid, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date, p_funcionario_id uuid DEFAULT NULL::uuid, p_caderneta_id text DEFAULT NULL::text)
 RETURNS TABLE(data date, programadas bigint, no_horario bigint, atrasadas bigint, antecipadas bigint, nao_executadas bigint, dispensadas bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
BEGIN
  RETURN QUERY
  WITH exec AS (
    SELECT * FROM public.obter_execucoes_rotina(
      p_fazenda_id,
      p_data_inicio,
      p_data_fim,
      p_funcionario_id,
      p_caderneta_id,
      NULL,
      100000,
      0
    )
  )
  SELECT
    e.data,
    COUNT(*) AS programadas,
    COUNT(*) FILTER (WHERE e.status = 'no_horario') AS no_horario,
    COUNT(*) FILTER (WHERE e.status = 'atrasado') AS atrasadas,
    COUNT(*) FILTER (WHERE e.status = 'antecipado') AS antecipadas,
    COUNT(*) FILTER (WHERE e.status = 'nao_executado') AS nao_executadas,
    COUNT(*) FILTER (WHERE e.status = 'dispensado') AS dispensadas
  FROM exec e
  GROUP BY e.data
  ORDER BY e.data DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_ia_monitoramento()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_cotacao numeric;
  v_cotacao_atualizada timestamptz;
BEGIN
  SELECT cotacao_usd_brl, atualizado_em INTO v_cotacao, v_cotacao_atualizada FROM public.ia_config_global WHERE id = 1;
  IF v_cotacao IS NULL THEN v_cotacao := 5.50; END IF;
  IF v_cotacao_atualizada IS NULL THEN v_cotacao_atualizada := now(); END IF;

  SELECT jsonb_build_object(
    'cotacao_usd_brl', v_cotacao,
    'cotacao_atualizada_em', v_cotacao_atualizada,
    'fazendas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'fazenda_id', f.id,
        'fazenda_nome', f.nome,
        'ia_ativo', COALESCE(ic.ia_ativo, false),
        'limite_diario', COALESCE(ic.limite_diario, 0),
        'custo_input_por_mil', COALESCE(ic.custo_input_por_mil, 0.075),
        'custo_output_por_mil', COALESCE(ic.custo_output_por_mil, 0.30),
        'custo_cached_por_mil', COALESCE(ic.custo_cached_por_mil, 0.01875),
        'total_perguntas', COALESCE(stats.total_perguntas, 0),
        'perguntas_hoje', COALESCE(stats.perguntas_hoje, 0),
        'perguntas_30d', COALESCE(stats.perguntas_30d, 0),
        'total_tokens_input', COALESCE(stats.total_tokens_input, 0),
        'total_tokens_output', COALESCE(stats.total_tokens_output, 0),
        'total_tokens_cached', COALESCE(stats.total_tokens_cached, 0),
        'custo_total_usd', COALESCE(stats.custo_total_usd, 0),
        'custo_30d_usd', COALESCE(stats.custo_30d_usd, 0),
        'custo_hoje_usd', COALESCE(stats.custo_hoje_usd, 0),
        'ultima_pergunta', stats.ultima_pergunta,
        'media_tokens_input', COALESCE(stats.media_tokens_input, 0),
        'media_tokens_output', COALESCE(stats.media_tokens_output, 0)
      ) ORDER BY f.nome)
      FROM public.fazendas f
      LEFT JOIN public.ia_fazenda_config ic ON ic.fazenda_id = f.id
      LEFT JOIN LATERAL (
        SELECT
          count(*) AS total_perguntas,
          count(*) FILTER (WHERE l.created_at >= CURRENT_DATE) AS perguntas_hoje,
          count(*) FILTER (WHERE l.created_at >= CURRENT_DATE - INTERVAL '30 days') AS perguntas_30d,
          COALESCE(sum(l.tokens_input), 0) AS total_tokens_input,
          COALESCE(sum(l.tokens_output), 0) AS total_tokens_output,
          COALESCE(sum(l.tokens_cached), 0) AS total_tokens_cached,
          COALESCE(sum(l.custo_estimado_usd), 0) AS custo_total_usd,
          COALESCE(sum(l.custo_estimado_usd) FILTER (WHERE l.created_at >= CURRENT_DATE - INTERVAL '30 days'), 0) AS custo_30d_usd,
          COALESCE(sum(l.custo_estimado_usd) FILTER (WHERE l.created_at >= CURRENT_DATE), 0) AS custo_hoje_usd,
          max(l.created_at) AS ultima_pergunta,
          COALESCE(avg(l.tokens_input), 0) AS media_tokens_input,
          COALESCE(avg(l.tokens_output), 0) AS media_tokens_output
        FROM public.chat_ia_logs l
        WHERE l.fazenda_id = f.id
      ) stats ON true
      WHERE f.ativo = true
    ), '[]'::jsonb),
    'resumo_global', jsonb_build_object(
      'total_fazendas_ativas', (SELECT count(*) FROM public.fazendas WHERE ativo = true),
      'total_fazendas_com_ia', (SELECT count(*) FROM public.ia_fazenda_config WHERE ia_ativo = true),
      'total_perguntas', (SELECT count(*) FROM public.chat_ia_logs),
      'perguntas_hoje', (SELECT count(*) FROM public.chat_ia_logs WHERE created_at >= CURRENT_DATE),
      'perguntas_30d', (SELECT count(*) FROM public.chat_ia_logs WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'),
      'custo_total_usd', (SELECT COALESCE(sum(custo_estimado_usd), 0) FROM public.chat_ia_logs),
      'custo_hoje_usd', (SELECT COALESCE(sum(custo_estimado_usd), 0) FROM public.chat_ia_logs WHERE created_at >= CURRENT_DATE),
      'custo_30d_usd', (SELECT COALESCE(sum(custo_estimado_usd), 0) FROM public.chat_ia_logs WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'),
      'total_tokens_input', (SELECT COALESCE(sum(tokens_input), 0) FROM public.chat_ia_logs),
      'total_tokens_output', (SELECT COALESCE(sum(tokens_output), 0) FROM public.chat_ia_logs),
      'total_tokens_cached', (SELECT COALESCE(sum(tokens_cached), 0) FROM public.chat_ia_logs)
    )
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_fazenda_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_today_start timestamptz;
  v_today_end timestamptz;
  v_result jsonb;
BEGIN
  -- Bounds do dia atual em timezone Cuiabá
  v_today_start := (CURRENT_DATE::timestamptz AT TIME ZONE 'America/Cuiaba');
  v_today_end := ((CURRENT_DATE + 1)::timestamptz AT TIME ZONE 'America/Cuiaba');

  SELECT jsonb_build_object(
    'cadastroStats', jsonb_build_object(
      'pastos',        (SELECT COUNT(*) FROM pastos WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL),
      'lotes',         (SELECT COUNT(*) FROM lotes WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL),
      'funcionarios',  (SELECT COUNT(*) FROM funcionarios WHERE fazenda_id = p_fazenda_id AND ativo = true),
      'insumos',       (SELECT COUNT(*) FROM insumos WHERE fazenda_id = p_fazenda_id AND ativo = true),
      'pluviometros',  (SELECT COUNT(*) FROM pluviometros WHERE fazenda_id = p_fazenda_id AND ativo = true),
      'medicamentos',  (SELECT COUNT(*) FROM medicamentos WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL)
    ),
    'cadernetaStats', jsonb_build_object(
      'maternidade',         (SELECT COUNT(*) FROM registros_maternidade WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'enfermaria',          (SELECT COUNT(*) FROM registros_enfermaria WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'pastagens',           (SELECT COUNT(*) FROM registros_pastagens WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'rodeio',              (SELECT COUNT(*) FROM registros_rodeio WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'suplementacao',       (SELECT COUNT(*) FROM registros_suplementacao WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'bebedouros',          (SELECT COUNT(*) FROM registros_bebedouros WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'movimentacao',        (SELECT COUNT(*) FROM registros_movimentacao WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'morte',               (SELECT COUNT(*) FROM registros_morte WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'clima',               (SELECT COUNT(*) FROM registros_clima WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'abastecimento',       (SELECT COUNT(*) FROM registros_abastecimento WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'cantina',             (SELECT COUNT(*) FROM registros_alimentacao WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'limpeza',             (SELECT COUNT(*) FROM registros_limpeza WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'operacoes-maquinas',  (SELECT COUNT(*) FROM registros_operacoes_maquinas WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'almoxarifado',        (SELECT COUNT(*) FROM registros_almoxarifado WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'manutencao-maquinas', (SELECT COUNT(*) FROM registros_manutencao_maquinas WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'problemas',           (SELECT COUNT(*) FROM registros_problemas WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'pesagem',             (SELECT COUNT(*) FROM registros_pesagem WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'leitura-cocho',       (SELECT COUNT(*) FROM registros_leitura_cocho WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'trato-confinamento',  (SELECT COUNT(*) FROM registros_oferta_trato WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'fabrica-confinamento',(SELECT COUNT(*) FROM registros_fabrica_confinamento WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'entrada-insumos',     (SELECT COUNT(*) FROM registros_entrada_insumos WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'saida-insumos',       (SELECT COUNT(*) FROM registros_saida_insumos WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'entrada-combustivel', (SELECT COUNT(*) FROM movimentacoes_combustivel WHERE fazenda_id = p_fazenda_id AND tipo_movimentacao = 'entrada' AND origem = 'pwa_entrada'),
      'entrada-almoxarifado',(SELECT COUNT(*) FROM registros_almoxarifado WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND tipo = 'entrada'),
      'entrada-cantina',     (SELECT COUNT(*) FROM registros_alimentacao WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND modo = 'entrada'),
      'comunicado-venda',        (SELECT COUNT(*) FROM ordens_servico WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND tipo = 'venda'),
      'comunicado-compra',       (SELECT COUNT(*) FROM ordens_servico WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND tipo = 'compra'),
      'comunicado-transferencia',(SELECT COUNT(*) FROM ordens_servico WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND tipo = 'transferencia'),
      'recebimento-compra',  (SELECT COUNT(*) FROM os_recebimentos WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL)
    ),
    'registrosHoje',
      (SELECT COUNT(*) FROM registros_maternidade WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND data >= v_today_start AND data < v_today_end) +
      (SELECT COUNT(*) FROM registros_enfermaria WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND data >= v_today_start AND data < v_today_end) +
      (SELECT COUNT(*) FROM registros_pastagens WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND data >= v_today_start AND data < v_today_end) +
      (SELECT COUNT(*) FROM registros_rodeio WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND data >= v_today_start AND data < v_today_end) +
      (SELECT COUNT(*) FROM registros_suplementacao WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND data >= v_today_start AND data < v_today_end) +
      (SELECT COUNT(*) FROM registros_bebedouros WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND data >= v_today_start AND data < v_today_end) +
      (SELECT COUNT(*) FROM registros_movimentacao WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND data >= v_today_start AND data < v_today_end) +
      (SELECT COUNT(*) FROM registros_morte WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND data >= v_today_start AND data < v_today_end)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_gado_stats(p_fazenda_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'totalAnimais',
      COALESCE((SELECT SUM(COALESCE(lc.quant_atual, lc.quant_inicial, 0))
               FROM lote_categorias lc
               JOIN lotes l ON l.id = lc.lote_id
               WHERE l.fazenda_id = p_fazenda_id AND l.ativo = true AND l.deleted_at IS NULL
                 AND lc.ativo = true), 0),
    'animaisPorLote',
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
                 'nome', nome,
                 'cabecas', cabecas
               ) ORDER BY nome)
               FROM (
                 SELECT l.nome,
                        COALESCE(SUM(COALESCE(lc.quant_atual, lc.quant_inicial, 0)), 0) AS cabecas
                 FROM lotes l
                 LEFT JOIN lote_categorias lc ON lc.lote_id = l.id AND lc.ativo = true
                 WHERE l.fazenda_id = p_fazenda_id AND l.ativo = true AND l.deleted_at IS NULL
                 GROUP BY l.id, l.nome
               ) lotes_agg), '[]'::jsonb),
    'pesoMedioLotes',
      COALESCE((SELECT
                 CASE WHEN SUM(COALESCE(lc.quant_atual, lc.quant_inicial, 0)) > 0
                   THEN SUM(COALESCE(lc.quant_atual, lc.quant_inicial, 0) *
                           COALESCE(lc.peso_vivo_atual_kg_cab, lc.peso_entrada_kg_cab, 0)) /
                        SUM(COALESCE(lc.quant_atual, lc.quant_inicial, 0))
                   ELSE 0
                 END
               FROM lote_categorias lc
               JOIN lotes l ON l.id = lc.lote_id
               WHERE l.fazenda_id = p_fazenda_id AND l.ativo = true AND l.deleted_at IS NULL
                 AND lc.ativo = true
                 AND COALESCE(lc.peso_vivo_atual_kg_cab, lc.peso_entrada_kg_cab, 0) > 0), 0),
    'mortesMesAtual',
      COALESCE((SELECT COUNT(*) FROM registros_morte
               WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL), 0),
    'enfermariaMesAtual',
      COALESCE((SELECT COUNT(*) FROM registros_enfermaria
               WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL), 0),
    'causasMorteFrequentes',
      COALESCE((SELECT jsonb_agg(jsonb_build_object('causa', causa_morte, 'total', cnt))
               FROM (
                 SELECT causa_morte, COUNT(*) AS cnt
                 FROM registros_morte
                 WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
                   AND causa_morte IS NOT NULL
                 GROUP BY causa_morte
                 ORDER BY COUNT(*) DESC
                 LIMIT 5
               ) t), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

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
  SELECT jsonb_build_object(
    'activities', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'type', tipo,
        'title', titulo,
        'data', data
      ) ORDER BY data DESC)
      FROM (
        SELECT * FROM (
          SELECT id, 'Maternidade' AS tipo, 'Registro de parto' AS titulo, data
          FROM registros_maternidade
          WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
            AND (lote_id IS NULL OR lote_id IN (SELECT id FROM lotes WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
            AND (pasto_id IS NULL OR pasto_id IN (SELECT id FROM pastos WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
          UNION ALL
          SELECT id, 'Enfermaria' AS tipo, 'Registro de tratamento' AS titulo, data
          FROM registros_enfermaria
          WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
            AND (lote_id IS NULL OR lote_id IN (SELECT id FROM lotes WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
            AND (pasto_id IS NULL OR pasto_id IN (SELECT id FROM pastos WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
          UNION ALL
          SELECT id, 'Rodeio' AS tipo, 'Registro de rodeio' AS titulo, data
          FROM registros_rodeio
          WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL
            AND (lote_id IS NULL OR lote_id IN (SELECT id FROM lotes WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
            AND (pasto_id IS NULL OR pasto_id IN (SELECT id FROM pastos WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL))
        ) recentes
        ORDER BY data DESC
        LIMIT 10
      ) top10
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_system_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_result jsonb;
  v_db_stats record;
  v_start_time timestamptz;
BEGIN
  SELECT * INTO v_db_stats FROM pg_stat_database WHERE datname = 'postgres';
  v_start_time := pg_postmaster_start_time();

  SELECT jsonb_build_object(
    'postgres', jsonb_build_object(
      'version', split_part(current_setting('server_version'), ' ', 1),
      'timezone', current_setting('TimeZone'),
      'maxConnections', current_setting('max_connections')::int,
      'sharedBuffers', current_setting('shared_buffers'),
      'effectiveCacheSize', current_setting('effective_cache_size'),
      'workMem', current_setting('work_mem'),
      'startTime', v_start_time,
      'uptimeSeconds', EXTRACT(EPOCH FROM (now() - v_start_time))
    ),
    'database', jsonb_build_object(
      'sizeBytes', pg_database_size('postgres'),
      'sizePretty', pg_size_pretty(pg_database_size('postgres')),
      'totalTables', (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'),
      'totalIndexes', (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public'),
      'totalFunctions', (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public'),
      'securityDefinerFunctions', (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.prosecdef = true),
      'rlsTables', (SELECT COUNT(DISTINCT tablename) FROM pg_policies WHERE schemaname = 'public'),
      'rlsPolicies', (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public')
    ),
    'connections', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = 'postgres'),
      'active', (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = 'postgres' AND state = 'active'),
      'idle', (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = 'postgres' AND state = 'idle'),
      'idleInTransaction', (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = 'postgres' AND state = 'idle in transaction'),
      'maxDirect', current_setting('max_connections')::int
    ),
    'users', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM auth.users),
      'active24h', (SELECT COUNT(*) FROM auth.users WHERE last_sign_in_at > now() - interval '24 hours'),
      'active1h', (SELECT COUNT(*) FROM auth.users WHERE last_sign_in_at > now() - interval '1 hour'),
      'activeSessions1h', (SELECT COUNT(*) FROM auth.sessions WHERE created_at > now() - interval '1 hour'),
      'signupsToday', (SELECT COUNT(*) FROM auth.users WHERE created_at >= CURRENT_DATE),
      'signups7d', (SELECT COUNT(*) FROM auth.users WHERE created_at > now() - interval '7 days'),
      'byRole', COALESCE((SELECT jsonb_agg(jsonb_build_object('role', role, 'count', cnt))
        FROM (
          SELECT COALESCE(raw_user_meta_data->>'papel', 'sem_papel') AS role, COUNT(*) AS cnt
          FROM auth.users
          GROUP BY raw_user_meta_data->>'papel'
          ORDER BY COUNT(*) DESC
        ) t), '[]'::jsonb)
    ),
    'fazendas', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM public.fazendas),
      'ativas', (SELECT COUNT(*) FROM public.fazendas WHERE ativo = true),
      'withUsers24h', (SELECT COUNT(DISTINCT f.id)
        FROM public.fazendas f
        JOIN public.usuario_fazenda uf ON uf.fazenda_id = f.id
        JOIN auth.users u ON u.id = uf.usuario_id
        WHERE u.last_sign_in_at > now() - interval '24 hours')
    ),
    'fazendasActive', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'fazenda_id', f.id,
        'fazenda_nome', f.nome,
        'active_users', f.cnt
      ) ORDER BY f.cnt DESC)
      FROM (
        SELECT f.id, f.nome, COUNT(DISTINCT u.id) AS cnt
        FROM public.fazendas f
        JOIN public.usuario_fazenda uf ON uf.fazenda_id = f.id
        JOIN auth.users u ON u.id = uf.usuario_id
        WHERE u.last_sign_in_at > now() - interval '1 hour'
          AND f.ativo = true
        GROUP BY f.id, f.nome
      ) f
    ), '[]'::jsonb),
    'dataVolume', jsonb_build_object(
      'lotes', (SELECT COUNT(*) FROM public.lotes WHERE deleted_at IS NULL),
      'individuos', (SELECT COUNT(*) FROM public.individuos WHERE deleted_at IS NULL),
      'registrosSuplementacao', (SELECT COUNT(*) FROM public.registros_suplementacao WHERE deleted_at IS NULL),
      'registrosMaternidade', (SELECT COUNT(*) FROM public.registros_maternidade WHERE deleted_at IS NULL),
      'registrosEnfermaria', (SELECT COUNT(*) FROM public.registros_enfermaria WHERE deleted_at IS NULL),
      'planosNutricionais', (SELECT COUNT(*) FROM public.planos_nutricionais)
    ),
    'throughput', jsonb_build_object(
      'xactCommit', v_db_stats.xact_commit,
      'xactRollback', v_db_stats.xact_rollback,
      'xactTotal', v_db_stats.xact_commit + v_db_stats.xact_rollback,
      'rollbackRate', CASE
        WHEN (v_db_stats.xact_commit + v_db_stats.xact_rollback) > 0
        THEN round((v_db_stats.xact_rollback::float / (v_db_stats.xact_commit + v_db_stats.xact_rollback) * 100)::numeric, 2)
        ELSE 0
      END,
      'tupInserted', v_db_stats.tup_inserted,
      'tupUpdated', v_db_stats.tup_updated,
      'tupDeleted', v_db_stats.tup_deleted,
      'tupReturned', v_db_stats.tup_returned,
      'tupFetched', v_db_stats.tup_fetched
    ),
    'cache', jsonb_build_object(
      'hitRatio', COALESCE(round((v_db_stats.blks_hit::float / NULLIF(v_db_stats.blks_hit + v_db_stats.blks_read, 0) * 100)::numeric, 2), 0),
      'blksHit', v_db_stats.blks_hit,
      'blksRead', v_db_stats.blks_read,
      'deadlocks', v_db_stats.deadlocks,
      'conflicts', v_db_stats.conflicts,
      'tempBytes', v_db_stats.temp_bytes,
      'tempFiles', v_db_stats.temp_files
    ),
    'indexUsage', jsonb_build_object(
      'seqScans', COALESCE((SELECT SUM(seq_scan) FROM pg_stat_user_tables WHERE schemaname = 'public'), 0),
      'idxScans', COALESCE((SELECT SUM(idx_scan) FROM pg_stat_user_tables WHERE schemaname = 'public'), 0),
      'deadTuples', COALESCE((SELECT SUM(n_dead_tup) FROM pg_stat_user_tables WHERE schemaname = 'public'), 0),
      'liveTuples', COALESCE((SELECT SUM(n_live_tup) FROM pg_stat_user_tables WHERE schemaname = 'public'), 0)
    ),
    'unusedIndexes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'schemaname', schemaname,
        'relname', relname,
        'indexrelname', indexrelname,
        'idxScan', idx_scan,
        'sizeBytes', pg_total_relation_size(indexrelid),
        'sizePretty', pg_size_pretty(pg_total_relation_size(indexrelid))
      ) ORDER BY pg_total_relation_size(indexrelid) DESC)
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
        AND idx_scan = 0
        AND indexrelname NOT LIKE '%_pkey'
        AND indexrelname NOT LIKE '%_key'
    ), '[]'::jsonb),
    'topTables', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', relname,
        'sizePretty', pg_size_pretty(pg_total_relation_size(relid)),
        'sizeBytes', pg_total_relation_size(relid)
      ))
      FROM (
        SELECT relname, relid
        FROM pg_catalog.pg_statio_user_tables
        ORDER BY pg_total_relation_size(relid) DESC
        LIMIT 10
      ) top10
    ), '[]'::jsonb),
    'slowQueries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'pid', pid,
        'state', state,
        'query', left(query, 200),
        'durationMs', EXTRACT(EPOCH FROM (now() - query_start)) * 1000,
        'applicationName', application_name,
        'userName', usename
      ) ORDER BY query_start)
      FROM pg_stat_activity
      WHERE datname = 'postgres'
        AND state = 'active'
        AND query NOT ILIKE '%pg_stat_activity%'
        AND query_start IS NOT NULL
    ), '[]'::jsonb),
    'cronJobs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'jobid', jobid,
        'jobname', jobname,
        'schedule', schedule,
        'active', active,
        'command', left(command, 150)
      ) ORDER BY jobid)
      FROM cron.job
    ), '[]'::jsonb),
    'samples', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sampledAt', sampled_at,
        'dbSizeBytes', db_size_bytes,
        'activeConnections', active_connections,
        'totalConnections', total_connections,
        'activeUsers1h', active_users_1h,
        'activeSessions1h', active_sessions_1h,
        'cacheHitRatio', cache_hit_ratio,
        'xactTotal', xact_total,
        'avgQueryMs', avg_active_query_ms,
        'maxQueryMs', max_active_query_ms,
        'activeQueries', active_queries_count
      ) ORDER BY sampled_at)
      FROM (
        SELECT * FROM public.system_health_samples
        WHERE sampled_at > now() - interval '24 hours'
        ORDER BY sampled_at DESC
        LIMIT 288
      ) s
    ), '[]'::jsonb),
    'growthRate', COALESCE((
      SELECT jsonb_build_object(
        'bytesPerHour', round((latest.db_size_bytes - earliest.db_size_bytes)::numeric / 
          NULLIF(EXTRACT(EPOCH FROM (latest.sampled_at - earliest.sampled_at)) / 3600, 0), 2),
        'bytesPerDay', round((latest.db_size_bytes - earliest.db_size_bytes)::numeric / 
          NULLIF(EXTRACT(EPOCH FROM (latest.sampled_at - earliest.sampled_at)) / 86400, 0), 2),
        'size24hAgo', earliest.db_size_bytes,
        'sizeNow', latest.db_size_bytes,
        'deltaBytes', latest.db_size_bytes - earliest.db_size_bytes,
        'hoursSpan', round(EXTRACT(EPOCH FROM (latest.sampled_at - earliest.sampled_at)) / 3600, 1)
      )
      FROM 
        (SELECT db_size_bytes, sampled_at FROM public.system_health_samples ORDER BY sampled_at ASC LIMIT 1) earliest,
        (SELECT db_size_bytes, sampled_at FROM public.system_health_samples ORDER BY sampled_at DESC LIMIT 1) latest
    ), '{}'::jsonb),
    'timestamp', now()
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_audit_log(p_fazenda_id uuid DEFAULT NULL::uuid, p_usuario_id uuid DEFAULT NULL::uuid, p_tabela text DEFAULT NULL::text, p_operacao text DEFAULT NULL::text, p_data_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_data_fim timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limite integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'entries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'createdAt', a.criado_em,
        'usuarioId', a.usuario_id,
        'usuarioEmail', a.usuario_email,
        'usuarioNome', a.usuario_nome,
        'fazendaId', a.fazenda_id,
        'fazendaNome', f.nome,
        'tabela', a.tabela,
        'operacao', a.operacao,
        'registroId', a.registro_id,
        'valorAnterior', a.valor_anterior,
        'valorNovo', a.valor_novo,
        'alteracoes', a.alteracoes,
        'isImpersonation', a.is_impersonation,
        'impersonatedBy', a.impersonated_by,
        'ipAddress', a.ip_address,
        'userAgent', a.user_agent,
        'sourceApp', a.source_app,
        'originPage', a.origin_page,
        'transactionId', a.transaction_id,
        'isSoftDelete', a.is_soft_delete,
        'batchSize', (
          SELECT COUNT(*) FROM public.audit_log b
          WHERE b.transaction_id = a.transaction_id
            AND b.transaction_id IS NOT NULL
        )
      ) ORDER BY a.criado_em DESC)
      FROM public.audit_log a
      LEFT JOIN public.fazendas f ON f.id = a.fazenda_id
      WHERE (p_fazenda_id IS NULL OR a.fazenda_id = p_fazenda_id)
        AND (p_usuario_id IS NULL OR a.usuario_id = p_usuario_id)
        AND (p_tabela IS NULL OR a.tabela = p_tabela)
        AND (p_operacao IS NULL OR a.operacao = p_operacao)
        AND (p_data_inicio IS NULL OR a.criado_em >= p_data_inicio)
        AND (p_data_fim IS NULL OR a.criado_em <= p_data_fim)
      LIMIT p_limite OFFSET p_offset
    ), '[]'::jsonb),
    'total', (
      SELECT COUNT(*) FROM public.audit_log a
      WHERE (p_fazenda_id IS NULL OR a.fazenda_id = p_fazenda_id)
        AND (p_usuario_id IS NULL OR a.usuario_id = p_usuario_id)
        AND (p_tabela IS NULL OR a.tabela = p_tabela)
        AND (p_operacao IS NULL OR a.operacao = p_operacao)
        AND (p_data_inicio IS NULL OR a.criado_em >= p_data_inicio)
        AND (p_data_fim IS NULL OR a.criado_em <= p_data_fim)
    ),
    'tabelasAuditadas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('tabela', tabela, 'count', cnt))
      FROM (
        SELECT tabela, COUNT(*) as cnt FROM public.audit_log
        GROUP BY tabela ORDER BY cnt DESC
      ) t
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_farm_usage_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'farms', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id,
        'nome', f.nome,
        'ativo', f.ativo,
        'createdAt', f.created_at,
        'usuarios', COALESCE(uf.usuario_count, 0),
        'usuariosAtivos24h', COALESCE(uf.ativos_24h, 0),
        'usuariosAtivos7d', COALESCE(uf.ativos_7d, 0),
        'lotes', COALESCE(d.lotes, 0),
        'lotesAtivos', COALESCE(d.lotes_ativos, 0),
        'individuos', COALESCE(d.individuos, 0),
        'pastos', COALESCE(d.pastos, 0),
        'currais', COALESCE(d.currais, 0),
        'planosNutricionais', COALESCE(d.planos, 0),
        'planosAtivos', COALESCE(d.planos_ativos, 0),
        'formulacoes', COALESCE(d.formulacoes, 0),
        'registrosSuplementacao', COALESCE(d.reg_suplementacao, 0),
        'registrosSuplementacao30d', COALESCE(d.reg_suplementacao_30d, 0),
        'registrosMaternidade', COALESCE(d.reg_maternidade, 0),
        'registrosEnfermaria', COALESCE(d.reg_enfermaria, 0),
        'registrosMovimentacao', COALESCE(d.reg_movimentacao, 0),
        'registrosLeituraCocho', COALESCE(d.reg_leitura_cocho, 0),
        'registrosAlimentacao', COALESCE(d.reg_alimentacao, 0),
        'notificacoesEnviadas', COALESCE(d.notificacoes, 0),
        'chatIaLogs', COALESCE(d.chat_ia_logs, 0),
        'ultimaAtividade', d.ultima_atividade,
        'tamanhoBytes', COALESCE(d.tamanho_bytes, 0),
        'tamanhoPretty', COALESCE(d.tamanho_pretty, '0 bytes'),
        'crescimento30d', COALESCE(d.reg_30d_total, 0)
      ) ORDER BY d.reg_30d_total DESC NULLS LAST, COALESCE(uf.ativos_24h, 0) DESC)
      FROM public.fazendas f
      LEFT JOIN (
        SELECT
          uf.fazenda_id,
          COUNT(*) as usuario_count,
          COUNT(CASE WHEN u.ultimo_acesso > now() - interval '24 hours' THEN 1 END) as ativos_24h,
          COUNT(CASE WHEN u.ultimo_acesso > now() - interval '7 days' THEN 1 END) as ativos_7d
        FROM public.usuario_fazenda uf
        JOIN public.usuarios u ON u.id = uf.usuario_id
        WHERE uf.ativo = true
        GROUP BY uf.fazenda_id
      ) uf ON uf.fazenda_id = f.id
      LEFT JOIN LATERAL (
        SELECT
          (SELECT COUNT(*) FROM public.lotes WHERE fazenda_id = f.id) as lotes,
          (SELECT COUNT(*) FROM public.lotes WHERE fazenda_id = f.id AND ativo = true) as lotes_ativos,
          (SELECT COUNT(*) FROM public.individuos WHERE fazenda_id = f.id) as individuos,
          (SELECT COUNT(*) FROM public.pastos WHERE fazenda_id = f.id) as pastos,
          (SELECT COUNT(*) FROM public.currais WHERE fazenda_id = f.id) as currais,
          (SELECT COUNT(*) FROM public.planos_nutricionais WHERE fazenda_id = f.id) as planos,
          (SELECT COUNT(*) FROM public.planos_nutricionais WHERE fazenda_id = f.id AND data_fim IS NULL) as planos_ativos,
          (SELECT COUNT(*) FROM public.formulacoes WHERE fazenda_id = f.id AND ativo = true) as formulacoes,
          (SELECT COUNT(*) FROM public.registros_suplementacao WHERE fazenda_id = f.id) as reg_suplementacao,
          (SELECT COUNT(*) FROM public.registros_suplementacao WHERE fazenda_id = f.id AND created_at > now() - interval '30 days') as reg_suplementacao_30d,
          (SELECT COUNT(*) FROM public.registros_maternidade WHERE fazenda_id = f.id) as reg_maternidade,
          (SELECT COUNT(*) FROM public.registros_enfermaria WHERE fazenda_id = f.id) as reg_enfermaria,
          (SELECT COUNT(*) FROM public.registros_movimentacao WHERE fazenda_id = f.id) as reg_movimentacao,
          (SELECT COUNT(*) FROM public.registros_leitura_cocho WHERE fazenda_id = f.id) as reg_leitura_cocho,
          (SELECT COUNT(*) FROM public.registros_alimentacao WHERE fazenda_id = f.id) as reg_alimentacao,
          (SELECT COUNT(*) FROM public.notificacoes WHERE fazenda_id = f.id) as notificacoes,
          (SELECT COUNT(*) FROM public.chat_ia_logs WHERE fazenda_id = f.id) as chat_ia_logs,
          (
            SELECT MAX(dt) FROM (
              SELECT MAX(created_at) as dt FROM public.registros_suplementacao WHERE fazenda_id = f.id
              UNION ALL SELECT MAX(created_at) FROM public.registros_maternidade WHERE fazenda_id = f.id
              UNION ALL SELECT MAX(created_at) FROM public.registros_enfermaria WHERE fazenda_id = f.id
              UNION ALL SELECT MAX(created_at) FROM public.registros_movimentacao WHERE fazenda_id = f.id
              UNION ALL SELECT MAX(created_at) FROM public.registros_leitura_cocho WHERE fazenda_id = f.id
              UNION ALL SELECT MAX(created_at) FROM public.registros_alimentacao WHERE fazenda_id = f.id
              UNION ALL SELECT MAX(updated_at) FROM public.lotes WHERE fazenda_id = f.id
            ) combined
          ) as ultima_atividade,
          (
            (SELECT COUNT(*) FROM public.registros_suplementacao WHERE fazenda_id = f.id AND created_at > now() - interval '30 days') +
            (SELECT COUNT(*) FROM public.registros_maternidade WHERE fazenda_id = f.id AND created_at > now() - interval '30 days') +
            (SELECT COUNT(*) FROM public.registros_enfermaria WHERE fazenda_id = f.id AND created_at > now() - interval '30 days') +
            (SELECT COUNT(*) FROM public.registros_movimentacao WHERE fazenda_id = f.id AND created_at > now() - interval '30 days') +
            (SELECT COUNT(*) FROM public.registros_leitura_cocho WHERE fazenda_id = f.id AND created_at > now() - interval '30 days') +
            (SELECT COUNT(*) FROM public.registros_alimentacao WHERE fazenda_id = f.id AND created_at > now() - interval '30 days')
          ) as reg_30d_total,
          COALESCE(pg_total_relation_size('public.lotes') + pg_total_relation_size('public.individuos') + pg_total_relation_size('public.registros_suplementacao'), 0) as tamanho_bytes,
          'N/A' as tamanho_pretty
      ) d ON true
    ), '[]'::jsonb),
    'summary', jsonb_build_object(
      'totalFarms', (SELECT COUNT(*) FROM public.fazendas),
      'farmsAtivas', (SELECT COUNT(*) FROM public.fazendas WHERE ativo = true),
      'farmsAtivas24h', (SELECT COUNT(DISTINCT uf.fazenda_id) FROM public.usuario_fazenda uf JOIN public.usuarios u ON u.id = uf.usuario_id WHERE uf.ativo = true AND u.ultimo_acesso > now() - interval '24 hours'),
      'farmsAtivas7d', (SELECT COUNT(DISTINCT uf.fazenda_id) FROM public.usuario_fazenda uf JOIN public.usuarios u ON u.id = uf.usuario_id WHERE uf.ativo = true AND u.ultimo_acesso > now() - interval '7 days'),
      'farmsInativas30d', (SELECT COUNT(*) FROM public.fazendas f WHERE f.ativo = true AND NOT EXISTS (SELECT 1 FROM public.usuario_fazenda uf JOIN public.usuarios u ON u.id = uf.usuario_id WHERE uf.fazenda_id = f.id AND uf.ativo = true AND u.ultimo_acesso > now() - interval '30 days')),
      'totalUsuarios', (SELECT COUNT(*) FROM public.usuarios WHERE ativo = true),
      'totalLotes', (SELECT COUNT(*) FROM public.lotes WHERE ativo = true),
      'totalIndividuos', (SELECT COUNT(*) FROM public.individuos),
      'totalRegistros30d', (
        (SELECT COUNT(*) FROM public.registros_suplementacao WHERE created_at > now() - interval '30 days') +
        (SELECT COUNT(*) FROM public.registros_maternidade WHERE created_at > now() - interval '30 days') +
        (SELECT COUNT(*) FROM public.registros_enfermaria WHERE created_at > now() - interval '30 days') +
        (SELECT COUNT(*) FROM public.registros_movimentacao WHERE created_at > now() - interval '30 days') +
        (SELECT COUNT(*) FROM public.registros_leitura_cocho WHERE created_at > now() - interval '30 days') +
        (SELECT COUNT(*) FROM public.registros_alimentacao WHERE created_at > now() - interval '30 days')
      )
    ),
    'timestamp', now()
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_lotes_para_relatorio(p_fazenda_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'lote_id', l.id,
      'nome', l.nome,
      'ativo', l.ativo,
      'n_cabecas', COALESCE((
        SELECT SUM(COALESCE(lc.quant_atual, lc.quant_inicial, 0))
        FROM lote_categorias lc
        WHERE lc.lote_id = l.id AND lc.ativo = true
      ), 0),
      'categorias', COALESCE((
        SELECT string_agg(DISTINCT lc.categoria, ', ')
        FROM lote_categorias lc
        WHERE lc.lote_id = l.id AND lc.ativo = true
      ), null),
      'pasto_nome', p.nome,
      'data_criacao', to_char(l.created_at, 'YYYY-MM-DD'),
      'tem_movimentacao', EXISTS (
        SELECT 1 FROM registros_movimentacao r
        WHERE r.fazenda_id = p_fazenda_id AND r.deleted_at IS NULL
          AND (r.lote_origem_id = l.id OR r.lote_destino_id = l.id)
      ),
      'tem_morte', EXISTS (
        SELECT 1 FROM registros_morte r
        WHERE r.fazenda_id = p_fazenda_id AND r.lote_id = l.id AND r.deleted_at IS NULL
      ),
      'tem_consumo', EXISTS (
        SELECT 1 FROM registros_suplementacao r
        WHERE r.fazenda_id = p_fazenda_id AND r.lote_id = l.id AND r.deleted_at IS NULL
      )
    ) ORDER BY l.ativo DESC, l.nome ASC)
    FROM lotes l
    LEFT JOIN pastos p ON p.id = l.pasto_id
    WHERE l.fazenda_id = p_fazenda_id
      AND l.deleted_at IS NULL
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_relatorio_lote_ciclo_vida(p_fazenda_id uuid, p_lote_id uuid, p_secoes text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_lote record;
  v_cadastro jsonb;
  v_estado_atual jsonb;
  v_cronologia jsonb;
  v_nutricional jsonb;
  v_ocupacao jsonb;
  v_movimentacoes jsonb;
  v_mortalidade jsonb;
  v_reproducao jsonb;
  v_consumo jsonb;
  v_individuos jsonb;
  v_indicadores jsonb;
  v_result jsonb;
  v_tem_reproducao boolean;
BEGIN
  SELECT * INTO v_lote FROM lotes WHERE id = p_lote_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lote nao encontrado ou nao pertence a fazenda informada');
  END IF;

  IF p_secoes IS NULL OR array_position(p_secoes, 'cadastro') IS NOT NULL THEN
    SELECT to_jsonb(v_lote) - 'fazenda_id' - 'deleted_at' - 'updated_at' - 'n_cabecas' - 'numero_cabecas'
      || jsonb_build_object('pasto_nome', p.nome, 'pasto_area_ha', p.area_util_ha, 'modulo_id', v_lote.modulo_id, 'curral_nome', c.nome)
    INTO v_cadastro
    FROM pastos p LEFT JOIN currais c ON c.lote_id = v_lote.id AND c.ativo = true WHERE p.id = v_lote.pasto_id;
  END IF;

  IF p_secoes IS NULL OR array_position(p_secoes, 'estado_atual') IS NOT NULL THEN
    SELECT jsonb_build_object(
      'cabecas_totais', COALESCE((SELECT SUM(COALESCE(lc.quant_atual, lc.quant_inicial, 0)) FROM lote_categorias lc WHERE lc.lote_id = v_lote.id AND lc.ativo = true), 0),
      'categorias_ativas', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('categoria', lc.categoria, 'quant_atual', lc.quant_atual, 'peso_vivo_atual_kg', lc.peso_vivo_atual_kg_cab, 'peso_entrada_kg', lc.peso_entrada_kg_cab, 'gmd', lc.gmd, 'morte', lc.morte, 'abate', lc.abate, 'transf_entrada', lc.transf_entrada, 'transf_saida', lc.transf_saida, 'data_meta_projetada', to_char(lc.data_meta_projetada, 'YYYY-MM-DD'), 'dias_restantes_meta', lc.dias_restantes_meta) ORDER BY lc.categoria)
        FROM lote_categorias lc WHERE lc.lote_id = v_lote.id AND lc.ativo = true
      ), '[]'::jsonb),
      'peso_medio_ponderado', (SELECT CASE WHEN SUM(COALESCE(lc2.quant_atual, lc2.quant_inicial, 0)) > 0 THEN SUM(COALESCE(lc2.quant_atual, lc2.quant_inicial, 0) * COALESCE(lc2.peso_vivo_atual_kg_cab, lc2.peso_entrada_kg_cab, 0)) / SUM(COALESCE(lc2.quant_atual, lc2.quant_inicial, 0)) ELSE NULL END FROM lote_categorias lc2 WHERE lc2.lote_id = v_lote.id AND lc2.ativo = true)
    ) INTO v_estado_atual;
  END IF;

  IF p_secoes IS NULL OR array_position(p_secoes, 'cronologia_categorias') IS NOT NULL THEN
    SELECT jsonb_build_object(
      'transicoes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', t.id, 'data_transicao', to_char(t.data_transicao, 'YYYY-MM-DD'), 'categoria_origem', t.categoria_origem, 'categoria_destino', t.categoria_destino, 'peso_na_transicao_kg', t.peso_na_transicao_kg, 'motivo', t.motivo, 'usuario_id', t.usuario_id, 'snapshot_resumido', jsonb_build_object('peso_vivo_atual', t.snapshot_jsonb -> 'lote_categoria_origem' -> 'peso_vivo_atual_kg_cab', 'quant_atual', t.snapshot_jsonb -> 'lote_categoria_origem' -> 'quant_atual', 'formulacao_id', t.snapshot_jsonb -> 'lote_categoria_origem' -> 'formulacao_id')) ORDER BY t.data_transicao)
        FROM lote_categorias_transicoes t WHERE t.lote_id = v_lote.id
      ), '[]'::jsonb),
      'categorias_encerradas', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', lc.id, 'categoria', lc.categoria, 'quant_inicial', lc.quant_inicial, 'quant_atual', lc.quant_atual, 'peso_entrada_kg', lc.peso_entrada_kg_cab, 'peso_vivo_atual_kg', lc.peso_vivo_atual_kg_cab, 'data_inicio', to_char(lc.created_at, 'YYYY-MM-DD'), 'data_fim', to_char(lc.data_fim, 'YYYY-MM-DD'), 'categoria_origem_id', lc.categoria_origem_id) ORDER BY lc.data_fim)
        FROM lote_categorias lc WHERE lc.lote_id = v_lote.id AND lc.ativo = false AND lc.data_fim IS NOT NULL
      ), '[]'::jsonb)
    ) INTO v_cronologia;
  END IF;

  IF p_secoes IS NULL OR array_position(p_secoes, 'historico_nutricional') IS NOT NULL THEN
    SELECT COALESCE((
      SELECT jsonb_agg(jsonb_build_object('plano_id', pn.id, 'nome', pn.nome, 'formulacao_id', pn.formulacao_id, 'formulacao_nome', f.nome, 'periodo_dias', pn.periodo_dias, 'peso_meta_kg', pn.peso_meta_kg, 'data_inicio', to_char(pn.data_inicio, 'YYYY-MM-DD'), 'data_fim', to_char(pn.data_fim, 'YYYY-MM-DD'), 'ativo', pn.ativo, 'snapshots', COALESCE((SELECT jsonb_agg(jsonb_build_object('duracao_dias', s.duracao_dias, 'ganho_peso_total_kg_cab', s.ganho_peso_total_kg_cab, 'gmd_realizado', s.gmd_realizado, 'gmd_planejado', s.gmd_planejado, 'producao_arroba_lote', s.producao_arroba_lote, 'mortalidade_percent', s.mortalidade_percent, 'motivo_migracao', s.motivo_migracao) ORDER BY s.created_at) FROM planos_nutricionais_snapshots s WHERE s.plano_nutricional_id = pn.id), '[]'::jsonb)) ORDER BY pn.data_inicio)
      FROM planos_nutricionais pn LEFT JOIN formulacoes f ON f.id = pn.formulacao_id WHERE pn.lote_categoria_id IN (SELECT id FROM lote_categorias WHERE lote_id = v_lote.id)
    ), '[]'::jsonb) INTO v_nutricional;
  END IF;

  IF p_secoes IS NULL OR array_position(p_secoes, 'linha_tempo_ocupacao') IS NOT NULL THEN
    SELECT COALESCE((
      SELECT jsonb_agg(row_to_json(x) ORDER BY data_entrada) FROM (
        SELECT 'pasto' AS tipo, ph.pasto_id, p.nome AS pasto_nome, p.area_util_ha, to_char(ph.data_hora_entrada, 'YYYY-MM-DD HH24:MI') AS data_entrada, to_char(ph.data_hora_saida, 'YYYY-MM-DD HH24:MI') AS data_saida, ph.cabecas_entrada, ph.cabecas_saida, ph.peso_vivo_medio_entrada_kg, ph.peso_vivo_medio_saida_kg, ph.taxa_lotacao_ua_ha, ph.meta_intervalo_ocupacao_dias, ph.desvio_tempo_ocupacao_percent
        FROM lote_pasto_historico ph LEFT JOIN pastos p ON p.id = ph.pasto_id WHERE ph.lote_id = v_lote.id
      ) x
    ), '[]'::jsonb) INTO v_ocupacao;
  END IF;

  IF p_secoes IS NULL OR array_position(p_secoes, 'movimentacoes') IS NOT NULL THEN
    SELECT COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'data', to_char(r.data, 'YYYY-MM-DD'), 'tipo', CASE WHEN r.lote_origem_id = v_lote.id THEN 'saida' ELSE 'entrada' END, 'lote_origem_id', r.lote_origem_id, 'lote_origem_nome', lo.nome, 'lote_destino_id', r.lote_destino_id, 'lote_destino_nome', ld.nome, 'numero_cabecas', r.numero_cabecas, 'categoria', r.categoria, 'motivo_movimentacao', r.motivo_movimentacao::text, 'subtipo', r.subtipo::text, 'causa_observacao', r.causa_observacao, 'responsavel', r.responsavel, 'fazenda_destino_id', r.fazenda_destino_id, 'fazenda_destino_nome', fd.nome) ORDER BY r.data DESC)
      FROM registros_movimentacao r LEFT JOIN lotes lo ON lo.id = r.lote_origem_id LEFT JOIN lotes ld ON ld.id = r.lote_destino_id LEFT JOIN fazendas fd ON fd.id = r.fazenda_destino_id
      WHERE r.fazenda_id = p_fazenda_id AND r.deleted_at IS NULL AND (r.lote_origem_id = v_lote.id OR r.lote_destino_id = v_lote.id)
    ), '[]'::jsonb) INTO v_movimentacoes;
  END IF;

  IF p_secoes IS NULL OR array_position(p_secoes, 'mortalidade') IS NOT NULL THEN
    SELECT jsonb_build_object('total', (SELECT count(*) FROM registros_morte WHERE fazenda_id = p_fazenda_id AND lote_id = v_lote.id AND deleted_at IS NULL), 'linhas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'data', to_char(r.data, 'YYYY-MM-DD'), 'causa_morte', r.causa_morte, 'categoria', r.categoria, 'sexo', r.sexo, 'raca', r.raca, 'peso_vivo', r.peso_vivo, 'brinco', r.brinco, 'chip', r.chip, 'nutricao_atual', r.nutricao_atual, 'nutricao_anterior', r.nutricao_anterior, 'nome_usuario', r.nome_usuario) ORDER BY r.data DESC)
      FROM registros_morte r WHERE r.fazenda_id = p_fazenda_id AND r.lote_id = v_lote.id AND r.deleted_at IS NULL
    ), '[]'::jsonb)) INTO v_mortalidade;
  END IF;

  IF p_secoes IS NULL OR array_position(p_secoes, 'reproducao') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM registros_maternidade WHERE fazenda_id = p_fazenda_id AND lote_id = v_lote.id AND deleted_at IS NULL) INTO v_tem_reproducao;
    IF v_lote.sistema_producao IN ('Cria', 'Recria') OR v_tem_reproducao THEN
      SELECT jsonb_build_object('total_partos', (SELECT count(*) FROM registros_maternidade WHERE fazenda_id = p_fazenda_id AND lote_id = v_lote.id AND deleted_at IS NULL), 'linhas', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', r.id, 'data', to_char(r.data, 'YYYY-MM-DD'), 'tipo_parto', r.tipo_parto, 'sexo_cria', r.sexo, 'raca', r.raca, 'peso_cria_kg', r.peso_cria_kg, 'id_brinco_cria', r.id_brinco_cria, 'id_brinco_mae', r.id_brinco_mae, 'escore_matriz', r.escore_matriz, 'docilidade_matriz', r.docilidade_matriz, 'observacao_parto', r.observacao_parto, 'nome_usuario', r.nome_usuario) ORDER BY r.data DESC)
        FROM registros_maternidade r WHERE r.fazenda_id = p_fazenda_id AND r.lote_id = v_lote.id AND r.deleted_at IS NULL
      ), '[]'::jsonb)) INTO v_reproducao;
    ELSE
      v_reproducao := NULL;
    END IF;
  END IF;

  IF p_secoes IS NULL OR array_position(p_secoes, 'consumo_suplementacao') IS NOT NULL THEN
    SELECT COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'data', to_char(r.data, 'YYYY-MM-DD'), 'formulacao', r.formulacao, 'leitura', r.leitura, 'kg_cocho', r.kg_cocho, 'n_cabecas', r.n_cabecas, 'peso_vivo_kg', r.peso_vivo_kg, 'consumo_medio_geral_percent_pv', r.consumo_medio_geral_percent_pv, 'consumo_medio_geral_kg_ms', r.consumo_medio_geral_kg_ms, 'custo_medio_reais_cab_dia', r.custo_medio_reais_cab_dia, 'escore_fezes', r.escore_fezes, 'tratador', r.tratador) ORDER BY r.data DESC)
      FROM registros_suplementacao r WHERE r.fazenda_id = p_fazenda_id AND r.lote_id = v_lote.id AND r.deleted_at IS NULL
    ), '[]'::jsonb) INTO v_consumo;
  END IF;

  IF p_secoes IS NULL OR array_position(p_secoes, 'individuos') IS NOT NULL THEN
    SELECT COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', i.id, 'id_manejo', i.id_manejo, 'id_brinco', i.id_brinco, 'id_chip', i.id_chip, 'sexo', i.sexo, 'categoria', i.categoria, 'raca', i.raca, 'data_nascimento', to_char(i.data_nascimento, 'YYYY-MM-DD'), 'peso_atual_kg', i.peso_atual_kg, 'peso_meta_kg', i.peso_meta_kg, 'data_entrada_fazenda', to_char(i.data_entrada_fazenda, 'YYYY-MM-DD'), 'pv_entrada_kg', i.pv_entrada_kg, 'data_desmama', to_char(i.data_desmama, 'YYYY-MM-DD'), 'peso_desmama_kg', i.peso_desmama_kg, 'status', i.status, 'numero_partos', i.numero_partos) ORDER BY i.id_brinco)
      FROM individuos i WHERE i.fazenda_id = p_fazenda_id AND i.lote_atual = v_lote.id AND i.deleted_at IS NULL
    ), '[]'::jsonb) INTO v_individuos;
  END IF;

  IF p_secoes IS NULL OR array_position(p_secoes, 'indicadores_consolidados') IS NOT NULL THEN
    SELECT jsonb_build_object(
      'idade_lote_dias', CASE WHEN (SELECT min(data_hora_entrada) FROM lote_pasto_historico WHERE lote_id = v_lote.id) IS NOT NULL THEN GREATEST(0, (now()::date - (SELECT min(data_hora_entrada)::date FROM lote_pasto_historico WHERE lote_id = v_lote.id))) ELSE GREATEST(0, (now()::date - v_lote.created_at::date)) END,
      'cabecas_atual', (SELECT COALESCE(SUM(COALESCE(lc.quant_atual, lc.quant_inicial, 0)), 0) FROM lote_categorias lc WHERE lc.lote_id = v_lote.id AND lc.ativo = true),
      'peso_medio_atual_kg', (SELECT CASE WHEN SUM(COALESCE(lc.quant_atual, lc.quant_inicial, 0)) > 0 THEN SUM(COALESCE(lc.quant_atual, lc.quant_inicial, 0) * COALESCE(lc.peso_vivo_atual_kg_cab, lc.peso_entrada_kg_cab, 0)) / SUM(COALESCE(lc.quant_atual, lc.quant_inicial, 0)) ELSE NULL END FROM lote_categorias lc WHERE lc.lote_id = v_lote.id AND lc.ativo = true),
      'peso_entrada_medio_kg', v_lote.peso_entrada_kg_cab,
      'ganho_peso_total_kg_cab', (SELECT CASE WHEN SUM(COALESCE(lc.quant_atual, lc.quant_inicial, 0)) > 0 AND v_lote.peso_entrada_kg_cab IS NOT NULL THEN round((SUM(COALESCE(lc.quant_atual, lc.quant_inicial, 0) * COALESCE(lc.peso_vivo_atual_kg_cab, lc.peso_entrada_kg_cab, 0)) / SUM(COALESCE(lc.quant_atual, lc.quant_inicial, 0))) - v_lote.peso_entrada_kg_cab, 2) ELSE NULL END FROM lote_categorias lc WHERE lc.lote_id = v_lote.id AND lc.ativo = true),
      'total_mortes', (SELECT count(*) FROM registros_morte WHERE fazenda_id = p_fazenda_id AND lote_id = v_lote.id AND deleted_at IS NULL),
      'total_saidas', (SELECT count(*) FROM registros_movimentacao WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND lote_origem_id = v_lote.id),
      'total_entradas', (SELECT count(*) FROM registros_movimentacao WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND lote_destino_id = v_lote.id),
      'total_partos', (SELECT count(*) FROM registros_maternidade WHERE fazenda_id = p_fazenda_id AND lote_id = v_lote.id AND deleted_at IS NULL),
      'total_consumo_registros', (SELECT count(*) FROM registros_suplementacao WHERE fazenda_id = p_fazenda_id AND lote_id = v_lote.id AND deleted_at IS NULL),
      'total_pastos_ocupados', (SELECT count(DISTINCT pasto_id) FROM lote_pasto_historico WHERE lote_id = v_lote.id AND pasto_id IS NOT NULL),
      'total_transicoes_categoria', (SELECT count(*) FROM lote_categorias_transicoes WHERE lote_id = v_lote.id),
      'ativo', v_lote.ativo
    ) INTO v_indicadores;
  END IF;

  v_result := jsonb_build_object('fazenda_id', p_fazenda_id, 'lote_id', p_lote_id, 'success', true);
  IF v_cadastro IS NOT NULL THEN v_result := v_result || jsonb_build_object('cadastro', v_cadastro); END IF;
  IF v_estado_atual IS NOT NULL THEN v_result := v_result || jsonb_build_object('estado_atual', v_estado_atual); END IF;
  IF v_cronologia IS NOT NULL THEN v_result := v_result || jsonb_build_object('cronologia_categorias', v_cronologia); END IF;
  IF v_nutricional IS NOT NULL THEN v_result := v_result || jsonb_build_object('historico_nutricional', v_nutricional); END IF;
  IF v_ocupacao IS NOT NULL THEN v_result := v_result || jsonb_build_object('linha_tempo_ocupacao', v_ocupacao); END IF;
  IF v_movimentacoes IS NOT NULL THEN v_result := v_result || jsonb_build_object('movimentacoes', v_movimentacoes); END IF;
  IF v_mortalidade IS NOT NULL THEN v_result := v_result || jsonb_build_object('mortalidade', v_mortalidade); END IF;
  IF v_reproducao IS NOT NULL THEN v_result := v_result || jsonb_build_object('reproducao', v_reproducao); END IF;
  IF v_consumo IS NOT NULL THEN v_result := v_result || jsonb_build_object('consumo_suplementacao', v_consumo); END IF;
  IF v_individuos IS NOT NULL THEN v_result := v_result || jsonb_build_object('individuos', v_individuos); END IF;
  IF v_indicadores IS NOT NULL THEN v_result := v_result || jsonb_build_object('indicadores_consolidados', v_indicadores); END IF;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_controller_email_fazenda_grupo(p_fazenda_origem_id uuid, p_fazenda_destino_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_grupo_origem uuid;
  v_grupo_destino uuid;
  v_email text;
BEGIN
  -- Buscar grupo da fazenda de origem
  SELECT grupo_id INTO v_grupo_origem
  FROM public.fazendas
  WHERE id = p_fazenda_origem_id AND ativo = true;

  IF v_grupo_origem IS NULL THEN
    RETURN NULL;
  END IF;

  -- Buscar grupo da fazenda de destino
  SELECT grupo_id INTO v_grupo_destino
  FROM public.fazendas
  WHERE id = p_fazenda_destino_id AND ativo = true;

  -- Validar que estao no mesmo grupo
  IF v_grupo_destino IS NULL OR v_grupo_destino <> v_grupo_origem THEN
    RETURN NULL;
  END IF;

  -- Buscar o email do controller da fazenda de destino
  SELECT u.email INTO v_email
  FROM public.usuario_fazenda uf
  JOIN public.usuarios u ON u.id = uf.usuario_id
  WHERE uf.fazenda_id = p_fazenda_destino_id
    AND uf.ativo = true
    AND u.ativo = true
  LIMIT 1;

  RETURN v_email;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_rastreio_cadernetas(p_fazenda_id uuid, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date)
 RETURNS TABLE(nome_usuario text, caderneta text, total_registros bigint, registros_ativos bigint, registros_deletados bigint, primeiro_registro timestamp with time zone, ultimo_registro timestamp with time zone, dias_ativos integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(NULLIF(TRIM(r.nome_usuario), ''), '(sem nome)') AS nome_usuario,
    r.caderneta,
    COUNT(*) AS total_registros,
    COUNT(*) FILTER (WHERE r.deleted_at IS NULL) AS registros_ativos,
    COUNT(*) FILTER (WHERE r.deleted_at IS NOT NULL) AS registros_deletados,
    MIN(r.created_at) AS primeiro_registro,
    MAX(r.created_at) AS ultimo_registro,
    COUNT(DISTINCT (r.created_at AT TIME ZONE 'America/Cuiaba')::date)::integer AS dias_ativos
  FROM public.v_registros_unificado r
  WHERE r.fazenda_id = p_fazenda_id
    AND r.deleted_at IS NULL
    AND COALESCE(NULLIF(TRIM(r.nome_usuario), ''), '(sem nome)') NOT ILIKE '%peao%'
    AND (p_data_inicio IS NULL OR r.created_at >= p_data_inicio)
    AND (p_data_fim IS NULL OR r.created_at < (p_data_fim + interval '1 day'))
  GROUP BY COALESCE(NULLIF(TRIM(r.nome_usuario), ''), '(sem nome)'), r.caderneta
  ORDER BY COALESCE(NULLIF(TRIM(r.nome_usuario), ''), '(sem nome)'), COUNT(*) DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_rastreio_cadernetas_detalhe(p_fazenda_id uuid, p_nome_usuario text DEFAULT NULL::text, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date)
 RETURNS TABLE(nome_usuario text, caderneta text, dia date, total bigint, ativos bigint, deletados bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(NULLIF(TRIM(r.nome_usuario), ''), '(sem nome)') AS nome_usuario,
    r.caderneta,
    (r.created_at AT TIME ZONE 'America/Cuiaba')::date AS dia,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE r.deleted_at IS NULL) AS ativos,
    COUNT(*) FILTER (WHERE r.deleted_at IS NOT NULL) AS deletados
  FROM public.v_registros_unificado r
  WHERE r.fazenda_id = p_fazenda_id
    AND r.deleted_at IS NULL
    AND COALESCE(NULLIF(TRIM(r.nome_usuario), ''), '(sem nome)') NOT ILIKE '%peao%'
    AND (p_nome_usuario IS NULL OR COALESCE(NULLIF(TRIM(r.nome_usuario), ''), '(sem nome)') = p_nome_usuario)
    AND (p_data_inicio IS NULL OR r.created_at >= p_data_inicio)
    AND (p_data_fim IS NULL OR r.created_at < (p_data_fim + interval '1 day'))
  GROUP BY COALESCE(NULLIF(TRIM(r.nome_usuario), ''), '(sem nome)'), r.caderneta, dia
  ORDER BY dia, nome_usuario, caderneta;
$function$;

CREATE OR REPLACE FUNCTION public.get_rastreio_usuarios(p_fazenda_id uuid, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date)
 RETURNS TABLE(nome_usuario text, total_registros bigint, cadernetas_usadas integer, primeiro_registro timestamp with time zone, ultimo_registro timestamp with time zone, dias_ativos integer, ultimo_dia_ativo date)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    usuario.nome_usuario,
    SUM(usuario.total_por_caderneta)::bigint AS total_registros,
    COUNT(*)::integer AS cadernetas_usadas,
    MIN(usuario.primeiro_registro) AS primeiro_registro,
    MAX(usuario.ultimo_registro) AS ultimo_registro,
    SUM(usuario.dias_por_caderneta)::integer AS dias_ativos,
    MAX(usuario.ultimo_dia) AS ultimo_dia_ativo
  FROM (
    SELECT
      COALESCE(NULLIF(TRIM(r.nome_usuario), ''), '(sem nome)') AS nome_usuario,
      r.caderneta,
      COUNT(*) AS total_por_caderneta,
      MIN(r.created_at) AS primeiro_registro,
      MAX(r.created_at) AS ultimo_registro,
      COUNT(DISTINCT (r.created_at AT TIME ZONE 'America/Cuiaba')::date)::integer AS dias_por_caderneta,
      MAX((r.created_at AT TIME ZONE 'America/Cuiaba')::date) AS ultimo_dia
    FROM public.v_registros_unificado r
    WHERE r.fazenda_id = p_fazenda_id
      AND r.deleted_at IS NULL
      AND COALESCE(NULLIF(TRIM(r.nome_usuario), ''), '(sem nome)') NOT ILIKE '%peao%'
      AND (p_data_inicio IS NULL OR r.created_at >= p_data_inicio)
      AND (p_data_fim IS NULL OR r.created_at < (p_data_fim + interval '1 day'))
    GROUP BY COALESCE(NULLIF(TRIM(r.nome_usuario), ''), '(sem nome)'), r.caderneta
  ) usuario
  GROUP BY usuario.nome_usuario
  ORDER BY total_registros DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_sessoes_abertas_by_fazenda(p_fazenda_id uuid)
 RETURNS TABLE(id uuid, atividade_funcionario_id uuid, inicio_at timestamp with time zone, fim_at timestamp with time zone, duracao_segundos integer, trabalhada boolean, motivo_pausa text, created_at timestamp with time zone, funcionario_nome text, funcionario_id uuid, atividade_id uuid, atividade_titulo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.atividade_funcionario_id,
    s.inicio_at,
    s.fim_at,
    s.duracao_segundos,
    s.trabalhada,
    s.motivo_pausa,
    s.created_at,
    f.nome AS funcionario_nome,
    af.funcionario_id,
    a.id AS atividade_id,
    a.titulo AS atividade_titulo
  FROM atividade_sessoes s
  JOIN atividade_funcionarios af ON af.id = s.atividade_funcionario_id
  JOIN atividades a ON a.id = af.atividade_id
  JOIN funcionarios f ON f.id = af.funcionario_id
  WHERE a.fazenda_id = p_fazenda_id
    AND s.fim_at IS NULL
  ORDER BY s.inicio_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_imprevistos_recentes_by_fazenda(p_fazenda_id uuid, p_data_inicio timestamp with time zone)
 RETURNS TABLE(id uuid, atividade_funcionario_id uuid, tipo text, descricao text, ocorrido_at timestamp with time zone, impacto_minutos integer, created_at timestamp with time zone, funcionario_nome text, funcionario_id uuid, atividade_id uuid, atividade_titulo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.atividade_funcionario_id,
    i.tipo,
    i.descricao,
    i.ocorrido_at,
    i.impacto_minutos,
    i.created_at,
    f.nome AS funcionario_nome,
    af.funcionario_id,
    a.id AS atividade_id,
    a.titulo AS atividade_titulo
  FROM atividade_imprevistos i
  JOIN atividade_funcionarios af ON af.id = i.atividade_funcionario_id
  JOIN atividades a ON a.id = af.atividade_id
  JOIN funcionarios f ON f.id = af.funcionario_id
  WHERE a.fazenda_id = p_fazenda_id
    AND i.ocorrido_at >= p_data_inicio
  ORDER BY i.ocorrido_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_atividades_funcionario(p_fazenda_id uuid, p_funcionario_id uuid)
 RETURNS TABLE(id uuid, atividade_id uuid, status_individual text, inicio_at timestamp with time zone, fim_at timestamp with time zone, detalhamento text, justificativa text, justificada_at timestamp with time zone, tempo_gasto_segundos integer, titulo text, descricao text, local text, data_inicio date, data_fim date, prioridade integer, status text, nao_prevista boolean, atrasada boolean, setor_nome text, foto_url text, latitude double precision, longitude double precision, gps_accuracy double precision)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT
    af.id, af.atividade_id, af.status_individual, af.inicio_at, af.fim_at,
    af.detalhamento, af.justificativa, af.justificada_at, af.tempo_gasto_segundos,
    a.titulo, a.descricao, a.local, a.data_inicio, a.data_fim,
    a.prioridade, a.status, a.nao_prevista, a.atrasada,
    s.nome AS setor_nome,
    af.foto_url, af.latitude, af.longitude, af.gps_accuracy
  FROM atividade_funcionarios af
  JOIN atividades a ON a.id = af.atividade_id
  LEFT JOIN setores s ON s.id = a.setor_id
  WHERE a.fazenda_id = p_fazenda_id
    AND af.funcionario_id = p_funcionario_id
    AND a.deleted_at IS NULL
  ORDER BY a.data_inicio DESC, a.prioridade ASC;
$function$;

-- Reabre (ACL original: EXECUTE implícito para PUBLIC)
GRANT EXECUTE ON FUNCTION public.get_admin_evolution(timestamp with time zone) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_registros_atividades(text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obter_execucoes_rotina(uuid,date,date,uuid,text,text,integer,integer) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resumo_execucoes_rotina(uuid,date,date,uuid,text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ia_monitoramento() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_gado_stats(uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_activities(uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_system_health() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_audit_log(uuid,uuid,text,text,timestamp with time zone,timestamp with time zone,integer,integer) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_farm_usage_metrics() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_lotes_para_relatorio(uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_relatorio_lote_ciclo_vida(uuid,uuid,text[]) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_controller_email_fazenda_grupo(uuid,uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_rastreio_cadernetas(uuid,date,date) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_rastreio_cadernetas_detalhe(uuid,text,date,date) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_rastreio_usuarios(uuid,date,date) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sessoes_abertas_by_fazenda(uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_imprevistos_recentes_by_fazenda(uuid,timestamp with time zone) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_atividades_funcionario(uuid,uuid) TO PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.guard_fazenda(uuid);
DROP FUNCTION IF EXISTS public.guard_admin();
DROP FUNCTION IF EXISTS public.guard_super_admin();
