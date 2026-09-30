-- Observacao da semana: upsert que preserva o status existente.
-- (upsert direto pelo cliente sobrescreveria status ao salvar obs)

CREATE OR REPLACE FUNCTION public.fp_set_obs_semana(
  p_atividade_id uuid,
  p_semana smallint,
  p_observacao text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fazenda uuid;
BEGIN
  SELECT fazenda_id INTO v_fazenda FROM public.fp_atividades WHERE id = p_atividade_id;
  IF v_fazenda IS NULL THEN RAISE EXCEPTION 'atividade nao encontrada'; END IF;

  INSERT INTO public.fp_atividade_semanas (atividade_id, fazenda_id, semana, status, observacao)
  VALUES (p_atividade_id, v_fazenda, p_semana, 1, p_observacao)
  ON CONFLICT (atividade_id, semana)
  DO UPDATE SET observacao = EXCLUDED.observacao, updated_at = now();
END;
$$;
