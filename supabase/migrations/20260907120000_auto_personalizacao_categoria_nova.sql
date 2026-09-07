-- Trigger AFTER INSERT em lote_categorias que cria plano_categoria_personalizacao
-- automaticamente quando a categoria nova pertence a um lote que ja tem plano nutricional
-- ativo (por lote, lote_id NOT NULL).
--
-- Problema original: ao adicionar uma categoria a um lote cujo plano ja estava ativo,
-- nenhuma personalizacao era criada. O PWA (getPlanoNutricionalAtivoByLoteId) entao
-- dividia totalPesoInicio (so das categorias com personalizacao) por totalCabecas (todas),
-- produzindo peso_inicio medio artificialmente baixo e, consequentemente, PV projetado
-- 5x menor que o real no texto compartilhado de suplementacao.
--
-- A trigger cobre todos os fluxos de entrada de categorias: Lotes.tsx, recategorizacao
-- via RPC, transferencia entre fazendas, movimentacao. Bezerro ao pe e bezerra ao pe
-- sao excluidos (nao tem GMD nem peso_inicio na logica do PWA).

CREATE OR REPLACE FUNCTION public.auto_personalizacao_categoria_nova()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_plano RECORD;
    v_form RECORD;
    v_gmd numeric;
BEGIN
    -- So dispara para INSERT de categoria ativa
    IF NEW.ativo IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    -- Bezerro ao pe e bezerra ao pe nao recebem personalizacao (nao tem GMD nem peso_inicio)
    IF LOWER(unaccent(NEW.categoria)) ILIKE 'bezerro ao pe' OR
       LOWER(unaccent(NEW.categoria)) ILIKE 'bezerra ao pe' THEN
        RETURN NEW;
    END IF;

    -- Buscar plano nutricional ativo do lote (por lote, lote_id NOT NULL)
    SELECT * INTO v_plano
    FROM public.planos_nutricionais
    WHERE lote_id = NEW.lote_id
      AND ativo = true
      AND data_fim IS NULL
    LIMIT 1;

    -- Se nao ha plano ativo por lote, nao ha nada a fazer
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- Verificar se a categoria tem GMD definido na formulacao do plano
    SELECT fcg.gmd INTO v_gmd
    FROM public.formulacao_categorias_gmd fcg
    WHERE fcg.formulacao_id = v_plano.formulacao_id
      AND LOWER(TRIM(fcg.categoria)) = LOWER(TRIM(NEW.categoria));

    -- Se a categoria nao tem GMD na formulacao, nao criar personalizacao
    -- (categoria nao e elegivel para projecao de peso pelo PWA)
    IF v_gmd IS NULL THEN
        RETURN NEW;
    END IF;

    -- Criar personalizacao com peso_inicio = peso_vivo_atual_kg_cab da categoria nova
    -- ON CONFLICT protege contra re-execucao (categoria recriada, etc.)
    INSERT INTO public.plano_categoria_personalizacao
        (plano_id, lote_categoria_id, periodo_dias, peso_meta_kg, peso_inicio_kg_cab, ativo)
    VALUES
        (v_plano.id, NEW.id, v_plano.periodo_dias, v_plano.peso_meta_kg, NEW.peso_vivo_atual_kg_cab, true)
    ON CONFLICT (plano_id, lote_categoria_id) DO UPDATE
    SET ativo = true,
        peso_inicio_kg_cab = COALESCE(plano_categoria_personalizacao.peso_inicio_kg_cab, EXCLUDED.peso_inicio_kg_cab),
        periodo_dias = EXCLUDED.periodo_dias,
        peso_meta_kg = EXCLUDED.peso_meta_kg;

    RETURN NEW;
END;
$function$;

-- Comentario para auditoria
COMMENT ON FUNCTION public.auto_personalizacao_categoria_nova() IS
'Cria plano_categoria_personalizacao automaticamente quando uma categoria nova e inserida em um lote que ja tem plano nutricional ativo por lote. Previne categorias orfas de personalizacao, que causavam PV medio errado no texto compartilhado de suplementacao do PWA. Bezerro/bezerra ao pe e categorias sem GMD na formulacao sao excluidas.';

-- Trigger AFTER INSERT (nao dispara em UPDATE, para nao sobrescrever personalizacao existente)
DROP TRIGGER IF EXISTS trg_auto_personalizacao_categoria_nova ON public.lote_categorias;
CREATE TRIGGER trg_auto_personalizacao_categoria_nova
    AFTER INSERT ON public.lote_categorias
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_personalizacao_categoria_nova();
