-- Corrige sync_baixa_abastecimento para cobrir o caso de abastecimento com
-- baixa existente mas tanque_id NULL (registros anteriores a coluna tanque_id,
-- criada em 20260915150000). Antes, mudanca de total_abastecido nesses registros
-- nao atualizava a baixa porque o bloco exigia tanque_id NOT NULL.
--
-- Nova logica: os caminhos que dependem da baixa existente (ajustar ou remover)
-- nao exigem tanque_id; so a criacao de baixa exige.

CREATE OR REPLACE FUNCTION public.sync_baixa_abastecimento()
RETURNS TRIGGER AS $$
DECLARE
  v_baixa uuid := NEW.baixa_estoque_id;
  v_mov_id uuid;
  v_custo_medio numeric(12,4);
  v_tz text;
BEGIN
  -- Nada relevante mudou (ex.: update so de baixa_estoque_id, nome, etc.)
  IF OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at
     AND OLD.tanque_id IS NOT DISTINCT FROM NEW.tanque_id
     AND OLD.total_abastecido IS NOT DISTINCT FROM NEW.total_abastecido THEN
    RETURN NEW;
  END IF;

  -- Soft-delete: estorna a baixa vinculada
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    IF v_baixa IS NOT NULL THEN
      DELETE FROM public.movimentacoes_combustivel WHERE id = v_baixa;
      v_baixa := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- Troca de tanque: estorna a baixa antiga; a nova e criada abaixo
  IF OLD.tanque_id IS DISTINCT FROM NEW.tanque_id AND v_baixa IS NOT NULL THEN
    DELETE FROM public.movimentacoes_combustivel WHERE id = v_baixa;
    v_baixa := NULL;
  END IF;

  IF NEW.deleted_at IS NULL THEN
    IF NEW.total_abastecido IS NULL OR NEW.total_abastecido <= 0 THEN
      -- Total zerado/nulo: remove a baixa se existir
      IF v_baixa IS NOT NULL THEN
        DELETE FROM public.movimentacoes_combustivel WHERE id = v_baixa;
      END IF;
    ELSIF v_baixa IS NULL AND NEW.tanque_id IS NOT NULL THEN
      -- Sem baixa mas deveria ter: troca de tanque, restore de soft-delete
      -- ou estorno manual. Recria com o custo medio atual do tanque.
      SELECT custo_medio_l INTO v_custo_medio
        FROM public.tanques_combustivel WHERE id = NEW.tanque_id FOR UPDATE;
      IF FOUND THEN
        SELECT COALESCE(timezone, 'America/Cuiaba') INTO v_tz
          FROM public.fazendas WHERE id = NEW.fazenda_id;
        INSERT INTO public.movimentacoes_combustivel (
          fazenda_id, tanque_id, tipo_movimentacao, quantidade_l,
          preco_por_litro, data, origem, registro_abastecimento_id
        ) VALUES (
          NEW.fazenda_id, NEW.tanque_id, 'baixa', NEW.total_abastecido,
          v_custo_medio,
          (NEW.data AT TIME ZONE COALESCE(v_tz, 'America/Cuiaba'))::date,
          'auto_baixa', NEW.id
        ) RETURNING id INTO v_mov_id;
        UPDATE public.registros_abastecimento
          SET baixa_estoque_id = v_mov_id WHERE id = NEW.id;
      END IF;
    ELSIF v_baixa IS NOT NULL AND OLD.total_abastecido IS DISTINCT FROM NEW.total_abastecido THEN
      -- Total mudou: ajusta a quantidade da baixa (mesmo sem tanque_id no
      -- abastecimento; a baixa carrega o proprio tanque)
      UPDATE public.movimentacoes_combustivel
        SET quantidade_l = NEW.total_abastecido
        WHERE id = v_baixa;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public';
