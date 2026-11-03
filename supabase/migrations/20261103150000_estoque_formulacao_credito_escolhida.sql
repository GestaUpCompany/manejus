-- ============================================================================
-- Estoque compartilhado de formulação: destino escolhido na hora da produção
-- ============================================================================
-- Substitui o vínculo de formulações irmãs (20261103130000) por uma escolha
-- explícita no registro: o peão diz em QUAL formulação da fazenda de crédito o
-- produto entra. Sem cadastro prévio, sem backfill e sem tela de vínculo.
--
-- registros_saida_insumos.formulacao_credito_id = formulação que recebe o
-- produto na fazenda_credito_id. O banco valida que ela é da fazenda de
-- crédito, ativa e com controle de estoque, e que as duas fazendas são do
-- mesmo grupo. Nada vindo do cliente é confiado.
--
-- Remove o que a migration anterior criou e deixa de ser usado:
-- formulacoes.formulacao_grupo_id (nunca preenchida), seus índices, o helper
-- formulacao_irma_na_fazenda e a RPC fazendas_destino_formulacao.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Coluna nova
-- ----------------------------------------------------------------------------
ALTER TABLE public.registros_saida_insumos
  ADD COLUMN IF NOT EXISTS formulacao_credito_id uuid REFERENCES public.formulacoes(id);

COMMENT ON COLUMN public.registros_saida_insumos.formulacao_credito_id IS
  'Formulação da fazenda_credito_id que recebe o produto. Obrigatória quando há fazenda_credito_id; nula caso contrário.';

-- ----------------------------------------------------------------------------
-- 2. Validação do destino no cabeçalho da produção
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_valida_fazenda_credito()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grupo_origem uuid;
  v_grupo_destino uuid;
  v_ok boolean;
BEGIN
  -- Normaliza: crédito na própria fazenda é o mesmo que nulo
  IF NEW.fazenda_credito_id IS NOT DISTINCT FROM NEW.fazenda_id THEN
    NEW.fazenda_credito_id := NULL;
  END IF;
  IF NEW.fazenda_credito_id IS NULL THEN
    NEW.formulacao_credito_id := NULL;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (OLD.fazenda_credito_id IS DISTINCT FROM NEW.fazenda_credito_id
          OR OLD.formulacao_credito_id IS DISTINCT FROM NEW.formulacao_credito_id)
     AND EXISTS (SELECT 1 FROM public.saida_insumos_itens i WHERE i.saida_id = NEW.id) THEN
    RAISE EXCEPTION 'FAZENDA_CREDITO_IMUTAVEL: não é possível trocar o destino do estoque de uma produção já lançada';
  END IF;

  IF NEW.fazenda_credito_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT grupo_id INTO v_grupo_origem  FROM public.fazendas WHERE id = NEW.fazenda_id;
  SELECT grupo_id INTO v_grupo_destino FROM public.fazendas WHERE id = NEW.fazenda_credito_id;

  IF v_grupo_origem IS NULL OR v_grupo_origem IS DISTINCT FROM v_grupo_destino THEN
    RAISE EXCEPTION 'FAZENDA_CREDITO_FORA_DO_GRUPO: a fazenda de crédito precisa ser do mesmo grupo da fazenda que produz';
  END IF;

  IF NEW.formulacao_credito_id IS NULL THEN
    RAISE EXCEPTION 'FORMULACAO_CREDITO_OBRIGATORIA: escolha a formulação da fazenda de crédito que recebe o produto';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.formulacoes f
    WHERE f.id = NEW.formulacao_credito_id
      AND f.fazenda_id = NEW.fazenda_credito_id
      AND f.deleted_at IS NULL
      AND COALESCE(f.ativo, true)
      AND COALESCE(f.controla_estoque, false)
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'FORMULACAO_CREDITO_INVALIDA: a formulação escolhida não é uma formulação ativa, com controle de estoque, da fazenda de crédito';
  END IF;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Cascata: 'producao' da formulação vai para a formulação escolhida
--    Base: 20261103130000_estoque_formulacao_compartilhado_grupo.sql
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_saida_insumos_itens_mov()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fazenda_id uuid;
  v_fazenda_credito_id uuid;
  v_formulacao_id uuid;
  v_formulacao_credito_id uuid;
  v_formulacao_alvo_id uuid;
  v_fazenda_alvo_id uuid;
  v_data date;
  v_custo_insumo numeric;
  v_controla boolean := false;
  v_observacao text;
BEGIN
  SELECT r.fazenda_id, r.fazenda_credito_id, r.formulacao_id, r.formulacao_credito_id, r.data_producao
  INTO v_fazenda_id, v_fazenda_credito_id, v_formulacao_id, v_formulacao_credito_id, v_data
  FROM public.registros_saida_insumos r
  WHERE r.id = COALESCE(NEW.saida_id, OLD.saida_id);

  IF v_fazenda_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE public.movimentacoes_estoque_suplementos
    SET deleted_at = NOW()
    WHERE registro_origem_id = OLD.id AND deleted_at IS NULL;
    RETURN OLD;
  END IF;

  -- Retry de upsert idêntico: no-op
  IF TG_OP = 'UPDATE'
     AND OLD.saida_id IS NOT DISTINCT FROM NEW.saida_id
     AND OLD.insumo_id IS NOT DISTINCT FROM NEW.insumo_id
     AND OLD.quantidade IS NOT DISTINCT FROM NEW.quantidade THEN
    RETURN NEW;
  END IF;

  -- Alvo do crédito: a própria fazenda/formulação ou a formulação escolhida na fazenda de crédito
  IF v_fazenda_credito_id IS NULL OR v_fazenda_credito_id = v_fazenda_id THEN
    v_fazenda_alvo_id := v_fazenda_id;
    v_formulacao_alvo_id := v_formulacao_id;
  ELSE
    IF v_formulacao_credito_id IS NULL THEN
      RAISE EXCEPTION 'FORMULACAO_CREDITO_OBRIGATORIA: escolha a formulação da fazenda de crédito que recebe o produto';
    END IF;
    v_fazenda_alvo_id := v_fazenda_credito_id;
    v_formulacao_alvo_id := v_formulacao_credito_id;
    SELECT 'Produzido em ' || f.nome INTO v_observacao
    FROM public.fazendas f WHERE f.id = v_fazenda_id;
  END IF;

  IF v_formulacao_alvo_id IS NOT NULL THEN
    SELECT COALESCE(f.controla_estoque, false)
    INTO v_controla
    FROM public.formulacoes f
    WHERE f.id = v_formulacao_alvo_id;
  END IF;

  -- Baixa de insumo divergente do item atual
  UPDATE public.movimentacoes_estoque_suplementos
  SET deleted_at = NOW()
  WHERE registro_origem_id = NEW.id
    AND deleted_at IS NULL
    AND tipo_movimentacao = 'baixa'
    AND (item_tipo <> 'insumo' OR item_id IS DISTINCT FROM NEW.insumo_id);

  -- Producao de formulacao divergente (item ou fazenda) ou sem alvo válido
  UPDATE public.movimentacoes_estoque_suplementos
  SET deleted_at = NOW()
  WHERE registro_origem_id = NEW.id
    AND deleted_at IS NULL
    AND tipo_movimentacao = 'producao'
    AND (item_tipo <> 'formulacao'
         OR item_id IS DISTINCT FROM v_formulacao_alvo_id
         OR fazenda_id IS DISTINCT FROM v_fazenda_alvo_id
         OR NOT v_controla);

  -- Espelha a baixa do insumo (sempre na fazenda que produz)
  UPDATE public.movimentacoes_estoque_suplementos
  SET quantidade = NEW.quantidade,
      data = v_data,
      deleted_at = NULL
  WHERE registro_origem_id = NEW.id
    AND item_tipo = 'insumo'
    AND item_id = NEW.insumo_id
    AND tipo_movimentacao = 'baixa';

  IF NOT FOUND THEN
    PERFORM public.inserir_movimentacao_estoque(
      v_fazenda_id,
      'insumo',
      NEW.insumo_id,
      'baixa',
      NEW.quantidade,
      p_origem := 'saida_insumos',
      p_registro_origem_id := NEW.id,
      p_data := v_data
    );
  END IF;

  -- Espelha a producao da formulacao (quando controla estoque), na fazenda/formulação alvo
  IF v_controla AND v_formulacao_alvo_id IS NOT NULL THEN
    SELECT custo_unitario INTO v_custo_insumo
    FROM public.insumos
    WHERE id = NEW.insumo_id;

    UPDATE public.movimentacoes_estoque_suplementos
    SET quantidade = NEW.quantidade,
        custo_unitario = v_custo_insumo,
        data = v_data,
        deleted_at = NULL
    WHERE registro_origem_id = NEW.id
      AND item_tipo = 'formulacao'
      AND item_id = v_formulacao_alvo_id
      AND fazenda_id = v_fazenda_alvo_id
      AND tipo_movimentacao = 'producao';

    IF NOT FOUND THEN
      PERFORM public.inserir_movimentacao_estoque(
        v_fazenda_alvo_id,
        'formulacao',
        v_formulacao_alvo_id,
        'producao',
        NEW.quantidade,
        p_custo_unitario := v_custo_insumo,
        p_origem := 'saida_insumos',
        p_registro_origem_id := NEW.id,
        p_data := v_data,
        p_observacao := v_observacao
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. RPC de leitura: formulações de uma fazenda do grupo que podem receber produto
--    (o peão não lê formulacoes de outra fazenda por RLS)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.formulacoes_fazenda_destino(
  p_fazenda_origem_id uuid,
  p_fazenda_destino_id uuid
)
RETURNS TABLE (id uuid, nome text, tipo text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grupo_origem uuid;
  v_grupo_destino uuid;
BEGIN
  IF p_fazenda_origem_id IS NULL OR p_fazenda_destino_id IS NULL
     OR p_fazenda_origem_id = p_fazenda_destino_id
     OR NOT public.caller_has_fazenda_access(p_fazenda_origem_id) THEN
    RETURN;
  END IF;

  SELECT grupo_id INTO v_grupo_origem  FROM public.fazendas WHERE fazendas.id = p_fazenda_origem_id;
  SELECT grupo_id INTO v_grupo_destino FROM public.fazendas WHERE fazendas.id = p_fazenda_destino_id AND COALESCE(fazendas.ativo, true);

  IF v_grupo_origem IS NULL OR v_grupo_origem IS DISTINCT FROM v_grupo_destino THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT f.id, f.nome::text, f.tipo::text
  FROM public.formulacoes f
  WHERE f.fazenda_id = p_fazenda_destino_id
    AND f.deleted_at IS NULL
    AND COALESCE(f.ativo, true)
    AND COALESCE(f.controla_estoque, false)
  ORDER BY f.nome;
END;
$$;

REVOKE ALL ON FUNCTION public.formulacoes_fazenda_destino(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.formulacoes_fazenda_destino(uuid, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Remove o vínculo de irmãs (nunca foi preenchido nem usado em produção)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fazendas_destino_formulacao(uuid);
DROP FUNCTION IF EXISTS public.formulacao_irma_na_fazenda(uuid, uuid);
DROP INDEX IF EXISTS public.uq_formulacoes_fazenda_grupo;
DROP INDEX IF EXISTS public.idx_formulacoes_formulacao_grupo_id;
ALTER TABLE public.formulacoes DROP COLUMN IF EXISTS formulacao_grupo_id;
