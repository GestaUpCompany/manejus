-- get_rebanho_faixa_etaria passa a usar idade_atual (idade evoluída pelo cron); cai para `idade`
-- enquanto idade_atual não estiver preenchida. Demais regras iguais à versão 20261013110000.
-- Rollback: supabase/rollbacks/20261013121000_rpc_rebanho_faixa_etaria_idade_atual_rollback.sql

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
          WHEN COALESCE(lc.idade_atual, lc.idade) IS NULL THEN 'sem_idade'
          WHEN COALESCE(lc.idade_atual, lc.idade) <= 4 THEN '0-4'
          WHEN COALESCE(lc.idade_atual, lc.idade) <= 12 THEN '5-12'
          WHEN COALESCE(lc.idade_atual, lc.idade) <= 24 THEN '13-24'
          WHEN COALESCE(lc.idade_atual, lc.idade) <= 36 THEN '25-36'
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
