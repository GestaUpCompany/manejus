-- ============================================================================
-- Sanidade: notificação semanal de pendências sanitárias
-- ============================================================================
-- Uma notificação-resumo por fazenda e tipo de pendência para cada usuário ativo da fazenda (não uma por animal), no padrão
-- notificar_*: dose atrasada, dose nos próximos 15 dias e carência que termina nos próximos 7 dias. Mesmas regras da página
-- Manejo Sanitário do painel. Se já existe uma notificação não lida do mesmo tipo para o usuário, ela é atualizada (nova contagem)
-- em vez de criar outra: sem acúmulo semana a semana.
--   * "Dose": vale a aplicação mais recente de cada produto em cada alvo (animal, ou lote + categoria); só conta se tem
--     proxima_aplicacao_em (intervalo informado).
--   * p_fazenda_id (opcional) limita a uma fazenda (para teste); o cron chama sem argumento, para todas.
--   * só olha aplicacoes_sanitarias: fazendas que não lançam aplicações não recebem nada.
--   * agendada às segundas, 08:40 (hora do servidor, pg_cron). Função de cron: EXECUTE só para service_role.
-- Rollback: supabase/rollbacks/20261016300000_notificar_pendencias_sanitarias_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notificar_pendencias_sanitarias(p_fazenda_id uuid DEFAULT NULL)
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
  v_total integer := 0;
BEGIN
  FOR r IN
    WITH ultimas AS (
      SELECT DISTINCT ON (a.fazenda_id, COALESCE(a.individuo_id::text, a.lote_id::text || '|' || COALESCE(lower(btrim(a.categoria)), '')),
                          lower(btrim(a.medicamento_nome)))
             a.fazenda_id, a.proxima_aplicacao_em
      FROM public.aplicacoes_sanitarias a
      WHERE a.deleted_at IS NULL
        AND (a.individuo_id IS NOT NULL OR a.lote_id IS NOT NULL)
        AND (p_fazenda_id IS NULL OR a.fazenda_id = p_fazenda_id)
      ORDER BY a.fazenda_id, COALESCE(a.individuo_id::text, a.lote_id::text || '|' || COALESCE(lower(btrim(a.categoria)), '')),
               lower(btrim(a.medicamento_nome)), a.data DESC, a.created_at DESC
    ),
    pendentes AS (
      SELECT u.fazenda_id, 'dose_atrasada'::text AS tipo FROM ultimas u
      WHERE u.proxima_aplicacao_em IS NOT NULL AND u.proxima_aplicacao_em < v_hoje
      UNION ALL
      SELECT u.fazenda_id, 'dose_proxima' FROM ultimas u
      WHERE u.proxima_aplicacao_em BETWEEN v_hoje AND v_hoje + 15
      UNION ALL
      SELECT a.fazenda_id, 'carencia_termina'
      FROM public.aplicacoes_sanitarias a
      WHERE a.deleted_at IS NULL AND a.liberacao_abate_em BETWEEN v_hoje + 1 AND v_hoje + 7
        AND (a.individuo_id IS NOT NULL OR a.lote_id IS NOT NULL)
        AND (p_fazenda_id IS NULL OR a.fazenda_id = p_fazenda_id)
    )
    SELECT p.fazenda_id, p.tipo, count(*)::integer AS n FROM pendentes p GROUP BY p.fazenda_id, p.tipo
  LOOP
    v_titulo := CASE r.tipo
      WHEN 'dose_atrasada' THEN 'Sanidade: doses atrasadas'
      WHEN 'dose_proxima' THEN 'Sanidade: doses nos próximos 15 dias'
      ELSE 'Sanidade: carência terminando'
    END;
    v_mensagem := CASE r.tipo
      WHEN 'dose_atrasada' THEN format('%s aplicação(ões) com a próxima dose vencida e sem nova aplicação registrada.', r.n)
      WHEN 'dose_proxima' THEN format('%s aplicação(ões) com a próxima dose prevista para os próximos 15 dias.', r.n)
      ELSE format('%s aplicação(ões) com a carência de abate terminando nos próximos 7 dias.', r.n)
    END;

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
        VALUES (v_usuario, r.fazenda_id, 'warning', v_titulo, v_mensagem, '/controller/manejo-sanitario', 'Ver pendências', false,
                jsonb_build_object('tipo_pendencia', r.tipo, 'quantidade', r.n), now(), now());
      ELSE
        UPDATE public.notificacoes
        SET mensagem = v_mensagem, dados_jsonb = jsonb_build_object('tipo_pendencia', r.tipo, 'quantidade', r.n), updated_at = now()
        WHERE id = v_existente;
      END IF;
      v_total := v_total + 1;
    END LOOP;
  END LOOP;

  RETURN v_total;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.notificar_pendencias_sanitarias(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notificar_pendencias_sanitarias(uuid) TO service_role;

SELECT cron.schedule('notificar_pendencias_sanitarias', '40 8 * * 1', 'SELECT public.notificar_pendencias_sanitarias();');
