-- Rollback de 20261112270000_get_audit_log_paginacao_real.sql
-- Restaura a definicao anterior (LIMIT/OFFSET fora do jsonb_agg, tabelasAuditadas sem filtro).
-- ATENCAO: reintroduz o comportamento que agregava todas as linhas a cada abertura da tela.

CREATE OR REPLACE FUNCTION public.get_audit_log(
  p_fazenda_id uuid DEFAULT NULL::uuid,
  p_usuario_id uuid DEFAULT NULL::uuid,
  p_tabela text DEFAULT NULL::text,
  p_operacao text DEFAULT NULL::text,
  p_data_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_data_fim timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_limite integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF p_fazenda_id IS NULL THEN PERFORM public.guard_admin(); ELSE PERFORM public.guard_fazenda(p_fazenda_id); END IF;
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
