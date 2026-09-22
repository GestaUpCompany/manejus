-- ============================================================================
-- Módulo de Venda via Ordem de Serviço (OS)
-- Fluxo: comunicado de venda no PWA gera OS (VEN-ano-00000) -> pesagem vinculada
-- desconta cabeças via registros_movimentacao -> fechamento financeiro manual
-- no Painel Web (upload de romaneio/acerto + confirmação de pagamento).
-- Schema genérico (tipo 'venda'|'compra'|'transferencia') para os próximos módulos.
-- ============================================================================

-- ============================================================================
-- 1) Tabela ordens_servico
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ordens_servico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id text UNIQUE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  dispositivo_id uuid REFERENCES public.dispositivos(id) ON DELETE SET NULL,
  nome_usuario text,
  data timestamp with time zone DEFAULT now(),

  tipo text NOT NULL CHECK (tipo = ANY (ARRAY['venda', 'compra', 'transferencia'])),
  tipo_venda text CHECK (tipo_venda IS NULL OR tipo_venda = ANY (ARRAY['abate', 'animal_vivo'])),

  numero_os text,
  ano integer,
  sequencial integer,

  status text NOT NULL DEFAULT 'aberta'
    CHECK (status = ANY (ARRAY['aberta', 'embarcada', 'aguardando_pagamento', 'fechada', 'cancelada'])),

  -- Comunicado (perfil único)
  vendedor text,
  comprador text,
  venda_direta boolean DEFAULT true,
  corretora text,
  quantidade_prevista integer,
  sexo text CHECK (sexo IS NULL OR sexo = ANY (ARRAY['Macho', 'Fêmea', 'Misto'])),
  idade_era text CHECK (idade_era IS NULL OR idade_era = ANY (ARRAY['0-4m', '5-12m', '13-24m', '25-36m', '>36m'])),
  categoria text,
  data_prevista_embarque date,
  data_prevista_abate date,
  preco_arroba numeric,
  data_prevista_pagamento date,
  observacao text,

  -- Resultado operacional/financeiro
  quantidade_embarcada integer DEFAULT 0,
  valor_acerto numeric,
  data_credito date,

  closed_at timestamp with time zone,
  closed_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  cancelada_at timestamp with time zone,
  motivo_cancelamento text,

  sync_status text DEFAULT 'pending',
  version integer DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS ordens_servico_numero_os_key
  ON public.ordens_servico (fazenda_id, numero_os)
  WHERE numero_os IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ordens_servico_fazenda ON public.ordens_servico(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_status ON public.ordens_servico(status);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_tipo ON public.ordens_servico(tipo);

DROP TRIGGER IF EXISTS ordens_servico_updated_at ON public.ordens_servico;
CREATE TRIGGER ordens_servico_updated_at
  BEFORE UPDATE ON public.ordens_servico
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 2) Contadores por fazenda/tipo/ano + geração do numero_os (VEN/COM/TRA)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.os_contadores (
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  ano integer NOT NULL,
  ultimo_sequencial integer NOT NULL DEFAULT 0,
  PRIMARY KEY (fazenda_id, tipo, ano)
);

CREATE OR REPLACE FUNCTION public.gerar_numero_os()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_ano integer;
  v_seq integer;
  v_prefixo text;
BEGIN
  IF NEW.numero_os IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_ano := EXTRACT(YEAR FROM now())::integer;

  v_prefixo := CASE NEW.tipo
    WHEN 'venda' THEN 'VEN'
    WHEN 'compra' THEN 'COM'
    WHEN 'transferencia' THEN 'TRA'
    ELSE 'OS'
  END;

  -- O INSERT ... ON CONFLICT DO UPDATE trava a linha do contador,
  -- serializando inserts concorrentes sem buracos nem duplicatas.
  INSERT INTO public.os_contadores (fazenda_id, tipo, ano, ultimo_sequencial)
  VALUES (NEW.fazenda_id, NEW.tipo, v_ano, 1)
  ON CONFLICT (fazenda_id, tipo, ano)
  DO UPDATE SET ultimo_sequencial = os_contadores.ultimo_sequencial + 1
  RETURNING ultimo_sequencial INTO v_seq;

  NEW.ano := v_ano;
  NEW.sequencial := v_seq;
  NEW.numero_os := v_prefixo || '-' || v_ano || '-' || lpad(v_seq::text, 5, '0');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_gerar_numero_os ON public.ordens_servico;
CREATE TRIGGER trg_gerar_numero_os
  BEFORE INSERT ON public.ordens_servico
  FOR EACH ROW
  EXECUTE FUNCTION public.gerar_numero_os();

-- ============================================================================
-- 3) Documentos da OS (romaneio, acerto, futuros GTA/NF de compra)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.os_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo = ANY (ARRAY['romaneio', 'acerto', 'outro'])),
  arquivo_url text NOT NULL,
  nome_arquivo text,
  uploaded_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_os_documentos_os ON public.os_documentos(os_id);
CREATE INDEX IF NOT EXISTS idx_os_documentos_fazenda ON public.os_documentos(fazenda_id);

-- ============================================================================
-- 4) Vínculo da OS em pesagem e movimentação
-- ============================================================================
ALTER TABLE public.registros_pesagem
  ADD COLUMN IF NOT EXISTS os_id uuid REFERENCES public.ordens_servico(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS individuo_status_anterior text;
CREATE INDEX IF NOT EXISTS idx_registros_pesagem_os ON public.registros_pesagem(os_id);

ALTER TABLE public.registros_movimentacao
  ADD COLUMN IF NOT EXISTS os_id uuid REFERENCES public.ordens_servico(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sessao_id text;
CREATE INDEX IF NOT EXISTS idx_registros_movimentacao_os ON public.registros_movimentacao(os_id);

-- Movimentação vinculada a OS exige sessao_id (guarda de sessão única)
ALTER TABLE public.registros_movimentacao
  DROP CONSTRAINT IF EXISTS registros_movimentacao_os_sessao_check;
ALTER TABLE public.registros_movimentacao
  ADD CONSTRAINT registros_movimentacao_os_sessao_check
    CHECK (os_id IS NULL OR sessao_id IS NOT NULL);

-- ============================================================================
-- 5) Pesagem com OS: marca indivíduo vendido, nunca cria indivíduo novo
-- ============================================================================
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
  -- Pesagem vinculada a OS (saída: venda/abate/transferência):
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
  -- Pesagem comum (sem OS): comportamento original de upsert
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
-- 6) Guarda de sessão única: uma OS só aceita movimentações de uma sessão
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
  v_numero text;
BEGIN
  IF NEW.os_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status, numero_os INTO v_status, v_numero
  FROM public.ordens_servico WHERE id = NEW.os_id;

  IF v_status IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_status = 'cancelada' OR v_status = 'fechada' THEN
    RAISE EXCEPTION 'OS % está % e não aceita novas movimentações', v_numero, v_status;
  END IF;

  -- Rejeita movimentação de outra sessão para a mesma OS (duplo embarque offline)
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

DROP TRIGGER IF EXISTS trg_movimentacao_os_guard ON public.registros_movimentacao;
CREATE TRIGGER trg_movimentacao_os_guard
  BEFORE INSERT ON public.registros_movimentacao
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_movimentacao_os_guard();

-- ============================================================================
-- 7) Status/quantidade_embarcada da OS a partir das movimentações
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
  v_total integer;
BEGIN
  v_os_id := COALESCE(NEW.os_id, OLD.os_id);
  IF v_os_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(numero_cabecas), 0) INTO v_total
  FROM public.registros_movimentacao
  WHERE os_id = v_os_id AND deleted_at IS NULL;

  UPDATE public.ordens_servico
  SET
    quantidade_embarcada = v_total,
    status = CASE
      WHEN status = 'aberta' AND v_total > 0 THEN 'embarcada'
      WHEN status = 'embarcada' AND v_total = 0 THEN 'aberta'
      ELSE status
    END,
    updated_at = now()
  WHERE id = v_os_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_movimentacao_os_status ON public.registros_movimentacao;
CREATE TRIGGER trg_movimentacao_os_status
  AFTER INSERT OR UPDATE OF deleted_at ON public.registros_movimentacao
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_movimentacao_os_status();

-- ============================================================================
-- 8) Notificações (padrão solicitacoes_novo_lote)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_os_criada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_controller RECORD;
  v_tipo_label text;
BEGIN
  v_tipo_label := CASE NEW.tipo
    WHEN 'venda' THEN 'venda'
    WHEN 'compra' THEN 'compra'
    WHEN 'transferencia' THEN 'transferência'
    ELSE NEW.tipo
  END;

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
      'Nova OS de ' || v_tipo_label || ': ' || COALESCE(NEW.numero_os, '(sem número)'),
      'Comunicado de ' || v_tipo_label || ' registrado no app'
        || CASE WHEN NEW.tipo_venda IS NOT NULL THEN ' (' || CASE NEW.tipo_venda WHEN 'abate' THEN 'abate' ELSE 'animal vivo' END || ')' ELSE '' END
        || CASE WHEN NEW.quantidade_prevista IS NOT NULL THEN ' — ' || NEW.quantidade_prevista || ' cabeças previstas' ELSE '' END
        || '.',
      '/controller/ordens-servico/' || NEW.id,
      'Ver OS',
      jsonb_build_object('os_id', NEW.id, 'numero_os', NEW.numero_os, 'tipo', NEW.tipo, 'tipo_venda', NEW.tipo_venda)
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_os_criada ON public.ordens_servico;
CREATE TRIGGER trg_notify_os_criada
  AFTER INSERT ON public.ordens_servico
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_os_criada();

CREATE OR REPLACE FUNCTION public.notify_os_embarcada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_controller RECORD;
BEGIN
  IF NOT (OLD.status = 'aberta' AND NEW.status = 'embarcada') THEN
    RETURN NEW;
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
      'OS ' || COALESCE(NEW.numero_os, '') || ' embarcada',
      'Pesagem concluída: ' || COALESCE(NEW.quantidade_embarcada, 0) || ' de ' || COALESCE(NEW.quantidade_prevista, 0) || ' cabeças. Aguardando romaneio/acerto.',
      '/controller/ordens-servico/' || NEW.id,
      'Ver OS',
      jsonb_build_object('os_id', NEW.id, 'numero_os', NEW.numero_os, 'quantidade_embarcada', NEW.quantidade_embarcada)
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_os_embarcada ON public.ordens_servico;
CREATE TRIGGER trg_notify_os_embarcada
  AFTER UPDATE OF status ON public.ordens_servico
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_os_embarcada();

-- ============================================================================
-- 9) RLS (padrão solicitacoes_novo_lote / registros_*)
-- ============================================================================
ALTER TABLE public.ordens_servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_contadores ENABLE ROW LEVEL SECURITY;

-- ordens_servico: peão cria/lê/atualiza da própria fazenda (upsert idempotente
-- exige UPDATE); controller/admin idem via user_has_fazenda_access
DROP POLICY IF EXISTS "os_manage" ON public.ordens_servico;
CREATE POLICY "os_manage" ON public.ordens_servico
  FOR ALL TO authenticated
  USING (
    public.get_peao_fazenda_id() = fazenda_id
    OR public.user_has_fazenda_access(fazenda_id)
  )
  WITH CHECK (
    public.get_peao_fazenda_id() = fazenda_id
    OR public.user_has_fazenda_access(fazenda_id)
  );

DROP POLICY IF EXISTS "os_documentos_manage" ON public.os_documentos;
CREATE POLICY "os_documentos_manage" ON public.os_documentos
  FOR ALL TO authenticated
  USING (
    public.get_peao_fazenda_id() = fazenda_id
    OR public.user_has_fazenda_access(fazenda_id)
  )
  WITH CHECK (
    public.get_peao_fazenda_id() = fazenda_id
    OR public.user_has_fazenda_access(fazenda_id)
  );

-- os_contadores: sem acesso direto (somente trigger SECURITY DEFINER)

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordens_servico TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.os_documentos TO authenticated;

-- ============================================================================
-- 10) RPCs de fechamento/cancelamento/estorno
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
    RETURN jsonb_build_object('success', false, 'error', 'OS ainda não tem embarque registrado');
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
  IF v_os.status = 'embarcada' OR v_os.status = 'aguardando_pagamento' THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS já possui embarque. Estorne a baixa antes de cancelar.');
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
BEGIN
  SELECT * INTO v_os FROM public.ordens_servico WHERE id = p_os_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS não encontrada');
  END IF;

  IF NOT public.user_has_fazenda_access(v_os.fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda desta OS');
  END IF;

  IF v_os.status <> 'embarcada' AND v_os.status <> 'aguardando_pagamento' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Só é possível estornar OS embarcada (status: ' || v_os.status || ')');
  END IF;

  -- Pares (lote, categoria) afetados, para recálculo posterior
  CREATE TEMP TABLE IF NOT EXISTS tmp_estorno_pares (
    lote_id uuid, categoria text
  ) ON COMMIT DROP;
  DELETE FROM tmp_estorno_pares;

  INSERT INTO tmp_estorno_pares (lote_id, categoria)
  SELECT DISTINCT lote_origem_id, categoria
  FROM public.registros_movimentacao
  WHERE os_id = p_os_id AND deleted_at IS NULL AND lote_origem_id IS NOT NULL;

  -- Soft-delete das movimentações da OS (saem da soma de calculate_quant_atual)
  UPDATE public.registros_movimentacao
  SET deleted_at = now(), updated_at = now()
  WHERE os_id = p_os_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_mov_count = ROW_COUNT;

  -- Reverte indivíduos marcados por esta OS ao status anterior
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

  -- OS volta para aberta (trigger de status já recalcula quantidade_embarcada)
  UPDATE public.ordens_servico
  SET status = 'aberta',
      quantidade_embarcada = 0,
      updated_at = now()
  WHERE id = p_os_id;

  RETURN jsonb_build_object(
    'success', true,
    'numero_os', v_os.numero_os,
    'movimentacoes_estornadas', v_mov_count,
    'individuos_revertidos', v_ind_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fechar_os_venda(uuid, numeric, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_os_venda(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.estornar_baixa_os(uuid, uuid) TO authenticated;

-- ============================================================================
-- 11) Bucket privado para documentos da OS (romaneio/acerto)
--     Imagens são comprimidas no client antes do upload (comprimirDocumento).
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
  'documentos-os',
  'documentos-os',
  false,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  15728640 -- 15 MB
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "documentos-os-read" ON storage.objects;
CREATE POLICY "documentos-os-read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documentos-os');

DROP POLICY IF EXISTS "documentos-os-upload" ON storage.objects;
CREATE POLICY "documentos-os-upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documentos-os');

DROP POLICY IF EXISTS "documentos-os-update" ON storage.objects;
CREATE POLICY "documentos-os-update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'documentos-os')
WITH CHECK (bucket_id = 'documentos-os');

DROP POLICY IF EXISTS "documentos-os-delete" ON storage.objects;
CREATE POLICY "documentos-os-delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documentos-os');
