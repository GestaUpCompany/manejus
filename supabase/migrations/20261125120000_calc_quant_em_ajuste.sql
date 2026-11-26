-- ============================================================================
-- calculate_quant_em passa a contar os ajustes manuais de quantidade
-- ============================================================================
-- calculate_quant_atual ja soma movimentacoes motivo='Ajuste' (tipo_entrada/tipo_saida='Ajuste'),
-- mas calculate_quant_em (saldo historico usado pelo relatorio de consumo) nao. Lotes cujas
-- cabecas entraram por ajuste (ex.: recategorizacao) ficavam com saldo 0 no periodo e o
-- relatorio mostrava "saldo de cabecas no periodo" em vez dos dados.
-- Caso: Maringa - Retiro Nova, LOTE 01 NOVA 10,11,12 (ff251cc2-...), 25/11/2026.
-- Rollback: supabase/rollbacks/20261125120000_calc_quant_em_ajuste_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_quant_em(p_lote_id uuid, p_categoria text, p_ate timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_quant_inicial_raw INTEGER;
  v_quant_base_raw INTEGER;
  v_created_at timestamptz;
  v_date_cutoff timestamptz;
  v_entradas INTEGER;
  v_saidas INTEGER;
  v_transf_saida INTEGER;
  v_transf_entrada INTEGER;
  v_maternidade INTEGER;
  v_morte INTEGER;
  v_ajuste_entrada INTEGER;
  v_ajuste_saida INTEGER;
  v_quant INTEGER;
BEGIN
  SELECT quant_inicial, quant_base, created_at
  INTO v_quant_inicial_raw, v_quant_base_raw, v_created_at
  FROM lote_categorias
  WHERE lote_id = p_lote_id AND LOWER(categoria) = LOWER(p_categoria) AND ativo = true
  LIMIT 1;

  IF v_created_at IS NULL THEN RETURN 0; END IF;

  v_quant_inicial_raw := COALESCE(v_quant_base_raw, v_quant_inicial_raw);
  v_date_cutoff := CASE WHEN v_quant_inicial_raw IS NULL THEN '1900-01-01'::timestamptz ELSE v_created_at END;

  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_entradas
  FROM registros_movimentacao
  WHERE lote_origem_id = p_lote_id AND LOWER(categoria) = LOWER(p_categoria)
    AND motivo_movimentacao = 'Entrada'
    AND data >= v_date_cutoff AND data < p_ate AND deleted_at IS NULL;

  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_saidas
  FROM registros_movimentacao
  WHERE lote_origem_id = p_lote_id AND LOWER(categoria) = LOWER(p_categoria)
    AND (motivo_movimentacao IN ('Consumo', 'Saída', 'Doação') OR (motivo_movimentacao = 'Entrevero' AND lote_destino_id IS NULL))
    AND tipo_saida IS NULL
    AND data >= v_date_cutoff AND data < p_ate AND deleted_at IS NULL;

  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_transf_saida
  FROM registros_movimentacao
  WHERE lote_origem_id = p_lote_id AND LOWER(categoria) = LOWER(p_categoria)
    AND (tipo_saida IN ('Transferência', 'Apartação') OR (motivo_movimentacao = 'Entrevero' AND lote_destino_id IS NOT NULL))
    AND data >= v_date_cutoff AND data < p_ate AND deleted_at IS NULL;

  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_transf_entrada
  FROM registros_movimentacao
  WHERE lote_destino_id = p_lote_id AND LOWER(categoria) = LOWER(p_categoria)
    AND (tipo_entrada IN ('Transferência', 'Apartação') OR motivo_movimentacao = 'Entrevero' OR (tipo_entrada IS NULL AND lote_destino_id IS NOT NULL))
    AND (subtipo IS NULL OR subtipo <> 'Novo Lote')
    AND data >= v_date_cutoff AND data < p_ate AND deleted_at IS NULL;

  -- Ajustes manuais de quantidade (mesma regra de calculate_quant_atual)
  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_ajuste_entrada
  FROM registros_movimentacao
  WHERE lote_origem_id = p_lote_id AND LOWER(categoria) = LOWER(p_categoria)
    AND motivo_movimentacao = 'Ajuste' AND tipo_entrada = 'Ajuste'
    AND data >= v_date_cutoff AND data < p_ate AND deleted_at IS NULL;

  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_ajuste_saida
  FROM registros_movimentacao
  WHERE lote_origem_id = p_lote_id AND LOWER(categoria) = LOWER(p_categoria)
    AND motivo_movimentacao = 'Ajuste' AND tipo_saida = 'Ajuste'
    AND data >= v_date_cutoff AND data < p_ate AND deleted_at IS NULL;

  IF LOWER(unaccent(p_categoria)) ILIKE 'bezerro ao pe' THEN
    SELECT COUNT(*) INTO v_maternidade FROM registros_maternidade
    WHERE lote_id = p_lote_id AND sexo = 'Macho' AND data >= v_date_cutoff AND data < p_ate AND deleted_at IS NULL
      AND (tipo_parto IS NULL OR NOT (tipo_parto ? 'Aborto' OR tipo_parto ? 'Natimorto'));
  ELSIF LOWER(unaccent(p_categoria)) ILIKE 'bezerra ao pe' THEN
    SELECT COUNT(*) INTO v_maternidade FROM registros_maternidade
    WHERE lote_id = p_lote_id AND sexo = 'Fêmea' AND data >= v_date_cutoff AND data < p_ate AND deleted_at IS NULL
      AND (tipo_parto IS NULL OR NOT (tipo_parto ? 'Aborto' OR tipo_parto ? 'Natimorto'));
  ELSE
    v_maternidade := 0;
  END IF;

  SELECT COUNT(*) INTO v_morte FROM registros_morte
  WHERE lote_id = p_lote_id AND LOWER(categoria) = LOWER(p_categoria)
    AND data >= v_date_cutoff AND data < p_ate AND deleted_at IS NULL;

  v_quant := COALESCE(v_quant_inicial_raw, 0) + v_entradas - v_saidas - v_transf_saida + v_transf_entrada + v_maternidade - v_morte
             + v_ajuste_entrada - v_ajuste_saida;
  RETURN GREATEST(v_quant, 0);
END;
$function$;
