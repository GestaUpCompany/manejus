-- Relatório público de estoque (insumos e/ou formulações).
--
-- Parte 1: coluna `config` em relatorios_publicos. Guarda opções por link;
-- para o relatório de estoque usamos config->>'escopo' com valores
-- 'insumos' | 'formulacoes' | 'todos' (default).
--
-- Parte 2: get_dados_relatorio_estoque, SECURITY DEFINER validada por token,
-- mesmo padrão de get_dados_relatorio_pastagens. Snapshot: sem filtro de
-- data, devolve a posição atual de estoque com valor a custo médio (WAC).
-- Formulações caem para custo_mn_tonelada/1000 quando custo_unitario = 0,
-- mesma regra da tela EstoqueSuplementacao.

ALTER TABLE public.relatorios_publicos
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.relatorios_publicos.config IS
  'Opções do link por tipo de relatório. Estoque usa {"escopo": "insumos"|"formulacoes"|"todos"}.';

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_estoque(
  p_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_fazenda_id uuid;
  v_ativo boolean;
  v_expira timestamptz;
  v_escopo text;
  v_itens jsonb;
  v_totais jsonb;
BEGIN
  SELECT fazenda_id, ativo, expira_em, COALESCE(config->>'escopo', 'todos')
    INTO v_fazenda_id, v_ativo, v_expira, v_escopo
  FROM relatorios_publicos
  WHERE id = p_token AND tipo = 'estoque';

  IF NOT FOUND OR v_ativo = false OR (v_expira IS NOT NULL AND v_expira < now()) THEN
    RAISE EXCEPTION 'Token invalido ou expirado';
  END IF;

  IF v_escopo NOT IN ('insumos', 'formulacoes', 'todos') THEN
    v_escopo := 'todos';
  END IF;

  WITH itens AS (
    SELECT
      'insumo'::text AS item_tipo,
      i.nome,
      i.tipo,
      i.unidade,
      COALESCE(i.estoque_atual, 0)::numeric AS estoque_atual,
      COALESCE(i.custo_unitario, 0)::numeric AS custo_unitario,
      COALESCE(i.estoque_minimo, 0)::numeric AS estoque_minimo
    FROM insumos i
    WHERE i.fazenda_id = v_fazenda_id
      AND i.ativo = true
      AND v_escopo IN ('insumos', 'todos')
    UNION ALL
    SELECT
      'formulacao'::text,
      f.nome,
      CASE WHEN f.e_premix THEN 'Premix' ELSE COALESCE(f.tipo, 'Formulação') END,
      'kg'::text,
      COALESCE(f.estoque_atual, 0)::numeric,
      CASE
        WHEN COALESCE(f.custo_unitario, 0) > 0 THEN f.custo_unitario
        ELSE COALESCE(f.custo_mn_tonelada, 0) / 1000.0
      END,
      COALESCE(f.estoque_minimo, 0)::numeric
    FROM formulacoes f
    WHERE f.fazenda_id = v_fazenda_id
      AND f.ativo = true
      AND f.deleted_at IS NULL
      AND v_escopo IN ('formulacoes', 'todos')
  ),
  enriquecido AS (
    SELECT
      item_tipo, nome, tipo, unidade, estoque_atual, custo_unitario, estoque_minimo,
      -- Saldo negativo é problema de saneamento, não ativo negativo: entra
      -- na lista (flag negativo) mas vale 0 no valor em estoque.
      ROUND(GREATEST(estoque_atual, 0) * custo_unitario, 2) AS valor_estoque,
      (estoque_atual < 0) AS negativo,
      (estoque_minimo > 0 AND estoque_atual <= estoque_minimo) AS em_alerta
    FROM itens
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(e) ORDER BY CASE WHEN e.item_tipo = 'insumo' THEN 0 ELSE 1 END, e.nome), '[]'::jsonb),
    jsonb_build_object(
      'valor_total', COALESCE(SUM(e.valor_estoque), 0),
      'total_itens', COUNT(*),
      'em_alerta', COUNT(*) FILTER (WHERE e.em_alerta),
      'negativos', COUNT(*) FILTER (WHERE e.negativo)
    )
  INTO v_itens, v_totais
  FROM enriquecido e;

  RETURN jsonb_build_object(
    'fazenda_id', v_fazenda_id,
    'dados', jsonb_build_object(
      'escopo', v_escopo,
      'gerado_em', now(),
      'itens', v_itens,
      'totais', v_totais
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_estoque(uuid) TO anon, authenticated;

-- Variante para o Infográfico Mensal: recebe fazenda_id direto, valida acesso
-- do usuário autenticado e reutiliza a RPC pública via token temporário.
-- Sem escopo: no consolidado o relatório sempre mostra insumos + formulações.
CREATE OR REPLACE FUNCTION public.get_dados_relatorio_estoque_fazenda(
  p_fazenda_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_token uuid;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Acesso negado à fazenda';
  END IF;
  INSERT INTO public.relatorios_publicos (fazenda_id, tipo, titulo, config)
  VALUES (p_fazenda_id, 'estoque', 'Relatório temporário', '{"escopo":"todos"}'::jsonb)
  RETURNING id INTO v_token;
  v_result := public.get_dados_relatorio_estoque(v_token);
  DELETE FROM public.relatorios_publicos WHERE id = v_token;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dados_relatorio_estoque_fazenda(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_estoque_fazenda(uuid) TO authenticated;
