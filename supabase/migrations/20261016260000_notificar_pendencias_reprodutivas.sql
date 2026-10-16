-- ============================================================================
-- Reprodução 4c: notificação semanal de pendências reprodutivas
-- ============================================================================
-- Uma notificação-resumo por fazenda e tipo de pendência para cada usuário ativo da fazenda (não uma por fêmea), no padrão
-- notificar_*: parto atrasado, parto nos próximos 30 dias, coberta há 60 dias ou mais sem diagnóstico e vazia há mais de
-- 120 dias. As mesmas regras da tela Reprodução do painel (pendenciasDaFemea). Se já existe uma notificação não lida do
-- mesmo tipo para o usuário, ela é atualizada (nova contagem) em vez de criar outra: sem acúmulo semana a semana.
--   * p_fazenda_id (opcional) limita a uma fazenda (para teste); o cron chama sem argumento, para todas.
--   * só olha v_status_reprodutivo, que só tem fêmeas vivas com eventos/partos; fazendas sem eventos reprodutivos não recebem nada.
--   * agendada às segundas, 08:30 (hora do servidor, pg_cron).
--   * função de cron: sem EXECUTE para PUBLIC/anon/authenticated (padrão da Fase 5.1); só service_role e o dono.
-- Rollback: supabase/rollbacks/20261016260000_notificar_pendencias_reprodutivas_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notificar_pendencias_reprodutivas(p_fazenda_id uuid DEFAULT NULL)
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
    SELECT p.fazenda_id, p.tipo, count(*)::integer AS n
    FROM (
      SELECT s.fazenda_id, 'parto_atrasado'::text AS tipo
      FROM public.v_status_reprodutivo s
      WHERE s.status_reprodutivo IN ('Prenha', 'Coberta') AND s.previsao_parto < v_hoje
      UNION ALL
      SELECT s.fazenda_id, 'parto_proximo'
      FROM public.v_status_reprodutivo s
      WHERE s.status_reprodutivo IN ('Prenha', 'Coberta') AND s.previsao_parto BETWEEN v_hoje AND v_hoje + 30
      UNION ALL
      SELECT s.fazenda_id, 'sem_diagnostico'
      FROM public.v_status_reprodutivo s
      WHERE s.status_reprodutivo = 'Coberta' AND s.dias_desde_cobertura >= 60
      UNION ALL
      SELECT s.fazenda_id, 'vazia_ha_muito_tempo'
      FROM public.v_status_reprodutivo s
      WHERE s.status_reprodutivo = 'Vazia' AND s.ultimo_diagnostico_data IS NOT NULL AND v_hoje - s.ultimo_diagnostico_data > 120
    ) p
    WHERE p_fazenda_id IS NULL OR p.fazenda_id = p_fazenda_id
    GROUP BY p.fazenda_id, p.tipo
  LOOP
    v_titulo := CASE r.tipo
      WHEN 'parto_atrasado' THEN 'Reprodução: parto atrasado'
      WHEN 'parto_proximo' THEN 'Reprodução: partos nos próximos 30 dias'
      WHEN 'sem_diagnostico' THEN 'Reprodução: coberta sem diagnóstico'
      ELSE 'Reprodução: fêmeas vazias há muito tempo'
    END;
    v_mensagem := CASE r.tipo
      WHEN 'parto_atrasado' THEN format('%s fêmea(s) com a data prevista de parto vencida e sem parto registrado.', r.n)
      WHEN 'parto_proximo' THEN format('%s fêmea(s) com parto previsto para os próximos 30 dias.', r.n)
      WHEN 'sem_diagnostico' THEN format('%s fêmea(s) cobertas há 60 dias ou mais, ainda sem diagnóstico de gestação.', r.n)
      ELSE format('%s fêmea(s) vazias há mais de 120 dias desde o último diagnóstico.', r.n)
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
        VALUES (v_usuario, r.fazenda_id, 'warning', v_titulo, v_mensagem, '/controller/reproducao', 'Ver pendências', false,
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

REVOKE EXECUTE ON FUNCTION public.notificar_pendencias_reprodutivas(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notificar_pendencias_reprodutivas(uuid) TO service_role;

SELECT cron.schedule('notificar_pendencias_reprodutivas', '30 8 * * 1', 'SELECT public.notificar_pendencias_reprodutivas();');
