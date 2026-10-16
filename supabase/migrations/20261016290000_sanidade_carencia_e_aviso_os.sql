-- ============================================================================
-- Sanidade S2: carência por animal e por lote + aviso (sem bloqueio) na pesagem de OS de venda
-- ============================================================================
-- Aditivo. Só LÊ aplicacoes_sanitarias e só ESCREVE em logs_sync_errors (como OS_ANIMAL_JA_BAIXADO).
--   * lotes_em_carencia(fazenda, em): aplicações por lote (sem animal) cuja liberação ainda não chegou.
--   * animais_em_carencia(fazenda, em): animais vivos com aplicação própria em carência OU em lote com aplicação em carência
--     (se a aplicação de lote informa categoria, vale só para animais dessa categoria). Limite conhecido: animal que entrou no
--     lote depois da aplicação também aparece (lado conservador).
--   * Funções SECURITY INVOKER: a RLS vale para quem chama.
--   * Gatilho AFTER INSERT em registros_pesagem: pesagem de OS do tipo venda de animal/lote em carência registra
--     CARENCIA_ATIVA em logs_sync_errors. Nunca bloqueia nem altera a pesagem (erro interno é engolido).
-- Rollback: supabase/rollbacks/20261016290000_sanidade_carencia_e_aviso_os_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lotes_em_carencia(p_fazenda_id uuid, p_em date DEFAULT NULL)
 RETURNS TABLE (lote_id uuid, categoria text, liberacao_abate_em date, medicamento_nome text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
  SELECT DISTINCT ON (a.lote_id, COALESCE(a.categoria, ''))
         a.lote_id, a.categoria, a.liberacao_abate_em, a.medicamento_nome
  FROM public.aplicacoes_sanitarias a
  WHERE a.fazenda_id = p_fazenda_id
    AND a.deleted_at IS NULL
    AND a.individuo_id IS NULL
    AND a.lote_id IS NOT NULL
    AND a.liberacao_abate_em > COALESCE(p_em, (now() AT TIME ZONE 'America/Cuiaba')::date)
  ORDER BY a.lote_id, COALESCE(a.categoria, ''), a.liberacao_abate_em DESC;
$function$;

CREATE OR REPLACE FUNCTION public.animais_em_carencia(p_fazenda_id uuid, p_em date DEFAULT NULL)
 RETURNS TABLE (individuo_id uuid, liberacao_abate_em date, medicamento_nome text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
  WITH ref AS (SELECT COALESCE(p_em, (now() AT TIME ZONE 'America/Cuiaba')::date) AS d),
  alvos AS (
    SELECT a.individuo_id, a.liberacao_abate_em, a.medicamento_nome
    FROM public.aplicacoes_sanitarias a, ref
    WHERE a.fazenda_id = p_fazenda_id AND a.deleted_at IS NULL
      AND a.individuo_id IS NOT NULL AND a.liberacao_abate_em > ref.d
    UNION ALL
    SELECT i.id, a.liberacao_abate_em, a.medicamento_nome
    FROM public.aplicacoes_sanitarias a
    JOIN public.individuos i ON i.lote_atual = a.lote_id AND i.fazenda_id = a.fazenda_id
    CROSS JOIN ref
    WHERE a.fazenda_id = p_fazenda_id AND a.deleted_at IS NULL
      AND a.individuo_id IS NULL AND a.lote_id IS NOT NULL AND a.liberacao_abate_em > ref.d
      AND i.deleted_at IS NULL AND i.status = 'Vivo'
      AND (a.categoria IS NULL OR lower(btrim(i.categoria)) = lower(btrim(a.categoria)))
  )
  SELECT DISTINCT ON (individuo_id) individuo_id, liberacao_abate_em, medicamento_nome
  FROM alvos
  ORDER BY individuo_id, liberacao_abate_em DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.lotes_em_carencia(uuid, date), public.animais_em_carencia(uuid, date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.lotes_em_carencia(uuid, date), public.animais_em_carencia(uuid, date) FROM PUBLIC, anon;

-- Aviso na pesagem de OS de venda (não bloqueia)
CREATE OR REPLACE FUNCTION public.trg_pesagem_avisa_carencia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_liberacao date;
  v_produto text;
BEGIN
  BEGIN
    IF NEW.os_id IS NULL THEN RETURN NEW; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ordens_servico o WHERE o.id = NEW.os_id AND o.tipo = 'venda') THEN RETURN NEW; END IF;

    SELECT c.liberacao_abate_em, c.medicamento_nome INTO v_liberacao, v_produto
    FROM (
      SELECT a.liberacao_abate_em, a.medicamento_nome
      FROM public.aplicacoes_sanitarias a
      WHERE a.fazenda_id = NEW.fazenda_id AND a.deleted_at IS NULL AND a.liberacao_abate_em > v_hoje
        AND NEW.individuo_id IS NOT NULL AND a.individuo_id = NEW.individuo_id
      UNION ALL
      SELECT a.liberacao_abate_em, a.medicamento_nome
      FROM public.aplicacoes_sanitarias a
      WHERE a.fazenda_id = NEW.fazenda_id AND a.deleted_at IS NULL AND a.liberacao_abate_em > v_hoje
        AND a.individuo_id IS NULL AND NEW.lote_id IS NOT NULL AND a.lote_id = NEW.lote_id
        AND (a.categoria IS NULL OR lower(btrim(a.categoria)) = lower(btrim(COALESCE(NEW.categoria, ''))))
    ) c
    ORDER BY c.liberacao_abate_em DESC
    LIMIT 1;

    IF v_liberacao IS NOT NULL THEN
      INSERT INTO public.logs_sync_errors (fazenda_id, caderneta, registro_id, operation, error_code, error_message, error_details, payload)
      VALUES (
        NEW.fazenda_id, 'pesagem', NEW.local_id,
        'trg_pesagem_avisa_carencia',
        'CARENCIA_ATIVA',
        'Animal ou lote em carência pesado em OS de venda (liberação em ' || to_char(v_liberacao, 'DD/MM/YYYY') || ', ' || v_produto || ')',
        'OS: ' || NEW.os_id::text || ' | Individuo: ' || COALESCE(NEW.individuo_id::text, 'NULL') || ' | Lote: ' || COALESCE(NEW.lote_id::text, 'NULL'),
        jsonb_build_object('os_id', NEW.os_id, 'individuo_id', NEW.individuo_id, 'lote_id', NEW.lote_id, 'liberacao_abate_em', v_liberacao, 'medicamento', v_produto)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- aviso nunca pode derrubar a pesagem
  END;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trg_pesagem_avisa_carencia() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_pesagem_avisa_carencia
  AFTER INSERT ON public.registros_pesagem
  FOR EACH ROW EXECUTE FUNCTION public.trg_pesagem_avisa_carencia();
