-- Retorna bebedouros permitidos para o relatório público:
--   - bebedouros sem associação a pasto
--   - bebedouros associados a pastos atualmente ocupados por lotes
-- Exclui apenas bebedouros associados a pastos desocupados.

CREATE OR REPLACE FUNCTION public.get_bebedouros_permitidos_relatorio(p_token uuid)
RETURNS TABLE (bebedouro_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_fazenda_id uuid;
  v_ativo boolean;
  v_expira timestamptz;
BEGIN
  SELECT fazenda_id, ativo, expira_em
  INTO v_fazenda_id, v_ativo, v_expira
  FROM relatorios_publicos
  WHERE id = p_token
    AND tipo = 'bebedouros';

  IF NOT FOUND OR v_ativo = false OR (v_expira IS NOT NULL AND v_expira < now()) THEN
    RAISE EXCEPTION 'Token invalido ou expirado';
  END IF;

  RETURN QUERY
  SELECT b.id
  FROM bebedouros b
  WHERE b.fazenda_id = v_fazenda_id
    AND b.deleted_at IS NULL
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.pasto_bebedouros pb WHERE pb.bebedouro_id = b.id
      )
      OR EXISTS (
        SELECT 1
        FROM public.pasto_bebedouros pb
        JOIN public.pastos p ON p.id = pb.pasto_id
        JOIN public.lote_pasto_historico h ON h.pasto_id = p.id
          AND h.data_hora_saida IS NULL
        JOIN public.lotes l ON l.id = h.lote_id
          AND l.fazenda_id = v_fazenda_id
        WHERE pb.bebedouro_id = b.id
          AND p.fazenda_id = v_fazenda_id
      )
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_bebedouros_permitidos_relatorio(uuid) TO anon, authenticated;
