-- ============================================================================
-- Indivíduos / Fase 1.4: ponte evento -> animais (quais animais foram numa movimentação por contagem)
-- ============================================================================
-- A movimentação entre lotes (apartação) continua sendo agregada: a quantidade é o que conta. A ponte só diz QUAIS
-- animais identificados foram, e é a resposta direta ao "movimento parcial": os animais informados passam a
-- localização confirmada no lote de destino. Sem ponte, nada acontece com os indivíduos (além da regra da 0.5).
--   * evento_individuos(evento_id -> registros_movimentacao, individuo_id) com unicidade; leitura por fazenda (RLS);
--     escrita só pelas RPCs (nenhum INSERT/UPDATE/DELETE direto para authenticated).
--   * vincular_individuos_movimentacao(p_fazenda_id, p_movimentacao_id, p_individuo_ids, p_confirmar_restantes):
--       - só movimentação Saída/Entrevero entre lotes, sem OS, não estornada, 1 categoria;
--       - cada animal: Vivo, mesma fazenda, no lote de origem (ou já no de destino), categoria canônica igual à da movimentação;
--       - total de animais ligados <= numero_cabecas;
--       - animais passam a lote_atual = destino e sem localização incerta;
--       - p_confirmar_restantes: os demais identificados da origem (incertos) passam a confirmados na origem.
--       Tudo ou nada (qualquer animal inválido aborta).
--   * desvincular_individuo_movimentacao: remove a ligação e volta o animal a "localização incerta" (não se sabe mais onde está).
-- Também corrige trg_movimentacao_propaga_individuos (0.5): a categoria do animal era comparada com LOWER(), sem os
-- aliases, então 'Vaca Parida/Vazia' nunca eram marcadas como incertas quando 'vaca' saía por apartação parcial.
-- Agora compara categoria_canonica(). Rollback: supabase/rollbacks/20261016140000_evento_individuos_ponte_movimentacao_rollback.sql
-- ============================================================================

CREATE TABLE public.evento_individuos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas (id),
  evento_id uuid NOT NULL REFERENCES public.registros_movimentacao (id) ON DELETE CASCADE,
  individuo_id uuid NOT NULL REFERENCES public.individuos (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evento_id, individuo_id)
);
CREATE INDEX idx_evento_individuos_individuo ON public.evento_individuos (individuo_id);
CREATE INDEX idx_evento_individuos_fazenda ON public.evento_individuos (fazenda_id);

ALTER TABLE public.evento_individuos ENABLE ROW LEVEL SECURITY;
CREATE POLICY evento_individuos_leitura ON public.evento_individuos FOR SELECT TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));
REVOKE ALL ON public.evento_individuos FROM anon, authenticated;
GRANT SELECT ON public.evento_individuos TO authenticated;

CREATE OR REPLACE FUNCTION public.vincular_individuos_movimentacao(
  p_fazenda_id uuid,
  p_movimentacao_id uuid,
  p_individuo_ids uuid[],
  p_confirmar_restantes boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_mov RECORD;
  v_ids uuid[];
  v_id uuid;
  v_ind RECORD;
  v_ja integer;
  v_novos integer := 0;
  v_restantes integer := 0;
  v_cat_mov text;
BEGIN
  IF public.caller_is_peao() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação restrita ao painel de gestão');
  END IF;
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda');
  END IF;

  SELECT ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_individuo_ids, '{}'::uuid[])) x WHERE x IS NOT NULL) INTO v_ids;
  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Informe ao menos um animal');
  END IF;

  SELECT * INTO v_mov FROM public.registros_movimentacao
  WHERE id = p_movimentacao_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Movimentação não encontrada');
  END IF;
  IF v_mov.os_id IS NOT NULL OR v_mov.individuo_id IS NOT NULL
     OR v_mov.motivo_movimentacao::text NOT IN ('Saída', 'Entrevero')
     OR v_mov.lote_origem_id IS NULL OR v_mov.lote_destino_id IS NULL OR v_mov.lote_origem_id = v_mov.lote_destino_id
     OR v_mov.categoria IS NULL OR COALESCE(v_mov.numero_cabecas, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Só movimentações por contagem entre lotes (apartação) aceitam informar os animais.');
  END IF;
  v_cat_mov := public.categoria_canonica(v_mov.categoria);
  IF v_cat_mov IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'A categoria da movimentação não está no domínio de categorias.');
  END IF;

  SELECT count(*) INTO v_ja FROM public.evento_individuos WHERE evento_id = v_mov.id;
  SELECT count(*) INTO v_novos FROM unnest(v_ids) x
    WHERE NOT EXISTS (SELECT 1 FROM public.evento_individuos e WHERE e.evento_id = v_mov.id AND e.individuo_id = x);
  IF v_ja + v_novos > v_mov.numero_cabecas THEN
    RAISE EXCEPTION 'A movimentação tem % cabeça(s); não dá para informar % animal(is) (já informados: %).',
      v_mov.numero_cabecas, v_ja + v_novos, v_ja USING ERRCODE = 'P0001';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT i.* INTO v_ind FROM public.individuos i
    WHERE i.id = v_id AND i.fazenda_id = p_fazenda_id AND i.deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Animal % não encontrado nesta fazenda.', v_id USING ERRCODE = 'P0001';
    END IF;
    IF v_ind.status <> 'Vivo' THEN
      RAISE EXCEPTION 'O animal % não está Vivo (%).', COALESCE(v_ind.id_brinco, v_ind.id_chip, v_ind.id_manejo, v_ind.id_provisorio_cria, v_ind.id::text), v_ind.status
        USING ERRCODE = 'P0001';
    END IF;
    IF public.categoria_canonica(v_ind.categoria) IS DISTINCT FROM v_cat_mov THEN
      RAISE EXCEPTION 'O animal % é da categoria "%", diferente da movimentação ("%").',
        COALESCE(v_ind.id_brinco, v_ind.id_chip, v_ind.id_manejo, v_ind.id_provisorio_cria, v_ind.id::text), v_ind.categoria, v_mov.categoria
        USING ERRCODE = 'P0001';
    END IF;
    IF v_ind.lote_atual IS DISTINCT FROM v_mov.lote_origem_id AND v_ind.lote_atual IS DISTINCT FROM v_mov.lote_destino_id THEN
      RAISE EXCEPTION 'O animal % não está no lote de origem nem no de destino da movimentação.',
        COALESCE(v_ind.id_brinco, v_ind.id_chip, v_ind.id_manejo, v_ind.id_provisorio_cria, v_ind.id::text) USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.evento_individuos (fazenda_id, evento_id, individuo_id)
    VALUES (p_fazenda_id, v_mov.id, v_ind.id)
    ON CONFLICT (evento_id, individuo_id) DO NOTHING;

    UPDATE public.individuos
    SET lote_atual = v_mov.lote_destino_id, localizacao_incerta_desde = NULL, updated_at = now()
    WHERE id = v_ind.id;
  END LOOP;

  IF p_confirmar_restantes THEN
    UPDATE public.individuos
    SET localizacao_incerta_desde = NULL, updated_at = now()
    WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND status = 'Vivo'
      AND lote_atual = v_mov.lote_origem_id
      AND localizacao_incerta_desde IS NOT NULL
      AND public.categoria_canonica(categoria) = v_cat_mov;
    GET DIAGNOSTICS v_restantes = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('success', true, 'vinculados', array_length(v_ids, 1), 'restantes_confirmados', v_restantes);
END;
$function$;

CREATE OR REPLACE FUNCTION public.desvincular_individuo_movimentacao(
  p_fazenda_id uuid,
  p_movimentacao_id uuid,
  p_individuo_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_n integer;
BEGIN
  IF public.caller_is_peao() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação restrita ao painel de gestão');
  END IF;
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda');
  END IF;

  DELETE FROM public.evento_individuos
  WHERE fazenda_id = p_fazenda_id AND evento_id = p_movimentacao_id AND individuo_id = p_individuo_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este animal não está ligado a essa movimentação');
  END IF;

  -- Sem a ligação não se sabe mais onde o animal está
  UPDATE public.individuos
  SET localizacao_incerta_desde = (now() AT TIME ZONE 'America/Cuiaba')::date, updated_at = now()
  WHERE id = p_individuo_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL AND status = 'Vivo'
    AND localizacao_incerta_desde IS NULL;

  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.vincular_individuos_movimentacao(uuid, uuid, uuid[], boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.desvincular_individuo_movimentacao(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vincular_individuos_movimentacao(uuid, uuid, uuid[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.desvincular_individuo_movimentacao(uuid, uuid, uuid) TO authenticated;

-- ---- correção da 0.5: categoria do animal comparada pelo domínio (aliases), não por LOWER() ----
CREATE OR REPLACE FUNCTION public.trg_movimentacao_propaga_individuos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_q_depois integer;
  v_data date;
  v_cat text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
  ELSIF NOT (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  IF NEW.os_id IS NOT NULL OR NEW.individuo_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.motivo_movimentacao::text NOT IN ('Saída', 'Entrevero') THEN
    RETURN NEW;
  END IF;
  IF NEW.lote_origem_id IS NULL OR NEW.lote_destino_id IS NULL OR NEW.lote_origem_id = NEW.lote_destino_id THEN
    RETURN NEW;
  END IF;
  IF NEW.categoria IS NULL OR COALESCE(NEW.numero_cabecas, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.lote_categorias lc
    JOIN public.lotes l ON l.id = lc.lote_id
    WHERE lc.lote_id = NEW.lote_origem_id
      AND l.fazenda_id = NEW.fazenda_id
      AND LOWER(lc.categoria) = LOWER(NEW.categoria)
      AND lc.ativo = true
  ) THEN
    RETURN NEW;
  END IF;

  v_cat := public.categoria_canonica(NEW.categoria);
  IF v_cat IS NULL THEN
    RETURN NEW;
  END IF;

  v_data := (COALESCE(NEW.data, now()) AT TIME ZONE 'America/Cuiaba')::date;

  IF TG_OP = 'UPDATE' THEN
    UPDATE public.individuos
    SET localizacao_incerta_desde = (now() AT TIME ZONE 'America/Cuiaba')::date, updated_at = now()
    WHERE fazenda_id = NEW.fazenda_id
      AND deleted_at IS NULL
      AND status = 'Vivo'
      AND public.categoria_canonica(categoria) = v_cat
      AND lote_atual IN (NEW.lote_origem_id, NEW.lote_destino_id)
      AND localizacao_incerta_desde IS NULL;
    RETURN NEW;
  END IF;

  v_q_depois := public.calculate_quant_atual(NEW.lote_origem_id, NEW.categoria);

  IF v_q_depois = 0 THEN
    UPDATE public.individuos
    SET lote_atual = NEW.lote_destino_id, updated_at = now()
    WHERE fazenda_id = NEW.fazenda_id
      AND deleted_at IS NULL
      AND status = 'Vivo'
      AND lote_atual = NEW.lote_origem_id
      AND public.categoria_canonica(categoria) = v_cat
      AND localizacao_incerta_desde IS NULL;
  ELSE
    UPDATE public.individuos
    SET localizacao_incerta_desde = v_data, updated_at = now()
    WHERE fazenda_id = NEW.fazenda_id
      AND deleted_at IS NULL
      AND status = 'Vivo'
      AND lote_atual = NEW.lote_origem_id
      AND public.categoria_canonica(categoria) = v_cat
      AND localizacao_incerta_desde IS NULL;
  END IF;

  RETURN NEW;
END;
$function$;
