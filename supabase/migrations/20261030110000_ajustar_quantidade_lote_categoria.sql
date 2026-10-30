-- ============================================================================
-- Ajuste de quantidade por categoria (parte 2 de 2): fórmula + RPC
-- ============================================================================
-- quant_atual é derivado de calculate_quant_atual; um UPDATE direto seria desfeito no próximo
-- recálculo. O ajuste é um registro em registros_movimentacao com motivo 'Ajuste':
--   aumento: lote_origem_id = lote, tipo_entrada = 'Ajuste'
--   redução: lote_origem_id = lote, tipo_saida   = 'Ajuste'
--   numero_cabecas sempre positivo; lote_destino_id NULL (nenhuma outra soma o captura:
--   saídas simples exigem motivo Consumo/Saída/Doação, transferências exigem tipo_saida
--   Transferência/Apartação ou destino preenchido).
-- Os triggers existentes já recalculam: update_quant_atual_movimentacao (INSERT, categoria existente)
-- e trg_movimentacao_recalc_quant_update (soft-delete/edição). Categoria nova é criada pela RPC
-- (mesmo padrão do bloco Entrada: quant_inicial = cabeças, quant_base = 0, created_at = data).
-- trg_movimentacao_ajusta_data já empurra data < created_at da categoria para now().
-- Impacto no PWA: nenhum (o PWA não grava Ajuste). Espelho no front: saldoCabecasNaData.ts.
-- Rollback: supabase/rollbacks/20261030110000_ajustar_quantidade_lote_categoria_rollback.sql
-- ============================================================================

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
    AND (tipo_saida IN ('Transferência', 'Apartação') OR (motivo_movimentacao = 'Entrevero' AND lote_destino_id IS NOT NULL))
    AND data >= v_date_cutoff
    AND deleted_at IS NULL;

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

-- ----------------------------------------------------------------------------
-- RPC: leva a categoria do lote à quantidade informada gravando o movimento de ajuste.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ajustar_quantidade_lote_categoria(
  p_fazenda_id uuid,
  p_lote_id uuid,
  p_categoria text,
  p_nova_quantidade integer,
  p_observacao text,
  p_usuario_id uuid,
  p_usuario_email text,
  p_peso_kg numeric DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_is_controller boolean;
  v_lote_nome text;
  v_categoria text := LOWER(TRIM(COALESCE(p_categoria, '')));
  v_lc lote_categorias%ROWTYPE;
  v_antes integer;
  v_delta integer;
  v_agora timestamptz := now();
  v_responsavel text;
  v_mov_id uuid;
  v_depois integer;
BEGIN
  PERFORM set_config('app.current_user_id', p_usuario_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(p_usuario_email, ''), true);

  SELECT EXISTS(
    SELECT 1 FROM usuario_fazenda uf
    WHERE uf.usuario_id = p_usuario_id AND uf.fazenda_id = p_fazenda_id
      AND uf.papel IN ('admin', 'controller') AND uf.ativo = true
  ) INTO v_is_controller;
  IF NOT v_is_controller THEN
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem ajustar quantidades';
  END IF;

  IF v_categoria = '' THEN RAISE EXCEPTION 'Informe a categoria'; END IF;
  IF p_nova_quantidade IS NULL OR p_nova_quantidade < 0 THEN
    RAISE EXCEPTION 'A nova quantidade deve ser zero ou maior';
  END IF;
  IF p_observacao IS NULL OR LENGTH(TRIM(p_observacao)) = 0 THEN
    RAISE EXCEPTION 'Informe o motivo do ajuste';
  END IF;

  SELECT nome INTO v_lote_nome FROM lotes
  WHERE id = p_lote_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote não encontrado nesta fazenda'; END IF;

  SELECT COALESCE(NULLIF(TRIM(nome), ''), p_usuario_email) INTO v_responsavel
  FROM usuarios WHERE id = p_usuario_id;

  SELECT * INTO v_lc FROM lote_categorias
  WHERE lote_id = p_lote_id AND LOWER(categoria) = v_categoria AND ativo = true
  LIMIT 1;

  IF FOUND THEN
    v_antes := calculate_quant_atual(p_lote_id, v_categoria);
    v_delta := p_nova_quantidade - v_antes;
    IF v_delta = 0 THEN RAISE EXCEPTION 'A quantidade informada já é a atual (%)', v_antes; END IF;
  ELSE
    -- Categoria inexistente no lote: só faz sentido criar com quantidade positiva.
    IF p_nova_quantidade = 0 THEN RAISE EXCEPTION 'Categoria % não existe neste lote', v_categoria; END IF;
    v_antes := 0;
    v_delta := p_nova_quantidade;
    -- Mesmo padrão do bloco Entrada de update_quant_atual_movimentacao.
    INSERT INTO lote_categorias (
      lote_id, categoria, quant_inicial, quant_base, quant_atual,
      data_pesagem, data_ajuste_peso, peso_entrada_kg_cab, peso_vivo_atual_kg_cab, ativo, created_at
    ) VALUES (
      p_lote_id, v_categoria, p_nova_quantidade, 0, p_nova_quantidade,
      (v_agora)::date, (v_agora)::date, p_peso_kg, p_peso_kg, true, v_agora
    );
  END IF;

  INSERT INTO registros_movimentacao (
    fazenda_id, data, lote_origem_id, lote_origem, categoria, numero_cabecas,
    motivo_movimentacao, tipo_entrada, tipo_saida, observacao, responsavel, nome_usuario
  ) VALUES (
    p_fazenda_id, v_agora, p_lote_id, v_lote_nome, v_categoria, ABS(v_delta),
    'Ajuste',
    CASE WHEN v_delta > 0 THEN 'Ajuste' END,
    CASE WHEN v_delta < 0 THEN 'Ajuste' END,
    TRIM(p_observacao), v_responsavel, v_responsavel
  ) RETURNING id INTO v_mov_id;

  -- O trigger de INSERT já recalcula; a releitura confirma o resultado e blinda contra divergência.
  v_depois := calculate_quant_atual(p_lote_id, v_categoria);
  UPDATE lote_categorias SET quant_atual = v_depois
  WHERE lote_id = p_lote_id AND LOWER(categoria) = v_categoria AND ativo = true;

  IF v_depois <> p_nova_quantidade THEN
    RAISE EXCEPTION 'Ajuste não refletiu na quantidade (esperado %, obtido %)', p_nova_quantidade, v_depois;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'movimentacao_id', v_mov_id, 'categoria', v_categoria,
    'quantidade_anterior', v_antes, 'quantidade_atual', v_depois, 'delta', v_delta
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ajustar_quantidade_lote_categoria(uuid, uuid, text, integer, text, uuid, text, numeric) TO authenticated;
