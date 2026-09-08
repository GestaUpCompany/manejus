-- Retorna apenas bebedouros associados a pastos atualmente ocupados por lotes
-- para um relatório público válido.

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
  SELECT DISTINCT pb.bebedouro_id
  FROM pasto_bebedouros pb
  JOIN pastos p ON p.id = pb.pasto_id
  JOIN lote_pasto_historico h ON h.pasto_id = p.id
    AND h.data_hora_saida IS NULL
  JOIN lotes l ON l.id = h.lote_id
    AND l.fazenda_id = v_fazenda_id
  WHERE p.fazenda_id = v_fazenda_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_bebedouros_permitidos_relatorio(uuid) TO anon, authenticated;
