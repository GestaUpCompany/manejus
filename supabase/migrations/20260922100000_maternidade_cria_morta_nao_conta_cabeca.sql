-- ----------------------------------------------------------------------------
-- Natimorto/Aborto: a cria morta nunca conta cabeça no rebanho.
--
-- calculate_quant_atual() contava registros_maternidade por sexo sem olhar
-- tipo_parto. Um natimorto de parto único (registrado com sexo preenchido)
-- entrava como +1 em Bezerro/Bezerra ao Pé. fn_ensure_categoria_bezerro_ao_pe()
-- também criava a categoria com quant_inicial=1 nesse caso.
-- Agora registros cujo tipo_parto contém 'Aborto' ou 'Natimorto' são ignorados
-- nas duas funções, independente de sexo preenchido.
-- ----------------------------------------------------------------------------

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
    AND (motivo_movimentacao IN ('Consumo', 'Saída') OR (motivo_movimentacao = 'Entrevero' AND lote_destino_id IS NULL))
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

  v_quant_atual := v_quant_inicial + v_sum_entradas - v_sum_saidas - v_sum_transf_saida + v_sum_transf_entrada + v_maternidade_count - v_morte_count;

  IF v_quant_atual < 0 THEN
    v_quant_atual := 0;
  END IF;

  RETURN v_quant_atual;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_ensure_categoria_bezerro_ao_pe()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_categoria_nome text;
  v_sexo_cat text;
  v_existe boolean;
  v_peso numeric;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;
  IF NEW.lote_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.sexo IS NULL THEN
    RETURN NEW;
  END IF;

  -- Cria morta (aborto ou natimorto): não entra no rebanho nem cria categoria.
  IF NEW.tipo_parto IS NOT NULL
     AND (NEW.tipo_parto ? 'Aborto' OR NEW.tipo_parto ? 'Natimorto') THEN
    RETURN NEW;
  END IF;

  IF LOWER(TRIM(NEW.sexo)) IN ('macho', 'm') THEN
    v_categoria_nome := 'Bezerro ao Pé';
    v_sexo_cat := 'Macho';
  ELSIF LOWER(TRIM(NEW.sexo)) IN ('fêmea', 'femea', 'f') THEN
    v_categoria_nome := 'Bezerra ao Pé';
    v_sexo_cat := 'Fêmea';
  ELSE
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.lote_categorias
    WHERE lote_id = NEW.lote_id
      AND LOWER(categoria) = LOWER(v_categoria_nome)
      AND ativo = true
  ) INTO v_existe;

  IF v_existe THEN
    RETURN NEW;
  END IF;

  v_peso := COALESCE(NEW.peso_cria_kg, 30);

  BEGIN
    INSERT INTO public.lote_categorias (
      lote_id, categoria, quant_inicial, quant_atual,
      data_pesagem, peso_entrada_kg_cab, peso_entrada_arrobas,
      peso_vivo_atual_kg_cab, peso_vivo_atual_arroba_cab,
      sexo, ativo, created_at,
      morte, consumo, abate, transf_entrada, transf_saida, qtd_bezerros,
      periodo, gmd, rc_inicial, rc_final, rc_atual,
      peso_vivo_meta_kg_cab, dias_restantes_meta,
      consumo_meta_porcentagem_pesovivo, peso_venda_meta_arroba,
      margem_lucro_percent, preco_custo_reais_arroba, preco_custo_cab,
      preco_venda_projetado_reais_arroba, preco_venda_sugerido_cab,
      producao_atual_arroba_cab, producao_projetada_arroba_cab,
      preco_entrada_reais_arroba, preco_entrada_reais_kg, preco_entrada_reais_cab,
      faturamento_projetado_reais_lote_categoria,
      venda_total_arroba_lote_categoria, agio_percent,
      custo_frete_reais_cab, custo_comissao_reais_cab,
      custo_sanidade_reais_cab, custo_identificacao_rastreabilidade_reais_cab,
      custo_total_entrada_reais_cab, custo_total_entrada_reais_lote,
      custo_operacional_reais_cab_dia, idade, raca,
      estrategia_nutricional, data_ajuste_peso
    ) VALUES (
      NEW.lote_id, v_categoria_nome, 1, 1,
      NEW.data::date, v_peso, NULL,
      v_peso, NULL,
      v_sexo_cat, true, NEW.data + interval '1 second',
      0, 0, 0, 0, 0, 0,
      0, 0, NULL, NULL, NULL,
      NULL, NULL,
      NULL, NULL,
      NULL, NULL, NULL,
      NULL, NULL,
      NULL, NULL,
      NULL, NULL, NULL,
      NULL,
      NULL, NULL,
      NULL, NULL,
      NULL, NULL,
      NULL, NULL, NEW.raca,
      NULL, NULL
    );
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  RETURN NEW;
END;
$function$;
