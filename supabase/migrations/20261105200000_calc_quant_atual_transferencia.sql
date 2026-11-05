-- Corrige calculate_quant_atual: a transferência entre fazendas (RPC transferir_lote_entre_fazendas)
-- grava registros_movimentacao com motivo='Transferencia' e subtipo='Saida' (origem) / 'Entrada' (destino),
-- com tipo_saida/tipo_entrada NULL. A função antiga não contava esses motivos, então qualquer recálculo
-- posterior (trigger de movimentação) devolvia as cabeças transferidas ao saldo da origem.
--
-- Regras novas:
--   * Origem: a linha Saida (lote_origem_id = origem) desconta do saldo.
--   * Destino: a linha Entrada (lote_destino_id = destino) soma no saldo; a linha Saida, que também
--     aponta lote_destino_id para o destino, NÃO entra (evita contar duas vezes).

CREATE OR REPLACE FUNCTION public.calculate_quant_atual(p_lote_id uuid, p_categoria text)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_quant_inicial_raw INTEGER;
  v_quant_base_raw INTEGER;
  v_quant_inicial INTEGER;
  v_created_at timestamptz;
  v_date_cutoff timestamptz;
  v_sum_entradas INTEGER;
  v_sum_saidas INTEGER;
  v_sum_transf_saida INTEGER;
  v_sum_transf_entrada INTEGER;
  v_sum_ajuste_entrada INTEGER;
  v_sum_ajuste_saida INTEGER;
  v_maternidade_count INTEGER;
  v_morte_count INTEGER;
  v_quant_atual INTEGER;
BEGIN
  SELECT quant_inicial, quant_base, created_at
  INTO v_quant_inicial_raw, v_quant_base_raw, v_created_at
  FROM lote_categorias
  WHERE lote_id = p_lote_id AND LOWER(categoria) = LOWER(p_categoria)
    AND ativo = true
  LIMIT 1;

  IF v_created_at IS NULL THEN
    RETURN 0;
  END IF;

  -- quant_base (saldo congelado em recategorização in-place) tem precedência
  -- sobre quant_inicial como base de contagem.
  v_quant_inicial_raw := COALESCE(v_quant_base_raw, v_quant_inicial_raw);
  v_quant_inicial := COALESCE(v_quant_inicial_raw, 0);

  IF v_quant_inicial_raw IS NULL THEN
    v_date_cutoff := '1900-01-01'::timestamptz;
  ELSE
    v_date_cutoff := v_created_at;
  END IF;

  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_sum_entradas
  FROM registros_movimentacao
  WHERE lote_origem_id = p_lote_id
    AND LOWER(categoria) = LOWER(p_categoria)
    AND motivo_movimentacao = 'Entrada'
    AND data >= v_date_cutoff
    AND deleted_at IS NULL;

  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_sum_saidas
  FROM registros_movimentacao
  WHERE lote_origem_id = p_lote_id
    AND LOWER(categoria) = LOWER(p_categoria)
    AND (motivo_movimentacao IN ('Consumo', 'Saída', 'Doação') OR (motivo_movimentacao = 'Entrevero' AND lote_destino_id IS NULL))
    AND tipo_saida IS NULL
    AND data >= v_date_cutoff
    AND deleted_at IS NULL;

  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_sum_transf_saida
  FROM registros_movimentacao
  WHERE lote_origem_id = p_lote_id
    AND LOWER(categoria) = LOWER(p_categoria)
    AND (
      tipo_saida IN ('Transferência', 'Apartação')
      OR (motivo_movimentacao = 'Entrevero' AND lote_destino_id IS NOT NULL)
    )
    AND data >= v_date_cutoff
    AND deleted_at IS NULL;

  -- Transferência entre fazendas (RPC transferir_lote_entre_fazendas): a linha Saida desconta da origem.
  -- A RPC grava categoria como texto livre, por categoria: "garrote: 60 cabecas" ou
  -- "bezerro ao pé: 4 cabecas, boi gordo: 35 cabecas". numero_cabecas é o TOTAL da transferência,
  -- então a quantidade de cada categoria é lida do texto.
  -- Não somar no destino: a categoria nova nasce com quant_inicial = cabeças recebidas.
  SELECT v_sum_transf_saida + COALESCE(SUM(m[2]::integer), 0) INTO v_sum_transf_saida
  FROM (
    SELECT regexp_match(t.piece, '^(.+): (\d+) cabecas$') AS m
    FROM registros_movimentacao r
    CROSS JOIN LATERAL unnest(string_to_array(r.categoria, ', ')) AS t(piece)
    WHERE r.lote_origem_id = p_lote_id
      AND r.motivo_movimentacao = 'Transferencia'
      AND r.subtipo = 'Saida'
      AND r.data >= v_date_cutoff
      AND r.deleted_at IS NULL
  ) s
  WHERE LOWER(s.m[1]) = LOWER(p_categoria);

  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_sum_transf_entrada
  FROM registros_movimentacao
  WHERE lote_destino_id = p_lote_id
    AND LOWER(categoria) = LOWER(p_categoria)
    AND (tipo_entrada IN ('Transferência', 'Apartação') OR motivo_movimentacao = 'Entrevero' OR (tipo_entrada IS NULL AND lote_destino_id IS NOT NULL))
    AND (subtipo IS NULL OR subtipo <> 'Novo Lote')
    AND data >= v_date_cutoff
    AND deleted_at IS NULL;

  -- Ajustes manuais de quantidade (correção de lançamentos errados/faltantes).
  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_sum_ajuste_entrada
  FROM registros_movimentacao
  WHERE lote_origem_id = p_lote_id
    AND LOWER(categoria) = LOWER(p_categoria)
    AND motivo_movimentacao = 'Ajuste'
    AND tipo_entrada = 'Ajuste'
    AND data >= v_date_cutoff
    AND deleted_at IS NULL;

  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_sum_ajuste_saida
  FROM registros_movimentacao
  WHERE lote_origem_id = p_lote_id
    AND LOWER(categoria) = LOWER(p_categoria)
    AND motivo_movimentacao = 'Ajuste'
    AND tipo_saida = 'Ajuste'
    AND data >= v_date_cutoff
    AND deleted_at IS NULL;

  IF LOWER(unaccent(p_categoria)) ILIKE 'bezerro ao pe' THEN
    SELECT COUNT(*) INTO v_maternidade_count
    FROM registros_maternidade
    WHERE lote_id = p_lote_id AND sexo = 'Macho' AND data >= v_date_cutoff AND deleted_at IS NULL
      AND (tipo_parto IS NULL OR NOT (tipo_parto ? 'Aborto' OR tipo_parto ? 'Natimorto'));
  ELSIF LOWER(unaccent(p_categoria)) ILIKE 'bezerra ao pe' THEN
    SELECT COUNT(*) INTO v_maternidade_count
    FROM registros_maternidade
    WHERE lote_id = p_lote_id AND sexo = 'Fêmea' AND data >= v_date_cutoff AND deleted_at IS NULL
      AND (tipo_parto IS NULL OR NOT (tipo_parto ? 'Aborto' OR tipo_parto ? 'Natimorto'));
  ELSE
    v_maternidade_count := 0;
  END IF;

  SELECT COUNT(*) INTO v_morte_count
  FROM registros_morte
  WHERE lote_id = p_lote_id
    AND LOWER(categoria) = LOWER(p_categoria)
    AND data >= v_date_cutoff
    AND deleted_at IS NULL;

  v_quant_atual := v_quant_inicial + v_sum_entradas - v_sum_saidas - v_sum_transf_saida + v_sum_transf_entrada
                   + v_sum_ajuste_entrada - v_sum_ajuste_saida
                   + v_maternidade_count - v_morte_count;

  IF v_quant_atual < 0 THEN
    v_quant_atual := 0;
  END IF;

  RETURN v_quant_atual;
END;
$function$;
