-- ============================================================================
-- Sanidade C1: notificação semanal das campanhas do calendário sanitário
-- ============================================================================
-- Mesmo padrão de notificar_pendencias_sanitarias: uma notificação-resumo por fazenda e situação para cada usuário ativo da
-- fazenda (não uma por lote), atualizada em vez de duplicada se a anterior ainda não foi lida. Usa as mesmas regras da tela
-- (calendario_sanitario_pendencias): campanha atrasada (passou da data, dentro do prazo) ou a vencer (dentro da antecedência),
-- sem aplicação do produto no lote.
--   * p_fazenda_id (opcional) limita a uma fazenda (para teste); o cron chama sem argumento.
--   * Só fazendas com programação ativa no calendário recebem algo; as demais não percebem nenhuma mudança.
--   * Função de cron: EXECUTE só para service_role. Agendada às segundas, 08:50 (hora do servidor, pg_cron).
-- Rollback: supabase/rollbacks/20261016340000_notificar_calendario_sanitario_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notificar_calendario_sanitario(p_fazenda_id uuid DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  f record;
  r record;
  v_usuario uuid;
  v_titulo text;
  v_mensagem text;
  v_existente uuid;
  v_total integer := 0;
BEGIN
  FOR f IN
    SELECT DISTINCT c.fazenda_id
    FROM public.calendario_sanitario c
    WHERE c.ativo AND c.deleted_at IS NULL AND (p_fazenda_id IS NULL OR c.fazenda_id = p_fazenda_id)
  LOOP
    FOR r IN
      SELECT p.situacao,
             count(DISTINCT p.programacao_id)::integer AS campanhas,
             count(DISTINCT p.lote_id)::integer AS lotes
      FROM public.calendario_sanitario_pendencias(f.fazenda_id) p
      GROUP BY p.situacao
    LOOP
      v_titulo := CASE r.situacao WHEN 'atrasada' THEN 'Sanidade: campanhas atrasadas' ELSE 'Sanidade: campanhas se aproximando' END;
      v_mensagem := CASE r.situacao
        WHEN 'atrasada' THEN format('%s campanha(s) do calendário sanitário passaram da data sem aplicação em %s lote(s).', r.campanhas, r.lotes)
        ELSE format('%s campanha(s) do calendário sanitário se aproximam e ainda não têm aplicação em %s lote(s).', r.campanhas, r.lotes)
      END;

      FOR v_usuario IN
        SELECT uf.usuario_id
        FROM public.usuario_fazenda uf
        JOIN public.usuarios u ON u.id = uf.usuario_id
        WHERE uf.fazenda_id = f.fazenda_id AND uf.ativo = true AND u.ativo = true
      LOOP
        v_existente := NULL;
        SELECT n.id INTO v_existente
        FROM public.notificacoes n
        WHERE n.usuario_id = v_usuario AND n.fazenda_id = f.fazenda_id AND n.titulo = v_titulo
          AND n.lida = false AND n.deleted_at IS NULL
        LIMIT 1;

        IF v_existente IS NULL THEN
          INSERT INTO public.notificacoes (usuario_id, fazenda_id, tipo, titulo, mensagem, acao_url, acao_label, lida, dados_jsonb, created_at, updated_at)
          VALUES (v_usuario, f.fazenda_id, 'warning', v_titulo, v_mensagem, '/controller/manejo-sanitario', 'Ver calendário', false,
                  jsonb_build_object('situacao', r.situacao, 'campanhas', r.campanhas, 'lotes', r.lotes), now(), now());
        ELSE
          UPDATE public.notificacoes
          SET mensagem = v_mensagem, dados_jsonb = jsonb_build_object('situacao', r.situacao, 'campanhas', r.campanhas, 'lotes', r.lotes), updated_at = now()
          WHERE id = v_existente;
        END IF;
        v_total := v_total + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_total;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.notificar_calendario_sanitario(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notificar_calendario_sanitario(uuid) TO service_role;

SELECT cron.schedule('notificar_calendario_sanitario', '50 8 * * 1', 'SELECT public.notificar_calendario_sanitario();');
