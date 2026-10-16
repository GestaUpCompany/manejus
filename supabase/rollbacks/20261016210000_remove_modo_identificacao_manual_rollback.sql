-- Recria o modo de identificação manual exatamente como na migration 20261016130000 (todos os lotes voltam a 'agregado').
ALTER TABLE public.lotes
  ADD COLUMN IF NOT EXISTS modo_identificacao text NOT NULL DEFAULT 'agregado';
ALTER TABLE public.lotes DROP CONSTRAINT IF EXISTS lotes_modo_identificacao_check;
ALTER TABLE public.lotes
  ADD CONSTRAINT lotes_modo_identificacao_check CHECK (modo_identificacao IN ('agregado', 'parcial', 'individual'));

CREATE OR REPLACE FUNCTION public.trg_lotes_valida_modo_identificacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pend integer;
  v_sem_cat integer;
BEGIN
  IF NEW.modo_identificacao = 'individual' AND NEW.modo_identificacao IS DISTINCT FROM OLD.modo_identificacao THEN
    SELECT count(*) INTO v_pend
    FROM public.vw_lote_categoria_identificacao v
    WHERE v.lote_id = NEW.id AND v.quant_atual > 0
      AND (v.confirmados <> v.quant_atual OR v.divergencia);

    SELECT count(*) INTO v_sem_cat
    FROM public.vw_individuos_sem_categoria_resolvida s
    WHERE s.lote_id = NEW.id;

    IF v_pend > 0 OR v_sem_cat > 0 THEN
      RAISE EXCEPTION 'O lote só pode ser individual quando todos os animais de cada categoria estão identificados e com localização confirmada (pendências: % categoria(s), % animal(is) sem categoria no lote).', v_pend, v_sem_cat
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trg_lotes_valida_modo_identificacao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lotes_valida_modo_identificacao ON public.lotes;
CREATE TRIGGER trg_lotes_valida_modo_identificacao
  BEFORE UPDATE OF modo_identificacao ON public.lotes
  FOR EACH ROW EXECUTE FUNCTION public.trg_lotes_valida_modo_identificacao();

CREATE OR REPLACE FUNCTION public.definir_modo_identificacao(p_fazenda_id uuid, p_lote_id uuid, p_modo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
BEGIN
  IF public.caller_is_peao() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação restrita ao painel de gestão');
  END IF;
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda');
  END IF;
  IF p_modo IS NULL OR p_modo NOT IN ('agregado', 'parcial', 'individual') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Modo inválido');
  END IF;

  UPDATE public.lotes SET modo_identificacao = p_modo, updated_at = now()
  WHERE id = p_lote_id AND fazenda_id = p_fazenda_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lote não encontrado');
  END IF;
  RETURN jsonb_build_object('success', true, 'modo', p_modo);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.definir_modo_identificacao(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_modo_identificacao(uuid, uuid, text) TO authenticated;
