-- Relatorio de Farmacia (tipo 'farmacia'): estoque de medicamentos e vacinas, movimentacao e validade por lote.
-- Parte 1: get_dados_relatorio_farmacia, SECURITY DEFINER validada por token (mesmo padrao do almoxarifado).
-- Parte 2: variante _fazenda para o Infografico Mensal (token temporario).
-- A RPC devolve o catalogo (medicamentos com controle de estoque) e o ledger compacto de
-- movimentacoes_farmacia ate data_fim (inclui o que veio antes do periodo, necessario para saldo inicial
-- e saldo por lote). Saldo, entradas, baixas, FEFO, ABC e cobertura sao calculados em
-- features/relatorioFarmacia/agregacao.ts, reaproveitando features/estoqueFarmacia/logica.ts (fonte unica).
-- Ordem do ledger: (data, created_at, id), igual a recalcular_estoque_farmacia.
-- Aditiva: so cria funcoes novas. Rollback em supabase/rollbacks/.

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_farmacia(
  p_token uuid,
  p_data_inicio date DEFAULT NULL::date,
  p_data_fim date DEFAULT NULL::date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_max_movs CONSTANT integer := 5000;
  v_fazenda_id uuid;
  v_ativo boolean;
  v_expira timestamptz;
  v_itens jsonb;
  v_movs jsonb;
  v_movs_total integer;
  v_fazenda_nome text;
  v_fazenda_logo text;
BEGIN
  SELECT fazenda_id, ativo, expira_em INTO v_fazenda_id, v_ativo, v_expira
  FROM relatorios_publicos
  WHERE id = p_token AND tipo = 'farmacia';

  IF NOT FOUND OR v_ativo = false OR (v_expira IS NOT NULL AND v_expira < now()) THEN
    RAISE EXCEPTION 'Token invalido ou expirado';
  END IF;

  SELECT nome, logo_url INTO v_fazenda_nome, v_fazenda_logo FROM fazendas WHERE id = v_fazenda_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'nome_comercial', m.nome_comercial,
    'sku', m.sku,
    'tipo', m.tipo::text,
    'unidade', m.unidade,
    'estoque_atual', COALESCE(m.estoque_atual, 0),
    'estoque_minimo', COALESCE(m.estoque_minimo, 0),
    'custo_unitario', COALESCE(m.custo_unitario, 0),
    'custo_total_estoque', COALESCE(m.custo_total_estoque, 0),
    'controla_estoque', m.controla_estoque,
    'conteudo_por_unidade', m.conteudo_por_unidade,
    'conteudo_unidade', m.conteudo_unidade,
    'carencia_abate_dias', m.carencia_abate_dias
  ) ORDER BY m.nome_comercial), '[]'::jsonb) INTO v_itens
  FROM medicamentos m
  WHERE m.fazenda_id = v_fazenda_id AND m.deleted_at IS NULL AND m.controla_estoque = true;

  SELECT COUNT(*) INTO v_movs_total
  FROM movimentacoes_farmacia x
  JOIN medicamentos m ON m.id = x.medicamento_id AND m.controla_estoque = true AND m.deleted_at IS NULL
  WHERE x.fazenda_id = v_fazenda_id AND x.deleted_at IS NULL
    AND (p_data_fim IS NULL OR x.data <= p_data_fim);

  SELECT COALESCE(jsonb_agg(t.j ORDER BY t.data, t.created_at, t.id), '[]'::jsonb) INTO v_movs
  FROM (
    SELECT x.data, x.created_at, x.id,
      jsonb_build_object(
        'id', x.id,
        'medicamento_id', x.medicamento_id,
        'tipo_movimentacao', x.tipo_movimentacao,
        'quantidade', x.quantidade,
        'custo_unitario', x.custo_unitario,
        'valor_total', x.valor_total,
        'data', to_char(x.data, 'YYYY-MM-DD'),
        'origem', x.origem,
        'fornecedor', x.fornecedor,
        'nota_fiscal', x.nota_fiscal,
        'lote_produto', x.lote_produto,
        'validade', to_char(x.validade, 'YYYY-MM-DD'),
        'lote_origem', x.lote_origem,
        'validade_origem', to_char(x.validade_origem, 'YYYY-MM-DD'),
        'observacao', x.observacao,
        'unidade', x.unidade,
        'registro_origem_id', x.registro_origem_id,
        'created_at', x.created_at
      ) AS j
    FROM movimentacoes_farmacia x
    JOIN medicamentos m ON m.id = x.medicamento_id AND m.controla_estoque = true AND m.deleted_at IS NULL
    WHERE x.fazenda_id = v_fazenda_id AND x.deleted_at IS NULL
      AND (p_data_fim IS NULL OR x.data <= p_data_fim)
    ORDER BY x.data, x.created_at, x.id
    LIMIT c_max_movs
  ) t;

  RETURN jsonb_build_object(
    'fazenda_id', v_fazenda_id,
    'dados', jsonb_build_object(
      'fazenda_nome', v_fazenda_nome,
      'fazenda_logo_url', v_fazenda_logo,
      'timezone', 'America/Cuiaba',
      'gerado_em', now(),
      'hoje', to_char((now() AT TIME ZONE 'America/Cuiaba')::date, 'YYYY-MM-DD'),
      'data_inicio', p_data_inicio,
      'data_fim', p_data_fim,
      'itens', v_itens,
      'movimentacoes', v_movs,
      'movimentacoes_total', v_movs_total
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_farmacia(uuid, date, date) TO anon, authenticated;

-- Variante para o Infografico Mensal: recebe fazenda_id, valida acesso do usuario autenticado
-- e reutiliza a RPC publica via token temporario.
CREATE OR REPLACE FUNCTION public.get_dados_relatorio_farmacia_fazenda(
  p_fazenda_id uuid,
  p_data_inicio date DEFAULT NULL::date,
  p_data_fim date DEFAULT NULL::date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token uuid;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Acesso negado à fazenda';
  END IF;
  INSERT INTO public.relatorios_publicos (fazenda_id, tipo, titulo)
  VALUES (p_fazenda_id, 'farmacia', 'Relatório temporário')
  RETURNING id INTO v_token;
  v_result := public.get_dados_relatorio_farmacia(v_token, p_data_inicio, p_data_fim);
  DELETE FROM public.relatorios_publicos WHERE id = v_token;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dados_relatorio_farmacia_fazenda(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_farmacia_fazenda(uuid, date, date) TO authenticated;
