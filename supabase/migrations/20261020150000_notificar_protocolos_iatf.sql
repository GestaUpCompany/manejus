-- ============================================================================
-- IATF (C2): notificação diária dos passos de protocolo atrasados e do dia
-- ============================================================================
-- Uma notificação-resumo por fazenda e tipo para cada usuário ativo da fazenda (não uma por tarefa), no padrão notificar_*:
--   * iatf_atrasado: tarefas pendentes de lotes de protocolo "Em andamento" com data prevista anterior a hoje;
--   * iatf_hoje:     tarefas pendentes com data prevista hoje.
-- Se já existe uma notificação não lida do mesmo tipo para o usuário, ela é atualizada (nova contagem) em vez de criar outra.
-- Como o resultado muda todo dia, as notificações NÃO lidas de IATF geradas em dias anteriores e que deixaram de valer
-- (passo feito, lote concluído/cancelado) são apagadas (soft-delete); as lidas ficam.
--   * p_fazenda_id (opcional) limita a uma fazenda (para teste); o cron chama sem argumento, para todas.
--   * só olha lotes de protocolo, que só existem onde o recurso foi usado; fazendas sem lote não recebem nada.
--   * agendada todos os dias às 07:30 (hora do servidor, pg_cron).
--   * função de cron: sem EXECUTE para PUBLIC/anon/authenticated (padrão da Fase 5.1); só service_role e o dono.
-- Rollback: supabase/rollbacks/20261020150000_notificar_protocolos_iatf_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notificar_protocolos_iatf(p_fazenda_id uuid DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  r record;
  v_usuario uuid;
  v_titulo text;
  v_mensagem text;
  v_existente uuid;
  v_dados jsonb;
  v_total integer := 0;
BEGIN
  FOR r IN
    SELECT t.fazenda_id,
           CASE WHEN t.data_prevista < v_hoje THEN 'iatf_atrasado' ELSE 'iatf_hoje' END AS tipo,
           count(*)::integer AS n_tarefas,
           count(DISTINCT t.lote_protocolo_id)::integer AS n_lotes
    FROM public.lotes_protocolo_iatf_tarefas t
    JOIN public.lotes_protocolo_iatf l ON l.id = t.lote_protocolo_id
    WHERE t.feita_em IS NULL AND t.data_prevista <= v_hoje
      AND l.status = 'Em andamento' AND l.deleted_at IS NULL
      AND (p_fazenda_id IS NULL OR t.fazenda_id = p_fazenda_id)
    GROUP BY t.fazenda_id, CASE WHEN t.data_prevista < v_hoje THEN 'iatf_atrasado' ELSE 'iatf_hoje' END
  LOOP
    v_titulo := CASE r.tipo
      WHEN 'iatf_atrasado' THEN 'IATF: passos de protocolo atrasados'
      ELSE 'IATF: passos de protocolo para hoje'
    END;
    v_mensagem := CASE r.tipo
      WHEN 'iatf_atrasado' THEN format('%s passo(s) de protocolo de IATF atrasado(s), em %s lote(s) de protocolo.', r.n_tarefas, r.n_lotes)
      ELSE format('%s passo(s) de protocolo de IATF previsto(s) para hoje, em %s lote(s) de protocolo.', r.n_tarefas, r.n_lotes)
    END;
    v_dados := jsonb_build_object('tipo_pendencia', r.tipo, 'quantidade', r.n_tarefas, 'lotes', r.n_lotes, 'gerada_em', v_hoje);

    FOR v_usuario IN
      SELECT uf.usuario_id
      FROM public.usuario_fazenda uf
      JOIN public.usuarios u ON u.id = uf.usuario_id
      WHERE uf.fazenda_id = r.fazenda_id AND uf.ativo = true AND u.ativo = true
    LOOP
      v_existente := NULL;
      SELECT n.id INTO v_existente
      FROM public.notificacoes n
      WHERE n.usuario_id = v_usuario AND n.fazenda_id = r.fazenda_id AND n.titulo = v_titulo
        AND n.lida = false AND n.deleted_at IS NULL
      LIMIT 1;

      IF v_existente IS NULL THEN
        INSERT INTO public.notificacoes (usuario_id, fazenda_id, tipo, titulo, mensagem, acao_url, acao_label, lida, dados_jsonb, created_at, updated_at)
        VALUES (v_usuario, r.fazenda_id, CASE WHEN r.tipo = 'iatf_atrasado' THEN 'warning' ELSE 'info' END, v_titulo, v_mensagem,
                '/controller/protocolos-iatf', 'Ver protocolos', false, v_dados, now(), now());
      ELSE
        UPDATE public.notificacoes
        SET mensagem = v_mensagem, dados_jsonb = v_dados, updated_at = now()
        WHERE id = v_existente;
      END IF;
      v_total := v_total + 1;
    END LOOP;
  END LOOP;

  -- Limpeza: não lidas de IATF que não foram atualizadas hoje já não valem (o passo foi feito ou o lote encerrou)
  UPDATE public.notificacoes n
  SET deleted_at = now(), updated_at = now()
  WHERE n.titulo IN ('IATF: passos de protocolo atrasados', 'IATF: passos de protocolo para hoje')
    AND n.lida = false AND n.deleted_at IS NULL
    AND COALESCE(n.dados_jsonb ->> 'gerada_em', '') <> v_hoje::text
    AND (p_fazenda_id IS NULL OR n.fazenda_id = p_fazenda_id);

  RETURN v_total;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.notificar_protocolos_iatf(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notificar_protocolos_iatf(uuid) TO service_role;

SELECT cron.schedule('notificar_protocolos_iatf', '30 7 * * *', 'SELECT public.notificar_protocolos_iatf();');
