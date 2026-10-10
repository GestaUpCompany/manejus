-- mover_lote_curral: move um lote para um curral LIVRE (curral x lote 1:1)
--
-- Tres operacoes de ocupacao, de acordo com o que a tela quer garantir:
--   alocar_lote_curral : curral livre E lote sem curral (primeira alocacao)
--   mover_lote_curral  : curral de destino livre; o lote sai do curral onde estava (tela de Lotes)
--   trocar_lote_curral : substitui livremente (curral ocupado vira livre para o novo lote)
-- Esta funcao fecha a lacuna da tela de Lotes: escolher um curral ocupado por OUTRO lote
-- precisa falhar, nao substituir em silencio. A checagem e a troca ficam atomicas (mesmas
-- travas de trocar_lote_curral; a transacao inteira desfaz em caso de falha).
--
-- Rollback: supabase/rollbacks/20261010102000_mover_lote_curral_rollback.sql

CREATE OR REPLACE FUNCTION public.mover_lote_curral(
  p_lote_id uuid,
  p_curral_destino_id uuid,
  p_data_entrada date DEFAULT NULL,
  p_kg_mn_dia_dia1 numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_ocupante uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(p_curral_destino_id::text, p_lote_id::text), 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(GREATEST(p_curral_destino_id::text, p_lote_id::text), 0));

  SELECT c.lote_id INTO v_ocupante FROM public.currais c WHERE c.id = p_curral_destino_id;
  IF v_ocupante IS NOT NULL AND v_ocupante IS DISTINCT FROM p_lote_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Curral já está ocupado por outro lote');
  END IF;

  RETURN public.trocar_lote_curral(p_curral_destino_id, p_lote_id, p_data_entrada, p_kg_mn_dia_dia1);
END;
$$;

REVOKE ALL ON FUNCTION public.mover_lote_curral(uuid, uuid, date, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mover_lote_curral(uuid, uuid, date, numeric) TO authenticated;
