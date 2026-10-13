-- ============================================================================
-- RPC get_rebanho_faixa_etaria: saldo atual do rebanho por faixa etária e sexo (Dashboard)
-- ============================================================================
-- Saldo = COALESCE(quant_atual, quant_inicial, 0) de lote_categorias ativas em lotes ativos (mesmo critério
-- de get_gado_stats). Idade = lote_categorias.idade (meses, valor do cadastro, não envelhece sozinho).
-- Faixas: '0-4', '5-12', '13-24', '25-36', '36+' e 'sem_idade' (idade nula). Sexo: 'Fêmea', 'Macho' ou
-- 'Indefinido' (nulo ou fora do padrão). Devolve só os grupos com cabeças; o cliente completa com zeros.
-- Rollback: supabase/rollbacks/20261013110000_rpc_rebanho_faixa_etaria_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_rebanho_faixa_etaria(p_fazenda_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.guard_fazenda(p_fazenda_id);

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('faixa', faixa, 'sexo', sexo, 'cabecas', cabecas) ORDER BY faixa, sexo)
    FROM (
      SELECT
        CASE
          WHEN lc.idade IS NULL THEN 'sem_idade'
          WHEN lc.idade <= 4 THEN '0-4'
          WHEN lc.idade <= 12 THEN '5-12'
          WHEN lc.idade <= 24 THEN '13-24'
          WHEN lc.idade <= 36 THEN '25-36'
          ELSE '36+'
        END AS faixa,
        CASE
          WHEN lower(btrim(lc.sexo)) IN ('fêmea', 'femea') THEN 'Fêmea'
          WHEN lower(btrim(lc.sexo)) = 'macho' THEN 'Macho'
          ELSE 'Indefinido'
        END AS sexo,
        SUM(COALESCE(lc.quant_atual, lc.quant_inicial, 0))::int AS cabecas
      FROM lote_categorias lc
      JOIN lotes l ON l.id = lc.lote_id
      WHERE l.fazenda_id = p_fazenda_id AND l.ativo = true AND l.deleted_at IS NULL
        AND lc.ativo = true
      GROUP BY 1, 2
      HAVING SUM(COALESCE(lc.quant_atual, lc.quant_inicial, 0)) > 0
    ) t
  ), '[]'::jsonb);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_rebanho_faixa_etaria(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_rebanho_faixa_etaria(uuid) TO authenticated, service_role;
