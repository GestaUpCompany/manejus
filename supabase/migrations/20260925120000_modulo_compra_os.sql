-- ============================================================================
-- Módulo de Compra via Ordem de Serviço (OS)
-- Fluxo: comunicado de compra no PWA gera OS (COM-ano-00000) -> recebimentos
-- por carga (um laudo por caminhão/GTA, tabela os_recebimentos) geram
-- movimentações de Entrada/Compras que somam cabeças -> fechamento manual no
-- Painel após conferência de divergências (GTA obrigatória para fechar).
-- Identificação dos animais acontece dias depois, em manejo separado
-- (tipo_manejo 'processamento' na pesagem, sem vínculo de OS).
-- ============================================================================

-- ============================================================================
-- 1) ordens_servico: status 'recebida' + colunas comerciais de compra
-- ============================================================================
ALTER TABLE public.ordens_servico
  DROP CONSTRAINT IF EXISTS ordens_servico_status_check;
ALTER TABLE public.ordens_servico
  ADD CONSTRAINT ordens_servico_status_check
    CHECK (status = ANY (ARRAY['aberta', 'embarcada', 'recebida', 'aguardando_pagamento', 'fechada', 'cancelada']));

ALTER TABLE public.ordens_servico
  ADD COLUMN IF NOT EXISTS fornecedor text,
  ADD COLUMN IF NOT EXISTS origem_fazenda text,
  ADD COLUMN IF NOT EXISTS origem_municipio_uf text,
  ADD COLUMN IF NOT EXISTS modo_preco text,
  ADD COLUMN IF NOT EXISTS valor_total_previsto numeric,
  ADD COLUMN IF NOT EXISTS forma_pagamento text,
  ADD COLUMN IF NOT EXISTS data_saida date,
  ADD COLUMN IF NOT EXISTS valor_frete numeric,
  ADD COLUMN IF NOT EXISTS mortes_transporte integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS divergencia_obs text,
  ADD COLUMN IF NOT EXISTS compra_detalhes jsonb;

ALTER TABLE public.ordens_servico
  DROP CONSTRAINT IF EXISTS ordens_servico_modo_preco_check;
ALTER TABLE public.ordens_servico
  ADD CONSTRAINT ordens_servico_modo_preco_check
    CHECK (modo_preco IS NULL OR modo_preco = ANY (ARRAY['por_kg', 'por_ua']));

ALTER TABLE public.ordens_servico
  DROP CONSTRAINT IF EXISTS ordens_servico_forma_pagamento_check;
ALTER TABLE public.ordens_servico
  ADD CONSTRAINT ordens_servico_forma_pagamento_check
    CHECK (forma_pagamento IS NULL OR forma_pagamento = ANY (ARRAY['pix', 'boleto', 'ted', 'dinheiro']));

-- ============================================================================
-- 2) os_recebimentos: um laudo de recebimento por carga (caminhão/GTA)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.os_recebimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id text UNIQUE,
  os_id uuid NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  dispositivo_id uuid REFERENCES public.dispositivos(id) ON DELETE SET NULL,
  nome_usuario text,
  data timestamp with time zone DEFAULT now(),

  -- Documental / transporte (por carga)
  numero_gta text,
  numero_nf text,
  doc_origem text,
  transportadora text,
  placa_veiculo text,
  placa_reboque text,
  motorista text,
  data_chegada date,
  hora_chegada text,

  -- Pesagem coletiva (balanço = média kg/cab do caminhão cheio menos vazio)
  peso_medio_balancao numeric,
  peso_origem numeric,
  hora_pesagem text,
  contagens jsonb,      -- [{categoria, femeas, machos}]
  checklist jsonb,      -- [{item, resposta, observacao}] 20 itens do laudo
  score_corporal integer CHECK (score_corporal IS NULL OR score_corporal BETWEEN 1 AND 5),
  mortes integer DEFAULT 0,
  destino text,         -- 'baia' | 'pasto'
  responsavel text,
  auxiliar text,

  sessao_id text,
  sync_status text DEFAULT 'pending',
  version integer DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_os_recebimentos_os ON public.os_recebimentos(os_id);
CREATE INDEX IF NOT EXISTS idx_os_recebimentos_fazenda ON public.os_recebimentos(fazenda_id);

DROP TRIGGER IF EXISTS os_recebimentos_updated_at ON public.os_recebimentos;
CREATE TRIGGER os_recebimentos_updated_at
  BEFORE UPDATE ON public.os_recebimentos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 3) Vínculos: movimentação e documentos por recebimento
-- ============================================================================
ALTER TABLE public.registros_movimentacao
  ADD COLUMN IF NOT EXISTS os_recebimento_id uuid REFERENCES public.os_recebimentos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_registros_movimentacao_recebimento
  ON public.registros_movimentacao(os_recebimento_id);

ALTER TABLE public.os_documentos
  DROP CONSTRAINT IF EXISTS os_documentos_tipo_check;
ALTER TABLE public.os_documentos
  ADD CONSTRAINT os_documentos_tipo_check
    CHECK (tipo = ANY (ARRAY['romaneio', 'acerto', 'gta', 'nota_fiscal', 'laudo', 'video', 'outro']));

ALTER TABLE public.os_documentos
  ADD COLUMN IF NOT EXISTS os_recebimento_id uuid REFERENCES public.os_recebimentos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_os_documentos_recebimento ON public.os_documentos(os_recebimento_id);

-- ============================================================================
-- 4) tipo_manejo 'processamento': manejo pós-chegada que chipa/identifica os
--    animais recebidos (cria indivíduo Vivo, sem OS). Origem mapeia p/ Compra.
-- ============================================================================
ALTER TABLE public.registros_pesagem
  DROP CONSTRAINT IF EXISTS registros_pesagem_tipo_manejo_check;
ALTER TABLE public.registros_pesagem
  ADD CONSTRAINT registros_pesagem_tipo_manejo_check
    CHECK (tipo_manejo = ANY (ARRAY['abate', 'compra', 'venda_vivo', 'transf_saida', 'transf_entrada', 'apartacao', 'processamento']));

CREATE OR REPLACE FUNCTION public.trg_registros_pesagem_upsert_individuo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_individuo_id uuid;
  v_status_anterior text;
  v_tipo_venda text;
  v_status_venda text;
BEGIN
  -- Localiza indivíduo existente pelo chip ou brinco na mesma fazenda (chip tem prioridade)
  SELECT i.id, i.status INTO v_individuo_id, v_status_anterior
  FROM public.individuos i
  WHERE i.fazenda_id = NEW.fazenda_id
    AND i.deleted_at IS NULL
    AND (
      (NEW.id_chip IS NOT NULL AND NEW.id_chip <> '' AND i.id_chip = NEW.id_chip)
      OR (NEW.id_brinco IS NOT NULL AND NEW.id_brinco <> '' AND i.id_brinco = NEW.id_brinco)
    )
  ORDER BY
    (NEW.id_chip IS NOT NULL AND NEW.id_chip <> '' AND i.id_chip = NEW.id_chip) DESC,
    i.created_at
  LIMIT 1;

  -- -----------------------------------------------------------------------
  -- Pesagem vinculada a OS de saída (venda/abate/transferência):
  -- nunca cria indivíduo; marca o existente conforme o tipo da OS.
  -- -----------------------------------------------------------------------
  IF NEW.os_id IS NOT NULL THEN
    IF v_individuo_id IS NULL THEN
      NEW.individuo_id := NULL;
      INSERT INTO public.logs_sync_errors (fazenda_id, caderneta, registro_id, operation, error_code, error_message, error_details, payload)
      VALUES (
        NEW.fazenda_id, 'pesagem', NEW.local_id,
        'trg_registros_pesagem_upsert_individuo',
        'OS_ANIMAL_SEM_CADASTRO',
        'Animal pesado em OS sem indivíduo correspondente (chip/brinco não encontrado)',
        'OS: ' || NEW.os_id::text || ' | Chip: ' || COALESCE(NEW.id_chip, 'NULL') || ' | Brinco: ' || COALESCE(NEW.id_brinco, 'NULL'),
        jsonb_build_object('os_id', NEW.os_id, 'id_chip', NEW.id_chip, 'id_brinco', NEW.id_brinco, 'lote_id', NEW.lote_id, 'peso_kg', NEW.peso_kg)
      );
      RETURN NEW;
    END IF;

    SELECT tipo_venda INTO v_tipo_venda FROM public.ordens_servico WHERE id = NEW.os_id;
    v_status_venda := CASE v_tipo_venda WHEN 'abate' THEN 'Abatido' ELSE 'Venda Vivo' END;

    -- Auditoria: animal já vendido/abatido/morto pesado de novo em outra OS
    IF v_status_anterior IS NOT NULL AND v_status_anterior <> 'Vivo' THEN
      INSERT INTO public.logs_sync_errors (fazenda_id, caderneta, registro_id, operation, error_code, error_message, error_details, payload)
      VALUES (
        NEW.fazenda_id, 'pesagem', NEW.local_id,
        'trg_registros_pesagem_upsert_individuo',
        'OS_ANIMAL_JA_BAIXADO',
        'Indivíduo com status ' || v_status_anterior || ' pesado novamente em OS',
        'OS: ' || NEW.os_id::text || ' | Individuo: ' || v_individuo_id::text || ' | Chip: ' || COALESCE(NEW.id_chip, 'NULL') || ' | Brinco: ' || COALESCE(NEW.id_brinco, 'NULL'),
        jsonb_build_object('os_id', NEW.os_id, 'individuo_id', v_individuo_id, 'status_anterior', v_status_anterior)
      );
    END IF;

    NEW.individuo_status_anterior := v_status_anterior;

    UPDATE public.individuos
    SET
      id_chip = COALESCE(NULLIF(NEW.id_chip, ''), id_chip),
      id_brinco = COALESCE(NULLIF(NEW.id_brinco, ''), id_brinco),
      sexo = COALESCE(NEW.sexo, sexo),
      categoria = COALESCE(NEW.categoria, categoria),
      raca = COALESCE(NEW.raca, raca),
      lote_atual = COALESCE(NEW.lote_id, lote_atual),
      peso_atual_kg = COALESCE(NEW.peso_kg, peso_atual_kg),
      idade_era = COALESCE(NEW.idade_era, idade_era),
      idade_atual_dias = COALESCE(NEW.idade_dias, idade_atual_dias),
      status = v_status_venda,
      updated_at = now()
    WHERE id = v_individuo_id;

    NEW.individuo_id := v_individuo_id;
    RETURN NEW;
  END IF;

  -- -----------------------------------------------------------------------
  -- Pesagem comum / processamento pós-compra (sem OS): upsert normal.
  -- 'processamento' cria indivíduo 'Vivo' com origem 'Compra' quando o animal
  -- chegou por compra e está sendo identificado no manejo posterior.
  -- -----------------------------------------------------------------------
  IF v_individuo_id IS NOT NULL THEN
    UPDATE public.individuos
    SET
      id_chip = COALESCE(NULLIF(NEW.id_chip, ''), id_chip),
      id_brinco = COALESCE(NULLIF(NEW.id_brinco, ''), id_brinco),
      sexo = COALESCE(NEW.sexo, sexo),
      categoria = COALESCE(NEW.categoria, categoria),
      raca = COALESCE(NEW.raca, raca),
      lote_atual = COALESCE(NEW.lote_id, lote_atual),
      peso_atual_kg = COALESCE(NEW.peso_kg, peso_atual_kg),
      idade_era = COALESCE(NEW.idade_era, idade_era),
      idade_atual_dias = COALESCE(NEW.idade_dias, idade_atual_dias),
      updated_at = now()
    WHERE id = v_individuo_id;
  ELSE
    INSERT INTO public.individuos (
      fazenda_id, id_chip, id_brinco, sexo, categoria, raca,
      lote_atual, peso_atual_kg, idade_era, idade_atual_dias,
      status, origem
    ) VALUES (
      NEW.fazenda_id,
      NULLIF(NEW.id_chip, ''),
      NULLIF(NEW.id_brinco, ''),
      NEW.sexo,
      NEW.categoria,
      NEW.raca,
      NEW.lote_id,
      NEW.peso_kg,
      NEW.idade_era,
      NEW.idade_dias,
      'Vivo',
      CASE NEW.tipo_manejo
        WHEN 'compra' THEN 'Compra'
        WHEN 'processamento' THEN 'Compra'
        WHEN 'transf_entrada' THEN 'Transferência'
        ELSE 'Cadastro Manual'
      END
    )
    RETURNING id INTO v_individuo_id;
  END IF;

  NEW.individuo_id := v_individuo_id;
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 5) Guarda de sessão: compra aceita N laudos (um por caminhão), então o
--    bloqueio de sessão única só vale para venda/transferência.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_movimentacao_os_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_status text;
  v_tipo text;
  v_numero text;
BEGIN
  IF NEW.os_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status, tipo, numero_os INTO v_status, v_tipo, v_numero
  FROM public.ordens_servico WHERE id = NEW.os_id;

  IF v_status IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_status = 'cancelada' OR v_status = 'fechada' THEN
    RAISE EXCEPTION 'OS % está % e não aceita novas movimentações', v_numero, v_status;
  END IF;

  -- Compra: múltiplos recebimentos por OS (um por caminhão/GTA) são o caso
  -- normal; cada laudo tem sua sessão, então a guarda de sessão única não se
  -- aplica. Venda/transferência mantêm o bloqueio de duplo embarque offline.
  IF v_tipo = 'compra' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registros_movimentacao
    WHERE os_id = NEW.os_id
      AND deleted_at IS NULL
      AND sessao_id IS DISTINCT FROM NEW.sessao_id
      AND local_id IS DISTINCT FROM NEW.local_id
  ) THEN
    RAISE EXCEPTION 'OS % já possui embarque registrado em outra sessão de pesagem', v_numero;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 6) Status da OS por tipo: venda -> 'embarcada', compra -> 'recebida'
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_movimentacao_os_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_os_id uuid;
  v_tipo text;
  v_total integer;
  v_status_processada text;
BEGIN
  v_os_id := COALESCE(NEW.os_id, OLD.os_id);
  IF v_os_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT tipo INTO v_tipo FROM public.ordens_servico WHERE id = v_os_id;
  v_status_processada := CASE v_tipo WHEN 'compra' THEN 'recebida' ELSE 'embarcada' END;

  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_total
  FROM public.registros_movimentacao
  WHERE os_id = v_os_id AND deleted_at IS NULL;

  UPDATE public.ordens_servico
  SET
    quantidade_embarcada = v_total,
    status = CASE
      WHEN status = 'aberta' AND v_total > 0 THEN v_status_processada
      WHEN status IN ('embarcada', 'recebida') AND v_total = 0 THEN 'aberta'
      ELSE status
    END,
    updated_at = now()
  WHERE id = v_os_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ============================================================================
-- 7) os_recebimentos -> OS: mortes_transporte (soma dos laudos) e status
--    'recebida' mesmo que a movimentação ainda não tenha chegado.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_os_recebimento_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_os_id uuid;
  v_mortes integer;
BEGIN
  v_os_id := COALESCE(NEW.os_id, OLD.os_id);
  IF v_os_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(mortes), 0) INTO v_mortes
  FROM public.os_recebimentos
  WHERE os_id = v_os_id AND deleted_at IS NULL;

  UPDATE public.ordens_servico
  SET
    mortes_transporte = v_mortes,
    status = CASE
      WHEN status = 'aberta' AND EXISTS (
        SELECT 1 FROM public.os_recebimentos
        WHERE os_id = v_os_id AND deleted_at IS NULL
      ) THEN 'recebida'
      ELSE status
    END,
    updated_at = now()
  WHERE id = v_os_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_os_recebimento_status ON public.os_recebimentos;
CREATE TRIGGER trg_os_recebimento_status
  AFTER INSERT OR UPDATE OF deleted_at ON public.os_recebimentos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_os_recebimento_status();

-- ============================================================================
-- 8) Notificação: embarcada (venda) ou recebida (compra)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_os_embarcada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_controller RECORD;
  v_titulo text;
  v_mensagem text;
BEGIN
  IF NOT (OLD.status = 'aberta' AND NEW.status IN ('embarcada', 'recebida')) THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'recebida' THEN
    v_titulo := 'OS ' || COALESCE(NEW.numero_os, '') || ' recebida';
    v_mensagem := 'Recebimento registrado: ' || COALESCE(NEW.quantidade_embarcada, 0) || ' de ' || COALESCE(NEW.quantidade_prevista, 0) || ' cabeças. Aguardando conferência e acerto.';
  ELSE
    v_titulo := 'OS ' || COALESCE(NEW.numero_os, '') || ' embarcada';
    v_mensagem := 'Pesagem concluída: ' || COALESCE(NEW.quantidade_embarcada, 0) || ' de ' || COALESCE(NEW.quantidade_prevista, 0) || ' cabeças. Aguardando romaneio/acerto.';
  END IF;

  FOR v_controller IN
    SELECT u.id FROM usuarios u
    JOIN usuario_fazenda uf ON u.id = uf.usuario_id
    WHERE uf.fazenda_id = NEW.fazenda_id
      AND uf.ativo = true
      AND uf.papel IN ('admin', 'controller')
      AND (u.id)::text NOT LIKE '%@gestaup.internal'
      AND u.ativo = true
  LOOP
    INSERT INTO notificacoes (usuario_id, fazenda_id, tipo, titulo, mensagem, acao_url, acao_label, dados_jsonb)
    VALUES (
      v_controller.id,
      NEW.fazenda_id,
      'info',
      v_titulo,
      v_mensagem,
      '/controller/ordens-servico/' || NEW.id,
      'Ver OS',
      jsonb_build_object('os_id', NEW.id, 'numero_os', NEW.numero_os, 'quantidade_embarcada', NEW.quantidade_embarcada)
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 9) RLS + grants de os_recebimentos (mesmo padrão de ordens_servico)
-- ============================================================================
ALTER TABLE public.os_recebimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "os_recebimentos_manage" ON public.os_recebimentos;
CREATE POLICY "os_recebimentos_manage" ON public.os_recebimentos
  FOR ALL TO authenticated
  USING (
    public.get_peao_fazenda_id() = fazenda_id
    OR public.user_has_fazenda_access(fazenda_id)
  )
  WITH CHECK (
    public.get_peao_fazenda_id() = fazenda_id
    OR public.user_has_fazenda_access(fazenda_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.os_recebimentos TO authenticated;

-- ============================================================================
-- 10) RPCs: fechamento exige GTA na compra; cancelar/estornar cobrem 'recebida'
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fechar_os_venda(
  p_os_id uuid,
  p_valor_acerto numeric DEFAULT NULL,
  p_data_credito date DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_os RECORD;
  v_gta_count integer;
BEGIN
  SELECT * INTO v_os FROM public.ordens_servico WHERE id = p_os_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS não encontrada');
  END IF;

  IF NOT public.user_has_fazenda_access(v_os.fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda desta OS');
  END IF;

  IF v_os.status = 'fechada' THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS já está fechada');
  END IF;
  IF v_os.status = 'cancelada' THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS está cancelada');
  END IF;
  IF v_os.status = 'aberta' THEN
    RETURN jsonb_build_object('success', false, 'error',
      CASE WHEN v_os.tipo = 'compra'
        THEN 'OS ainda não tem recebimento registrado'
        ELSE 'OS ainda não tem embarque registrado'
      END);
  END IF;

  -- Compra: confirmação de recebimento da GTA é dever legal do comprador;
  -- a OS não fecha sem ao menos uma GTA anexada.
  IF v_os.tipo = 'compra' THEN
    SELECT COUNT(*) INTO v_gta_count
    FROM public.os_documentos
    WHERE os_id = p_os_id AND tipo = 'gta' AND deleted_at IS NULL;
    IF v_gta_count = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Anexe a GTA do recebimento antes de fechar a OS de compra');
    END IF;
  END IF;

  IF p_valor_acerto IS NULL OR p_valor_acerto <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error',
      CASE WHEN v_os.tipo = 'compra'
        THEN 'Informe o valor do acerto pago'
        ELSE 'Informe o valor do acerto recebido'
      END);
  END IF;
  IF p_data_credito IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Informe a data do acerto');
  END IF;

  UPDATE public.ordens_servico
  SET status = 'fechada',
      valor_acerto = COALESCE(p_valor_acerto, valor_acerto),
      data_credito = COALESCE(p_data_credito, data_credito),
      closed_at = now(),
      closed_by = p_usuario_id,
      updated_at = now()
  WHERE id = p_os_id;

  RETURN jsonb_build_object('success', true, 'numero_os', v_os.numero_os);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancelar_os_venda(
  p_os_id uuid,
  p_motivo text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_os RECORD;
BEGIN
  SELECT * INTO v_os FROM public.ordens_servico WHERE id = p_os_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS não encontrada');
  END IF;

  IF NOT public.user_has_fazenda_access(v_os.fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda desta OS');
  END IF;

  IF v_os.status = 'fechada' THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS já está fechada');
  END IF;
  IF v_os.status = 'cancelada' THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS já está cancelada');
  END IF;
  IF v_os.status IN ('embarcada', 'recebida', 'aguardando_pagamento') THEN
    RETURN jsonb_build_object('success', false, 'error',
      CASE WHEN v_os.tipo = 'compra'
        THEN 'OS já possui recebimento. Estorne a baixa antes de cancelar.'
        ELSE 'OS já possui embarque. Estorne a baixa antes de cancelar.'
      END);
  END IF;

  UPDATE public.ordens_servico
  SET status = 'cancelada',
      cancelada_at = now(),
      motivo_cancelamento = p_motivo,
      updated_at = now()
  WHERE id = p_os_id;

  RETURN jsonb_build_object('success', true, 'numero_os', v_os.numero_os);
END;
$function$;

CREATE OR REPLACE FUNCTION public.estornar_baixa_os(
  p_os_id uuid,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_os RECORD;
  v_par RECORD;
  v_mov_count integer;
  v_ind_count integer;
  v_rec_count integer;
BEGIN
  SELECT * INTO v_os FROM public.ordens_servico WHERE id = p_os_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS não encontrada');
  END IF;

  IF NOT public.user_has_fazenda_access(v_os.fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda desta OS');
  END IF;

  IF v_os.status NOT IN ('embarcada', 'recebida', 'aguardando_pagamento') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Só é possível estornar OS processada (status: ' || v_os.status || ')');
  END IF;

  -- Pares (lote, categoria) afetados: saída usa lote_origem_id, entrada usa
  -- lote_destino_id (compra soma nas categorias do lote de destino).
  CREATE TEMP TABLE IF NOT EXISTS tmp_estorno_pares (
    lote_id uuid, categoria text
  ) ON COMMIT DROP;
  DELETE FROM tmp_estorno_pares;

  INSERT INTO tmp_estorno_pares (lote_id, categoria)
  SELECT DISTINCT COALESCE(lote_origem_id, lote_destino_id), categoria
  FROM public.registros_movimentacao
  WHERE os_id = p_os_id AND deleted_at IS NULL
    AND COALESCE(lote_origem_id, lote_destino_id) IS NOT NULL;

  -- Soft-delete das movimentações da OS (saem da soma de calculate_quant_atual)
  UPDATE public.registros_movimentacao
  SET deleted_at = now(), updated_at = now()
  WHERE os_id = p_os_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_mov_count = ROW_COUNT;

  -- Laudos de recebimento da compra são estornados junto
  UPDATE public.os_recebimentos
  SET deleted_at = now(), updated_at = now()
  WHERE os_id = p_os_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_rec_count = ROW_COUNT;

  -- Reverte indivíduos marcados por esta OS ao status anterior (venda)
  UPDATE public.individuos i
  SET status = COALESCE(rp.individuo_status_anterior, 'Vivo'),
      updated_at = now()
  FROM public.registros_pesagem rp
  WHERE rp.os_id = p_os_id
    AND rp.individuo_id = i.id
    AND rp.deleted_at IS NULL
    AND i.status IN ('Abatido', 'Venda Vivo');
  GET DIAGNOSTICS v_ind_count = ROW_COUNT;

  -- Recalcula quant_atual das lote_categorias afetadas
  FOR v_par IN SELECT lote_id, categoria FROM tmp_estorno_pares LOOP
    UPDATE public.lote_categorias
    SET quant_atual = public.calculate_quant_atual(v_par.lote_id, v_par.categoria),
        updated_at = now()
    WHERE lote_id = v_par.lote_id
      AND LOWER(categoria) = LOWER(v_par.categoria)
      AND ativo = true;
  END LOOP;

  -- OS volta para aberta (triggers já recalculam quantidade_embarcada/mortes)
  UPDATE public.ordens_servico
  SET status = 'aberta',
      quantidade_embarcada = 0,
      updated_at = now()
  WHERE id = p_os_id;

  RETURN jsonb_build_object(
    'success', true,
    'numero_os', v_os.numero_os,
    'movimentacoes_estornadas', v_mov_count,
    'recebimentos_estornados', v_rec_count,
    'individuos_revertidos', v_ind_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fechar_os_venda(uuid, numeric, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_os_venda(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.estornar_baixa_os(uuid, uuid) TO authenticated;

-- ============================================================================
-- 11) Bucket: aceitar vídeo do descarregamento (limite maior que imagens)
-- ============================================================================
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
      'video/mp4', 'video/webm', 'video/quicktime'
    ],
    file_size_limit = 209715200 -- 200 MB (vídeo de descarregamento)
WHERE id = 'documentos-os';
