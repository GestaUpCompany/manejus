-- ============================================================================
-- Fase B / Lote 1, passo 1 (aditivo): RPC do relatório público de atividades
-- ============================================================================
-- Contexto: a página pública do relatório de atividades (RelatorioAtividadesPublico.tsx, link por token,
-- em uso por 6 fazendas) lê atividades, atividade_funcionarios, atividade_imprevistos, funcionarios e
-- setores DIRETAMENTE como `anon`, porque as policies dessas tabelas são abertas. Para fechar as policies
-- (passo 2) sem quebrar o link público, os dados passam a vir de uma RPC que valida o token, como já
-- fazem get_dados_relatorio_{abastecimento,clima,consumo,estoque,morte,pastagens,rodeio,tratos}.
--
-- Esta migration é ADITIVA (não altera policies nem funções existentes) e deve ser aplicada ANTES do
-- deploy do Painel que passa a usar a RPC. As policies só são fechadas no passo 2, depois do deploy.
--
-- Contrato: get_dados_relatorio_atividades(p_token, p_data_inicio, p_data_fim, p_data_inicio_ant,
-- p_data_fim_ant) -> jsonb { atividades, atividades_anterior, imprevistos, funcionarios, setores }
-- no MESMO formato aninhado que o PostgREST devolvia (setor:{nome}, funcionarios:[{... funcionario:{nome}}],
-- atividade_funcionario:{funcionario:{nome}, atividade:{titulo,fazenda_id}}), para o front só trocar a fonte.
-- Validação do token igual às demais: tipo='atividades', ativo, não expirado; a fazenda é a do TOKEN.
-- Intervalo de imprevistos interpretado em America/Cuiaba (o front antes mandava "YYYY-MM-DDT00:00:00"
-- sem fuso, lido em UTC).
-- Rollback: supabase/rollbacks/20261007270000_fase_b1a_rpc_relatorio_publico_atividades_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_atividades(
  p_token uuid,
  p_data_inicio date,
  p_data_fim date,
  p_data_inicio_ant date DEFAULT NULL,
  p_data_fim_ant date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_fazenda_id uuid;
  v_ativo boolean;
  v_expira timestamptz;
  v_atividades jsonb;
  v_atividades_ant jsonb;
  v_imprevistos jsonb;
  v_funcionarios jsonb;
  v_setores jsonb;
BEGIN
  SELECT fazenda_id, ativo, expira_em
  INTO v_fazenda_id, v_ativo, v_expira
  FROM public.relatorios_publicos
  WHERE id = p_token AND tipo = 'atividades';

  IF NOT FOUND OR v_ativo = false OR (v_expira IS NOT NULL AND v_expira < now()) THEN
    RAISE EXCEPTION 'Token invalido ou expirado';
  END IF;

  SELECT COALESCE(jsonb_agg(x.j ORDER BY x.di DESC), '[]'::jsonb) INTO v_atividades
  FROM (
    SELECT a.data_inicio AS di,
      jsonb_build_object(
        'id', a.id, 'titulo', a.titulo, 'descricao', a.descricao, 'local', a.local,
        'data_inicio', a.data_inicio, 'data_fim', a.data_fim, 'prioridade', a.prioridade,
        'status', a.status, 'atrasada', a.atrasada, 'nao_prevista', a.nao_prevista,
        'setor', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('nome', s.nome) END,
        'funcionarios', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', af.id, 'funcionario_id', af.funcionario_id, 'status_individual', af.status_individual,
            'tempo_gasto_segundos', af.tempo_gasto_segundos, 'inicio_at', af.inicio_at, 'fim_at', af.fim_at,
            'funcionario', jsonb_build_object('nome', f.nome)))
          FROM public.atividade_funcionarios af
          LEFT JOIN public.funcionarios f ON f.id = af.funcionario_id
          WHERE af.atividade_id = a.id), '[]'::jsonb)
      ) AS j
    FROM public.atividades a
    LEFT JOIN public.setores s ON s.id = a.setor_id
    WHERE a.fazenda_id = v_fazenda_id AND a.deleted_at IS NULL
      AND a.data_inicio >= p_data_inicio AND a.data_inicio <= p_data_fim
  ) x;

  IF p_data_inicio_ant IS NOT NULL AND p_data_fim_ant IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(x.j ORDER BY x.di DESC), '[]'::jsonb) INTO v_atividades_ant
    FROM (
      SELECT a.data_inicio AS di,
        jsonb_build_object(
          'id', a.id, 'titulo', a.titulo, 'descricao', a.descricao, 'local', a.local,
          'data_inicio', a.data_inicio, 'data_fim', a.data_fim, 'prioridade', a.prioridade,
          'status', a.status, 'atrasada', a.atrasada, 'nao_prevista', a.nao_prevista,
          'setor', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('nome', s.nome) END,
          'funcionarios', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', af.id, 'funcionario_id', af.funcionario_id, 'status_individual', af.status_individual,
              'tempo_gasto_segundos', af.tempo_gasto_segundos, 'inicio_at', af.inicio_at, 'fim_at', af.fim_at,
              'funcionario', jsonb_build_object('nome', f.nome)))
            FROM public.atividade_funcionarios af
            LEFT JOIN public.funcionarios f ON f.id = af.funcionario_id
            WHERE af.atividade_id = a.id), '[]'::jsonb)
        ) AS j
      FROM public.atividades a
      LEFT JOIN public.setores s ON s.id = a.setor_id
      WHERE a.fazenda_id = v_fazenda_id AND a.deleted_at IS NULL
        AND a.data_inicio >= p_data_inicio_ant AND a.data_inicio <= p_data_fim_ant
    ) x;
  ELSE
    v_atividades_ant := '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id, 'tipo', i.tipo, 'descricao', i.descricao, 'ocorrido_at', i.ocorrido_at,
    'impacto_minutos', i.impacto_minutos,
    'atividade_funcionario', jsonb_build_object(
      'funcionario', jsonb_build_object('nome', f.nome),
      'atividade', jsonb_build_object('titulo', a.titulo, 'fazenda_id', a.fazenda_id))
  ) ORDER BY i.ocorrido_at DESC), '[]'::jsonb) INTO v_imprevistos
  FROM public.atividade_imprevistos i
  JOIN public.atividade_funcionarios af ON af.id = i.atividade_funcionario_id
  JOIN public.atividades a ON a.id = af.atividade_id
  LEFT JOIN public.funcionarios f ON f.id = af.funcionario_id
  WHERE a.fazenda_id = v_fazenda_id
    AND i.ocorrido_at >= p_data_inicio::timestamp
    AND i.ocorrido_at <= (p_data_fim::timestamp + interval '23 hours 59 minutes 59 seconds');

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome) ORDER BY f.nome), '[]'::jsonb)
  INTO v_funcionarios
  FROM public.funcionarios f
  WHERE f.fazenda_id = v_fazenda_id AND f.ativo = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('nome', s.nome) ORDER BY s.nome), '[]'::jsonb)
  INTO v_setores
  FROM public.setores s
  WHERE s.fazenda_id = v_fazenda_id;

  RETURN jsonb_build_object(
    'atividades', v_atividades,
    'atividades_anterior', v_atividades_ant,
    'imprevistos', v_imprevistos,
    'funcionarios', v_funcionarios,
    'setores', v_setores
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dados_relatorio_atividades(uuid, date, date, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_atividades(uuid, date, date, date, date) TO anon, authenticated, service_role;
