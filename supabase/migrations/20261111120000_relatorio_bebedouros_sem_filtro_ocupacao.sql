-- Relatório de Bebedouros: lista TODOS os bebedouros da fazenda (não excluídos), independente de o pasto
-- estar ocupado. O objetivo do relatório é saber quais bebedouros foram limpos; o filtro por ocupação
-- escondia bebedouros de confinamento (Conf. 1..8), que não usam lote_pasto_historico.
-- A validação do token (existe, ativo, não expirado) continua igual.
-- Também vale para get_bebedouros_permitidos_relatorio_fazenda (Infográfico), que delega para esta função.

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
    AND b.deleted_at IS NULL;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_bebedouros_permitidos_relatorio(uuid) TO anon, authenticated;
