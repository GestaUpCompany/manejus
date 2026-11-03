-- ============================================================================
-- Estoque compartilhado de produto final (formulação) entre fazendas do grupo
-- ============================================================================
-- A Produção Fábrica (registros_saida_insumos) pode creditar a formulação
-- produzida no estoque de OUTRA fazenda do mesmo grupo. Os insumos continuam
-- baixando na fazenda que produz; só a movimentação 'producao' da formulação
-- vai para a fazenda de crédito, no item_id da formulação IRMÃ dela.
--
-- Equivalência entre fazendas: formulacoes.formulacao_grupo_id. Formulações
-- irmãs (uma por fazenda) compartilham o mesmo valor. Nulo = só da própria
-- fazenda. Receita e insumos continuam independentes por fazenda.
--
-- Segurança: o RLS não deixa o peão da fazenda A escrever na fazenda B. A
-- cascata já é SECURITY DEFINER (20261007210000); o destino é validado aqui
-- (mesmo grupo + irmã ativa) e nunca confiado ao cliente.
--
-- Base do trigger: 20261001120000_remover_estorno_espelho_movimentacoes.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas e índices
-- ----------------------------------------------------------------------------
ALTER TABLE public.formulacoes
  ADD COLUMN IF NOT EXISTS formulacao_grupo_id uuid;

COMMENT ON COLUMN public.formulacoes.formulacao_grupo_id IS
  'Vínculo de equivalência entre formulações de fazendas do mesmo grupo. Irmãs compartilham o valor; no máximo uma por fazenda.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_formulacoes_fazenda_grupo
  ON public.formulacoes (fazenda_id, formulacao_grupo_id)
  WHERE formulacao_grupo_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_formulacoes_formulacao_grupo_id
  ON public.formulacoes (formulacao_grupo_id)
  WHERE formulacao_grupo_id IS NOT NULL;

ALTER TABLE public.registros_saida_insumos
  ADD COLUMN IF NOT EXISTS fazenda_credito_id uuid REFERENCES public.fazendas(id);

COMMENT ON COLUMN public.registros_saida_insumos.fazenda_credito_id IS
  'Fazenda cujo estoque recebe a formulação produzida. Nulo (ou igual a fazenda_id) = estoque da própria fazenda.';

-- ----------------------------------------------------------------------------
-- 2. Helper interno: formulação irmã na fazenda de destino
--    Não é chamável como RPC (execute revogado); só os triggers DEFINER usam.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.formulacao_irma_na_fazenda(
  p_formulacao_id uuid,
  p_fazenda_destino_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id
  FROM public.formulacoes o
  JOIN public.formulacoes d
    ON d.formulacao_grupo_id = o.formulacao_grupo_id
  WHERE o.id = p_formulacao_id
    AND o.formulacao_grupo_id IS NOT NULL
    AND d.fazenda_id = p_fazenda_destino_id
    AND d.deleted_at IS NULL
    AND COALESCE(d.ativo, true)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.formulacao_irma_na_fazenda(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Validação do destino no cabeçalho da produção
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
BEGIN
  -- Normaliza: crédito na própria fazenda é o mesmo que nulo
  IF NEW.fazenda_credito_id IS NOT DISTINCT FROM NEW.fazenda_id THEN
    NEW.fazenda_credito_id := NULL;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.fazenda_credito_id IS DISTINCT FROM NEW.fazenda_credito_id
     AND EXISTS (SELECT 1 FROM public.saida_insumos_itens i WHERE i.saida_id = NEW.id) THEN
    RAISE EXCEPTION 'FAZENDA_CREDITO_IMUTAVEL: não é possível trocar a fazenda de crédito de uma produção já lançada';
  END IF;

  IF NEW.fazenda_credito_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT grupo_id INTO v_grupo_origem  FROM public.fazendas WHERE id = NEW.fazenda_id;
  SELECT grupo_id INTO v_grupo_destino FROM public.fazendas WHERE id = NEW.fazenda_credito_id;

  IF v_grupo_origem IS NULL OR v_grupo_origem IS DISTINCT FROM v_grupo_destino THEN
    RAISE EXCEPTION 'FAZENDA_CREDITO_FORA_DO_GRUPO: a fazenda de crédito precisa ser do mesmo grupo da fazenda que produz';
  END IF;

  IF NEW.formulacao_id IS NULL
     OR public.formulacao_irma_na_fazenda(NEW.formulacao_id, NEW.fazenda_credito_id) IS NULL THEN
    RAISE EXCEPTION 'FORMULACAO_SEM_IRMA_NO_DESTINO: a formulação não está vinculada a uma formulação ativa da fazenda de crédito';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_valida_fazenda_credito ON public.registros_saida_insumos;
CREATE TRIGGER trg_valida_fazenda_credito
  BEFORE INSERT OR UPDATE ON public.registros_saida_insumos
  FOR EACH ROW EXECUTE FUNCTION public.trg_valida_fazenda_credito();

-- ----------------------------------------------------------------------------
-- 4. Cascata: 'producao' da formulação vai para a fazenda de crédito
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
  v_formulacao_alvo_id uuid;
  v_fazenda_alvo_id uuid;
  v_data date;
  v_custo_insumo numeric;
  v_controla boolean := false;
  v_observacao text;
BEGIN
  SELECT r.fazenda_id, r.fazenda_credito_id, r.formulacao_id, r.data_producao
  INTO v_fazenda_id, v_fazenda_credito_id, v_formulacao_id, v_data
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

  -- Alvo do crédito: própria fazenda ou formulação irmã na fazenda de crédito
  IF v_fazenda_credito_id IS NULL OR v_fazenda_credito_id = v_fazenda_id THEN
    v_fazenda_alvo_id := v_fazenda_id;
    v_formulacao_alvo_id := v_formulacao_id;
  ELSE
    v_fazenda_alvo_id := v_fazenda_credito_id;
    v_formulacao_alvo_id := public.formulacao_irma_na_fazenda(v_formulacao_id, v_fazenda_credito_id);
    IF v_formulacao_alvo_id IS NULL THEN
      RAISE EXCEPTION 'FORMULACAO_SEM_IRMA_NO_DESTINO: a formulação não está vinculada a uma formulação ativa da fazenda de crédito';
    END IF;
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

  -- Espelha a producao da formulacao (quando controla estoque), na fazenda alvo
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
-- 5. RPC de leitura: fazendas do grupo que podem receber esta formulação
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fazendas_destino_formulacao(p_formulacao_id uuid)
RETURNS TABLE (id uuid, nome text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fazenda_id uuid;
  v_grupo_id uuid;
BEGIN
  SELECT f.fazenda_id INTO v_fazenda_id
  FROM public.formulacoes f
  WHERE f.id = p_formulacao_id AND f.deleted_at IS NULL;

  IF v_fazenda_id IS NULL OR NOT public.caller_has_fazenda_access(v_fazenda_id) THEN
    RETURN;
  END IF;

  SELECT fz.grupo_id INTO v_grupo_id FROM public.fazendas fz WHERE fz.id = v_fazenda_id;
  IF v_grupo_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT fz.id, fz.nome::text
  FROM public.fazendas fz
  WHERE fz.grupo_id = v_grupo_id
    AND fz.id <> v_fazenda_id
    AND COALESCE(fz.ativo, true)
    AND public.formulacao_irma_na_fazenda(p_formulacao_id, fz.id) IS NOT NULL
  ORDER BY fz.nome;
END;
$$;

REVOKE ALL ON FUNCTION public.fazendas_destino_formulacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fazendas_destino_formulacao(uuid) TO authenticated;
