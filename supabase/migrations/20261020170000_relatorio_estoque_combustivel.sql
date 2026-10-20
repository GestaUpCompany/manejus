-- Relatorio de estoque de combustivel (tipo 'estoque_combustivel'): posicao e movimentacao por tanque no periodo.
-- Parte 1: get_dados_relatorio_estoque_combustivel, SECURITY DEFINER validada por token (mesmo padrao de get_dados_relatorio_estoque).
-- Parte 2: variante _fazenda para o Infografico Mensal (token temporario).
-- Saldo reconstruido pelo historico em ordem (data, created_at): entrada soma, baixa subtrai, ajuste define o saldo absoluto.
-- Aditiva: so cria funcoes novas. Rollback em supabase/rollbacks/.

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_estoque_combustivel(
  p_token uuid,
  p_data_inicio date DEFAULT NULL::date,
  p_data_fim date DEFAULT NULL::date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fazenda_id uuid;
  v_ativo boolean;
  v_expira timestamptz;
  v_tanque record;
  v_mov record;
  v_saldo numeric;
  v_saldo_ini numeric;
  v_ent_l numeric;
  v_ent_v numeric;
  v_bai_l numeric;
  v_bai_v numeric;
  v_aju_l numeric;
  v_qtd_aju integer;
  v_valor_mov numeric;
  v_delta numeric;
  v_extrato jsonb;
  v_tanques jsonb := '[]'::jsonb;
  v_movs jsonb := '[]'::jsonb;
  v_pct numeric;
BEGIN
  SELECT fazenda_id, ativo, expira_em INTO v_fazenda_id, v_ativo, v_expira
  FROM relatorios_publicos
  WHERE id = p_token AND tipo = 'estoque_combustivel';

  IF NOT FOUND OR v_ativo = false OR (v_expira IS NOT NULL AND v_expira < now()) THEN
    RAISE EXCEPTION 'Token invalido ou expirado';
  END IF;

  FOR v_tanque IN
    SELECT t.id, t.nome, t.tipo_combustivel, t.capacidade_maxima_l, t.limite_alerta_l,
           COALESCE(t.saldo_atual_l, 0) AS saldo_atual_l, COALESCE(t.custo_medio_l, 0) AS custo_medio_l
    FROM tanques_combustivel t
    WHERE t.fazenda_id = v_fazenda_id AND t.deleted_at IS NULL
    ORDER BY t.tipo_combustivel, t.nome
  LOOP
    v_saldo := 0; v_saldo_ini := 0;
    v_ent_l := 0; v_ent_v := 0; v_bai_l := 0; v_bai_v := 0; v_aju_l := 0; v_qtd_aju := 0;

    FOR v_mov IN
      SELECT m.id, m.data, m.created_at, m.tipo_movimentacao, m.origem, m.quantidade_l,
             m.preco_por_litro, m.valor_total, m.fornecedor, m.nota_fiscal, m.observacao,
             m.placa_veiculo, m.nome_motorista, ra.maquina_veiculo
      FROM movimentacoes_combustivel m
      LEFT JOIN registros_abastecimento ra ON ra.id = m.registro_abastecimento_id
      WHERE m.tanque_id = v_tanque.id
        AND (p_data_fim IS NULL OR m.data <= p_data_fim)
      ORDER BY m.data, m.created_at
    LOOP
      v_delta := 0;
      v_valor_mov := NULL;
      IF v_mov.tipo_movimentacao = 'entrada' THEN
        v_delta := v_mov.quantidade_l;
        v_valor_mov := COALESCE(v_mov.valor_total, v_mov.quantidade_l * COALESCE(v_mov.preco_por_litro, 0));
      ELSIF v_mov.tipo_movimentacao = 'baixa' THEN
        v_delta := -v_mov.quantidade_l;
        v_valor_mov := v_mov.quantidade_l * COALESCE(v_mov.preco_por_litro, 0);
      ELSE
        v_delta := v_mov.quantidade_l - v_saldo;
      END IF;
      v_saldo := v_saldo + v_delta;

      IF p_data_inicio IS NOT NULL AND v_mov.data < p_data_inicio THEN
        v_saldo_ini := v_saldo;
      ELSE
        IF v_mov.tipo_movimentacao = 'entrada' THEN
          v_ent_l := v_ent_l + v_mov.quantidade_l; v_ent_v := v_ent_v + v_valor_mov;
        ELSIF v_mov.tipo_movimentacao = 'baixa' THEN
          v_bai_l := v_bai_l + v_mov.quantidade_l; v_bai_v := v_bai_v + v_valor_mov;
        ELSE
          v_aju_l := v_aju_l + v_delta; v_qtd_aju := v_qtd_aju + 1;
        END IF;
        v_movs := v_movs || jsonb_build_object(
          'tanque_id', v_tanque.id,
          'tanque', v_tanque.nome,
          'combustivel', v_tanque.tipo_combustivel,
          'data', to_char(v_mov.data, 'YYYY-MM-DD'),
          'tipo', v_mov.tipo_movimentacao,
          'origem', v_mov.origem,
          'quantidade_l', v_mov.quantidade_l,
          'variacao_l', v_delta,
          'preco_por_litro', v_mov.preco_por_litro,
          'valor', v_valor_mov,
          'saldo_apos_l', v_saldo,
          'fornecedor', v_mov.fornecedor,
          'nota_fiscal', v_mov.nota_fiscal,
          'maquina', v_mov.maquina_veiculo,
          'placa', v_mov.placa_veiculo,
          'motorista', v_mov.nome_motorista,
          'observacao', v_mov.observacao
        );
      END IF;
    END LOOP;

    v_pct := CASE WHEN COALESCE(v_tanque.capacidade_maxima_l, 0) > 0
                  THEN ROUND(GREATEST(v_saldo, 0) / v_tanque.capacidade_maxima_l * 100, 1) ELSE NULL END;

    v_tanques := v_tanques || jsonb_build_object(
      'id', v_tanque.id,
      'nome', v_tanque.nome,
      'combustivel', v_tanque.tipo_combustivel,
      'capacidade_l', v_tanque.capacidade_maxima_l,
      'limite_alerta_l', v_tanque.limite_alerta_l,
      'saldo_inicial_l', v_saldo_ini,
      'entradas_l', v_ent_l,
      'entradas_valor', v_ent_v,
      'baixas_l', v_bai_l,
      'baixas_valor', v_bai_v,
      'ajustes_l', v_aju_l,
      'qtd_ajustes', v_qtd_aju,
      'saldo_final_l', v_saldo,
      'saldo_atual_l', v_tanque.saldo_atual_l,
      'custo_medio_l', v_tanque.custo_medio_l,
      'valor_estoque', ROUND(GREATEST(v_saldo, 0) * v_tanque.custo_medio_l, 2),
      'pct_capacidade', v_pct,
      'negativo', v_saldo < 0,
      'abaixo_limite', COALESCE(v_tanque.limite_alerta_l, 0) > 0 AND v_saldo <= v_tanque.limite_alerta_l
    );
  END LOOP;

  RETURN jsonb_build_object(
    'fazenda_id', v_fazenda_id,
    'dados', jsonb_build_object(
      'gerado_em', now(),
      'data_inicio', p_data_inicio,
      'data_fim', p_data_fim,
      'tanques', v_tanques,
      'movimentacoes', v_movs
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_estoque_combustivel(uuid, date, date) TO anon, authenticated;

-- Variante para o Infografico Mensal: recebe fazenda_id, valida acesso do usuario autenticado
-- e reutiliza a RPC publica via token temporario.
CREATE OR REPLACE FUNCTION public.get_dados_relatorio_estoque_combustivel_fazenda(
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
  VALUES (p_fazenda_id, 'estoque_combustivel', 'Relatório temporário')
  RETURNING id INTO v_token;
  v_result := public.get_dados_relatorio_estoque_combustivel(v_token, p_data_inicio, p_data_fim);
  DELETE FROM public.relatorios_publicos WHERE id = v_token;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dados_relatorio_estoque_combustivel_fazenda(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_estoque_combustivel_fazenda(uuid, date, date) TO authenticated;
