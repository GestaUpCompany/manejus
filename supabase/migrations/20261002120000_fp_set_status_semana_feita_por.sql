-- Auditoria do "pincel" do plano anual: quando status=Concluido marca baixas
-- em massa, grava quem fez (feita_por_usuario_id) em vez de deixar NULL.
-- Recria a funcao com parametro novo (assinatura muda -> DROP antes).

DROP FUNCTION IF EXISTS public.fp_set_status_semana(uuid, smallint, smallint);

CREATE OR REPLACE FUNCTION public.fp_set_status_semana(
  p_atividade_id uuid,
  p_semana smallint,
  p_status smallint, -- 0 remove a semana
  p_feita_por_usuario_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fazenda uuid;
  v_dias boolean[];
BEGIN
  SELECT fazenda_id, dias_semana INTO v_fazenda, v_dias
  FROM public.fp_atividades WHERE id = p_atividade_id;
  IF v_fazenda IS NULL THEN RAISE EXCEPTION 'atividade nao encontrada'; END IF;

  IF p_status IS NULL OR p_status = 0 THEN
    DELETE FROM public.fp_atividade_baixas WHERE atividade_id = p_atividade_id AND semana = p_semana;
    DELETE FROM public.fp_atividade_semanas WHERE atividade_id = p_atividade_id AND semana = p_semana;
    RETURN;
  END IF;

  INSERT INTO public.fp_atividade_semanas (atividade_id, fazenda_id, semana, status)
  VALUES (p_atividade_id, v_fazenda, p_semana, p_status)
  ON CONFLICT (atividade_id, semana) DO UPDATE SET status = EXCLUDED.status, updated_at = now();

  IF p_status = 2 THEN
    INSERT INTO public.fp_atividade_baixas
      (atividade_id, fazenda_id, semana, dia, feita, feita_por_usuario_id, feita_at)
    SELECT p_atividade_id, v_fazenda, p_semana, d, true, p_feita_por_usuario_id, now()
    FROM generate_series(0,6) d WHERE v_dias[d+1]
    ON CONFLICT (atividade_id, semana, dia) DO UPDATE SET
      feita = true,
      feita_por_usuario_id = COALESCE(EXCLUDED.feita_por_usuario_id, fp_atividade_baixas.feita_por_usuario_id),
      feita_at = now(),
      updated_at = now();
  ELSIF p_status = 1 THEN
    DELETE FROM public.fp_atividade_baixas WHERE atividade_id = p_atividade_id AND semana = p_semana;
  END IF;
END;
$$;
