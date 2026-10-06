-- ============================================================================
-- Redução de writes no caminho de sync: guarda no replay WAC + audit slim
-- ============================================================================
-- Contexto: timeouts 57014 (statement_timeout=8s da role authenticated) nos
-- inserts de registros_suplementacao e saida_insumos vindos do PWA. Um insert
-- de suplementação dispara uma cascata que transforma 1 write em centenas:
--
--   trg_suplementacao_mov -> movimentacoes_estoque_suplementos
--   -> update_estoque_suplemento -> recalcular_custo_medio_item
--     (replay do histórico inteiro do item, UPDATE incondicional por linha)
--   trigger_recalc_peso_on_insert -> recalcular_peso_vivo_lote
--     (varre todo o histórico do lote; cada UPDATE dispara audit + recalc
--      de consumo, que gera mais UPDATEs e mais inserts de auditoria)
--
-- Sob I/O degradado e com dispositivos sincronizando a mesma formulação ao
-- mesmo tempo (todos travam as mesmas linhas do replay), a statement passa
-- de 8s e é cancelada.
--
-- 1. recalcular_custo_medio_item(uuid,text,uuid): o UPDATE por linha do
--    replay passa a ser no-op quando saldo_anterior/saldo_posterior já estão
--    corretos (a sobrecarga (text,uuid,uuid) já tinha essa guarda). Em estado
--    estacionário o replay deixa de reescrever ~todas as linhas do item e só
--    corrige o que diverge (insert fora de ordem, edição, backfill). A linha
--    final do item (insumos/formulacoes) também só é tocada se mudar, o que
--    reduz a pegada de lock na linha quente da formulação.
-- 2. fn_audit_trigger: dados_antigos/dados_novos passam a NULL. São duplicatas
--    byte a byte de valor_anterior/valor_novo e o consumidor (get_audit_log)
--    só lê valor_* e alteracoes. acao é NOT NULL e segue preenchido. Linhas
--    antigas não são tocadas; retenção de 90 dias expira o legado sozinha.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Replay WAC com guarda de no-op
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalcular_custo_medio_item(
  p_fazenda_id uuid,
  p_item_tipo text,
  p_item_id uuid
)
RETURNS void AS $$
DECLARE
  v_mov RECORD;
  v_saldo numeric := 0;
  v_custo_medio numeric := 0;
  v_valor_entrada numeric;
  v_custo_entrada numeric;
  v_saldo_ant numeric;
BEGIN
  FOR v_mov IN
    SELECT id, tipo_movimentacao, quantidade, custo_unitario, valor_total
    FROM public.movimentacoes_estoque_suplementos
    WHERE fazenda_id = p_fazenda_id
      AND item_tipo = p_item_tipo
      AND item_id = p_item_id
      AND deleted_at IS NULL
    ORDER BY created_at ASC
  LOOP
    IF v_mov.tipo_movimentacao IN ('entrada', 'producao') THEN
      -- Entrada incrementa estoque e recalcula WAC
      v_valor_entrada := COALESCE(
        v_mov.valor_total,
        v_mov.quantidade * COALESCE(v_mov.custo_unitario, 0)
      );

      IF v_mov.valor_total IS NULL THEN
        v_custo_entrada := COALESCE(v_mov.custo_unitario, 0);
      ELSE
        v_custo_entrada := CASE
          WHEN v_mov.quantidade <> 0 THEN v_mov.valor_total / v_mov.quantidade
          ELSE COALESCE(v_mov.custo_unitario, 0)
        END;
      END IF;

      -- Saldo zerado ou negativo: próxima entrada redefine o custo
      IF v_saldo <= 0 THEN
        v_custo_medio := v_custo_entrada;
      ELSE
        v_custo_medio := ((v_saldo * v_custo_medio) + v_valor_entrada) / (v_saldo + v_mov.quantidade);
      END IF;

      v_saldo := v_saldo + v_mov.quantidade;

    ELSIF v_mov.tipo_movimentacao IN ('baixa', 'consumo') THEN
      -- Saída decrementa estoque, mantém custo médio
      v_saldo := v_saldo - v_mov.quantidade;

    ELSIF v_mov.tipo_movimentacao = 'ajuste' THEN
      -- Ajuste define saldo absoluto
      -- Se tem custo informado, define custo médio também
      v_saldo := v_mov.quantidade;
      IF v_mov.custo_unitario IS NOT NULL AND v_mov.custo_unitario > 0 THEN
        v_custo_medio := v_mov.custo_unitario;
      END IF;
    END IF;

    -- Atualizar saldos históricos da movimentação, mas só quando divergem:
    -- replay idempotente vira no-op em vez de regravar a cadeia inteira
    v_saldo_ant := CASE
      WHEN v_mov.tipo_movimentacao = 'ajuste' THEN v_saldo
      WHEN v_mov.tipo_movimentacao IN ('entrada', 'producao') THEN v_saldo - v_mov.quantidade
      ELSE v_saldo + v_mov.quantidade
    END;

    UPDATE public.movimentacoes_estoque_suplementos
    SET saldo_anterior = v_saldo_ant,
        saldo_posterior = v_saldo
    WHERE id = v_mov.id
      AND (saldo_anterior IS DISTINCT FROM v_saldo_ant
           OR saldo_posterior IS DISTINCT FROM v_saldo);
  END LOOP;

  -- Persistir no item, somente se saldo ou custo médio mudou
  IF p_item_tipo = 'insumo' THEN
    UPDATE public.insumos
    SET estoque_atual = v_saldo,
        custo_unitario = ROUND(v_custo_medio, 4),
        updated_at = NOW()
    WHERE id = p_item_id
      AND (estoque_atual IS DISTINCT FROM v_saldo
           OR custo_unitario IS DISTINCT FROM ROUND(v_custo_medio, 4));
  ELSIF p_item_tipo = 'formulacao' THEN
    UPDATE public.formulacoes
    SET estoque_atual = v_saldo,
        custo_unitario = ROUND(v_custo_medio, 4),
        updated_at = NOW()
    WHERE id = p_item_id
      AND (estoque_atual IS DISTINCT FROM v_saldo
           OR custo_unitario IS DISTINCT FROM ROUND(v_custo_medio, 4));
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 2. Auditoria sem duplicata de jsonb (dados_antigos/dados_novos -> NULL)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id_text text := NULLIF(current_setting('app.current_user_id', true), '');
  v_usuario_id uuid := v_user_id_text::uuid;
  v_usuario_email text := NULLIF(current_setting('app.current_user_email', true), '');
  v_usuario_nome text := NULLIF(current_setting('app.current_user_nome', true), '');
  v_fazenda_id uuid := NULL;
  v_is_impersonation boolean := COALESCE(NULLIF(current_setting('app.is_impersonation', true), '')::boolean, false);
  v_imp_by_text text := NULLIF(current_setting('app.impersonated_by', true), '');
  v_impersonated_by uuid := v_imp_by_text::uuid;
  v_ip_address text := NULLIF(current_setting('app.ip_address', true), '');
  v_user_agent text := NULLIF(current_setting('app.user_agent', true), '');
  v_source_app text := NULLIF(current_setting('app.source_app', true), '');
  v_origin_page text := NULLIF(current_setting('app.origin_page', true), '');
  v_registro_id uuid := NULL;
  v_alteracoes jsonb := '{}'::jsonb;
  v_col text;
  v_old_json jsonb;
  v_new_json jsonb;
  v_noise_cols text[] := ARRAY['ultimo_acesso', 'updated_at', 'created_at'];
  v_is_soft_delete boolean := false;
  v_old_ativo boolean;
  v_new_ativo boolean;
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_fazenda_id := OLD.fazenda_id;
    ELSE
      v_fazenda_id := NEW.fazenda_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_fazenda_id := NULL;
  END;

  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_registro_id := OLD.id;
    ELSE
      v_registro_id := NEW.id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_registro_id := NULL;
  END;

  -- Fallback de identidade: writes diretos do PWA não setam contexto de sessão
  -- (conta compartilhada peao.*), mas a linha carrega nome_usuario do
  -- funcionário autenticado via PIN.
  IF v_usuario_nome IS NULL THEN
    BEGIN
      v_usuario_nome := NULLIF((
        CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END
      ) ->> 'nome_usuario', '');
    EXCEPTION WHEN OTHERS THEN
      v_usuario_nome := NULL;
    END;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_json := to_jsonb(OLD);
    v_new_json := to_jsonb(NEW);
    FOR v_col IN SELECT jsonb_object_keys(v_new_json) LOOP
      IF v_col = ANY(v_noise_cols) THEN
        CONTINUE;
      END IF;
      IF v_old_json ->> v_col IS DISTINCT FROM v_new_json ->> v_col THEN
        v_alteracoes := v_alteracoes || jsonb_build_object(v_col, jsonb_build_array(
          v_old_json -> v_col,
          v_new_json -> v_col
        ));
      END IF;
    END LOOP;
    IF v_alteracoes = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    -- Detectar soft delete: campo 'ativo' mudou de true para false
    BEGIN
      v_old_ativo := (v_old_json ->> 'ativo')::boolean;
      v_new_ativo := (v_new_json ->> 'ativo')::boolean;
      IF v_old_ativo = true AND v_new_ativo = false THEN
        v_is_soft_delete := true;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_is_soft_delete := false;
    END;
  END IF;

  -- dados_antigos/dados_novos ficam NULL: eram duplicatas de valor_anterior/
  -- valor_novo que dobravam o tamanho de cada linha sem consumidor (a RPC
  -- get_audit_log lê apenas valor_* e alteracoes)
  INSERT INTO public.audit_log (
    usuario_id, usuario_email, usuario_nome,
    fazenda_id, tabela, operacao, registro_id,
    valor_anterior, valor_novo, alteracoes,
    is_impersonation, impersonated_by,
    ip_address, user_agent, source_app, origin_page,
    transaction_id, is_soft_delete,
    acao, dados_antigos, dados_novos, criado_em
  ) VALUES (
    v_usuario_id, v_usuario_email, v_usuario_nome,
    v_fazenda_id, TG_TABLE_NAME, TG_OP, v_registro_id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    CASE WHEN TG_OP = 'UPDATE' THEN v_alteracoes ELSE NULL END,
    v_is_impersonation, v_impersonated_by,
    NULLIF(v_ip_address, ''), NULLIF(v_user_agent, ''), NULLIF(v_source_app, ''), NULLIF(v_origin_page, ''),
    txid_current(), v_is_soft_delete,
    TG_OP,
    NULL, NULL,
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;
