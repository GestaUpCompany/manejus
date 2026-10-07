-- Fix: o INSERT em lote_categorias da função tinha 51 colunas e só 49 valores (erro 42601
-- "INSERT has more target columns than expressions"), o que impedia o sync de qualquer cria
-- viva em lote sem a categoria Bezerro/Bezerra ao Pé. Única mudança: faltavam dois NULL para
-- custo_total_entrada_reais_cab e custo_total_entrada_reais_lote. Resto igual à versão anterior.
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
