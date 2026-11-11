-- Relatório de Bebedouros: situação do pasto de cada bebedouro (ocupado / vago / sem pasto).
-- Nova RPC, separada de get_bebedouros_permitidos_relatorio (que o Infográfico usa e não muda).
--   - ocupado:    há pasto ligado ao bebedouro com lote atualmente no pasto (data_hora_saida IS NULL)
--   - vago:       há pasto ligado, nenhum com lote no momento
--   - sem_pasto:  nenhuma ligação em pasto_bebedouros (ex.: Conf. 1..8)
-- Validação do token igual à das outras RPCs de relatório público.

CREATE OR REPLACE FUNCTION public.get_bebedouros_situacao_pasto_relatorio(p_token uuid)
RETURNS TABLE (
  bebedouro_id uuid,
  pasto_nomes text[],
  situacao text
)
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
  SELECT
    b.id AS bebedouro_id,
    COALESCE(
      (
        SELECT array_agg(p.nome ORDER BY p.nome)
        FROM public.pasto_bebedouros pb
        JOIN public.pastos p ON p.id = pb.pasto_id
        WHERE pb.bebedouro_id = b.id
          AND p.fazenda_id = v_fazenda_id
      ),
      ARRAY[]::text[]
    ) AS pasto_nomes,
    CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM public.pasto_bebedouros pb
        JOIN public.pastos p ON p.id = pb.pasto_id
        WHERE pb.bebedouro_id = b.id
          AND p.fazenda_id = v_fazenda_id
      ) THEN 'sem_pasto'
      WHEN EXISTS (
        SELECT 1
        FROM public.pasto_bebedouros pb
        JOIN public.pastos p ON p.id = pb.pasto_id
        JOIN public.lote_pasto_historico h ON h.pasto_id = p.id
          AND h.data_hora_saida IS NULL
        JOIN public.lotes l ON l.id = h.lote_id
          AND l.fazenda_id = v_fazenda_id
        WHERE pb.bebedouro_id = b.id
          AND p.fazenda_id = v_fazenda_id
      ) THEN 'ocupado'
      ELSE 'vago'
    END AS situacao
  FROM bebedouros b
  WHERE b.fazenda_id = v_fazenda_id
    AND b.deleted_at IS NULL;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_bebedouros_situacao_pasto_relatorio(uuid) TO anon, authenticated;
