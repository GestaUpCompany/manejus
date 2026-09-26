-- ============================================================================
-- Auditoria do módulo comercial (venda / compra / transferência via OS)
--
-- Correções (todas reproduzidas nas fazendas de teste antes do fix):
--  1) Entrada que cria categoria nova no lote nascia com quant_inicial = N e
--     created_at = data + 1s. Qualquer outra entrada com a mesma data (fêmeas +
--     machos da mesma categoria, duas cargas no mesmo dia) ficava fora do
--     cutoff e não somava; o estorno também não zerava a categoria (quant_inicial
--     é imutável e continuava contando). Agora a categoria nasce com
--     quant_base = 0 e created_at = data da entrada: toda entrada entra na soma
--     e o soft-delete da movimentação a remove (mesmo padrão da recategorização).
--  2) Peões do PWA são usuarios com papel 'controller' em usuario_fazenda, então
--     passavam no user_has_fazenda_access das RPCs de painel e na RLS de
--     ordens_servico: podiam fechar/estornar/cancelar/conferir via API e até
--     reabrir uma OS fechada com UPDATE direto. RPCs passam a recusar peão e um
--     trigger protege os campos de controle da OS contra escrita direta.
--  3) Transferência fechava sem embarque (laudo registrado antes do embarque
--     sincronizar marcava 'recebida'), creditando o destino sem débito na
--     origem. Fechamento exige embarque e ao menos uma carga conferida; laudo de
--     transferência só é aceito com OS embarcada/recebida.
--  4) Conferência: categoria repetida no laudo colidia no local_id e travava a
--     carga para sempre. Agora agrega por categoria+sexo, trava a linha (FOR
--     UPDATE), valida lote de destino e exige acesso à fazenda destino.
--  5) Laudo conferido/processado podia ser editado ou excluído pelo PWA, e
--     laudo/movimentação/pesagem podiam apontar para OS de outra fazenda.
--  6) Buckets documentos-os e videos-os liberavam leitura/escrita/exclusão para
--     qualquer usuário autenticado de qualquer fazenda.
--  7) Retry de sync (upsert por local_id) disparava de novo os triggers BEFORE
--     INSERT: pesagem remarcava indivíduo estornado como vendido, movimentação
--     de OS já fechada falhava para sempre e cada reenvio de comunicado
--     queimava um número de OS.
-- ============================================================================

-- ============================================================================
-- Helpers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.caller_is_peao()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.peoes p
    JOIN auth.users au ON lower(au.email) = lower(p.email)
    WHERE au.id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.current_usuario_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT u.id FROM public.usuarios u
  WHERE u.auth_id = auth.uid() OR u.id = auth.uid()
  LIMIT 1;
$function$;

-- A fazenda informada é uma das pontas da OS (origem ou destino)
CREATE OR REPLACE FUNCTION public.os_fazenda_pertence(p_os_id uuid, p_fazenda_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.ordens_servico os
    WHERE os.id = p_os_id
      AND p_fazenda_id IN (os.fazenda_id, os.fazenda_destino_id)
  );
$function$;

-- Objetos de storage de OS seguem o path <fazenda_id>/<os_id>/<arquivo>
CREATE OR REPLACE FUNCTION public.storage_os_object_access(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parts text[];
  v_fazenda uuid;
  v_os uuid;
BEGIN
  v_parts := string_to_array(p_name, '/');
  IF coalesce(array_length(v_parts, 1), 0) < 3 THEN
    RETURN false;
  END IF;
  BEGIN
    v_fazenda := v_parts[1]::uuid;
    v_os := v_parts[2]::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;
  RETURN public.os_fazenda_pertence(v_os, v_fazenda) AND public.user_has_os_access(v_os);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.caller_is_peao() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_usuario_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.os_fazenda_pertence(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_os_object_access(text) TO authenticated;

-- ============================================================================
-- Schema: destino só em transferência; observação do laudo (o PWA coletava e
-- descartava no sync por falta de coluna)
-- ============================================================================
ALTER TABLE public.ordens_servico
  DROP CONSTRAINT IF EXISTS ordens_servico_destino_so_transferencia;
ALTER TABLE public.ordens_servico
  ADD CONSTRAINT ordens_servico_destino_so_transferencia
  CHECK (tipo = 'transferencia' OR fazenda_destino_id IS NULL);

ALTER TABLE public.os_recebimentos
  ADD COLUMN IF NOT EXISTS observacao text;

-- ============================================================================
-- 1) Entrada em categoria nova: quant_base = 0 + created_at = data da entrada
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_quant_atual_movimentacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_cat_exists boolean;
  v_fazenda_id uuid;
  v_source_cat RECORD;
  v_dest_lote RECORD;
  v_dest_form_nome text;
  v_dest_gmd numeric;
  v_created_at timestamptz;
  -- Variáveis para Entrada
  v_existing_cat RECORD;
  v_old_quant integer;
  v_old_peso numeric;
  v_new_peso numeric;
  v_data_entrada date;
BEGIN
  IF NEW.categoria IS NULL OR NEW.lote_origem_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT fazenda_id INTO v_fazenda_id FROM lotes WHERE id = NEW.lote_origem_id LIMIT 1;

  -- =========================================================================
  -- BLOCO ENTRADA: motivo_movimentacao = 'Entrada'
  -- lote_origem_id = lote que recebe os animais (destino)
  -- =========================================================================
  IF NEW.motivo_movimentacao = 'Entrada' THEN

    v_data_entrada := COALESCE(NEW.data, now())::date;

    -- Verificar se a categoria já existe no lote
    SELECT * INTO v_existing_cat
    FROM lote_categorias
    WHERE lote_id = NEW.lote_origem_id
      AND LOWER(categoria) = LOWER(NEW.categoria)
      AND ativo = true
    LIMIT 1;

    IF v_existing_cat.id IS NULL THEN
      -- Categoria NÃO existe: criar nova lote_categorias
      -- peso_entrada_kg_cab = peso_vivo_atual_kg (peso inicial = peso atual informado)
      -- quant_inicial = numero_cabecas (valor exibido como "inicial"), mas a base
      -- de contagem é quant_base = 0 com cutoff em created_at = data da entrada:
      -- esta e as demais entradas da mesma data entram na soma de
      -- calculate_quant_atual, e o estorno (soft-delete) as remove.
      v_created_at := COALESCE(NEW.data, now());

      INSERT INTO lote_categorias (
        lote_id, categoria, quant_inicial, quant_base, quant_atual,
        data_pesagem, data_ajuste_peso, peso_entrada_kg_cab, peso_vivo_atual_kg_cab,
        raca, sexo, idade, ativo, created_at
      ) VALUES (
        NEW.lote_origem_id, NEW.categoria, NEW.numero_cabecas, 0, NEW.numero_cabecas,
        v_data_entrada, v_data_entrada, NEW.peso_vivo_atual_kg, NEW.peso_vivo_atual_kg,
        NEW.raca, NEW.sexo, NEW.idade, true, v_created_at
      );
    ELSE
      -- Categoria JÁ existe: somar cabeças e ponderar peso
      v_old_quant := COALESCE(v_existing_cat.quant_atual, 0);
      v_old_peso := v_existing_cat.peso_vivo_atual_kg_cab;

      -- Recalcular quant_atual (calculate_quant_atual já soma registros de Entrada)
      UPDATE lote_categorias
      SET quant_atual = calculate_quant_atual(NEW.lote_origem_id, NEW.categoria)
      WHERE lote_id = NEW.lote_origem_id
        AND LOWER(categoria) = LOWER(NEW.categoria)
        AND ativo = true;

      -- Ponderar peso: ((old_quant * old_peso) + (new_cabecas * new_peso)) / (old_quant + new_cabecas)
      IF v_old_quant > 0 AND v_old_peso IS NOT NULL THEN
        v_new_peso := ((v_old_quant * v_old_peso) + (NEW.numero_cabecas * NEW.peso_vivo_atual_kg))
                      / (v_old_quant + NEW.numero_cabecas);
      ELSE
        -- Se old_quant = 0 ou old_peso NULL, o novo peso é simplesmente o informado
        v_new_peso := NEW.peso_vivo_atual_kg;
      END IF;

      -- Atualizar peso ponderado E resetar data_ajuste_peso/data_pesagem
      -- para o cron reiniciar a contagem de GMD a partir desta entrada
      UPDATE lote_categorias
      SET peso_vivo_atual_kg_cab = v_new_peso,
          data_ajuste_peso = v_data_entrada,
          data_pesagem = v_data_entrada
      WHERE lote_id = NEW.lote_origem_id
        AND LOWER(categoria) = LOWER(NEW.categoria)
        AND ativo = true;
    END IF;

    RETURN NEW;
  END IF;

  -- =========================================================================
  -- BLOCO ORIGINAL: Saída, Consumo, Entrevero, Doação, etc.
  -- (código inalterado a partir daqui)
  -- =========================================================================

  SELECT EXISTS(
    SELECT 1 FROM lote_categorias
    WHERE lote_id = NEW.lote_origem_id AND LOWER(categoria) = LOWER(NEW.categoria)
  ) INTO v_cat_exists;

  IF NOT v_cat_exists THEN
    INSERT INTO logs_sync_errors (fazenda_id, caderneta, registro_id, operation, error_code, error_message, error_details, payload)
    VALUES (
      v_fazenda_id,
      'movimentacao',
      NEW.id::text,
      'trigger_update_quant_atual_movimentacao',
      'CATEGORIA_NOT_IN_LOTE',
      'Categoria do registro de movimentacao nao existe no lote_categorias do lote origem',
      'Lote origem: ' || COALESCE(NEW.lote_origem, 'NULL') || ' | Categoria registro: ' || COALESCE(NEW.categoria, 'NULL') || ' | Motivo: ' || COALESCE(NEW.motivo_movimentacao::text, 'NULL') || ' | Cabecas: ' || COALESCE(NEW.numero_cabecas::text, 'NULL'),
      jsonb_build_object('lote_origem_id', NEW.lote_origem_id, 'lote_destino_id', NEW.lote_destino_id, 'categoria', NEW.categoria, 'motivo_movimentacao', NEW.motivo_movimentacao, 'numero_cabecas', NEW.numero_cabecas, 'nome_usuario', NEW.nome_usuario)
    );
    RETURN NEW;
  END IF;

  UPDATE lote_categorias
  SET quant_atual = calculate_quant_atual(NEW.lote_origem_id, NEW.categoria)
  WHERE lote_id = NEW.lote_origem_id AND LOWER(categoria) = LOWER(NEW.categoria) AND ativo = true;

  IF NEW.lote_destino_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM lote_categorias
      WHERE lote_id = NEW.lote_destino_id AND LOWER(categoria) = LOWER(NEW.categoria) AND ativo = true
    ) THEN
      SELECT * INTO v_source_cat
      FROM lote_categorias
      WHERE lote_id = NEW.lote_origem_id AND LOWER(categoria) = LOWER(NEW.categoria) AND ativo = true;

      SELECT * INTO v_dest_lote FROM lotes WHERE id = NEW.lote_destino_id;
      v_dest_gmd := NULL;
      v_dest_form_nome := NULL;
      IF v_dest_lote.formulacao_id IS NOT NULL THEN
        SELECT fcg.gmd INTO v_dest_gmd
        FROM formulacao_categorias_gmd fcg
        WHERE fcg.formulacao_id = v_dest_lote.formulacao_id
          AND LOWER(TRIM(fcg.categoria)) = LOWER(TRIM(NEW.categoria));
        SELECT nome INTO v_dest_form_nome FROM formulacoes WHERE id = v_dest_lote.formulacao_id;
      END IF;

      v_created_at := COALESCE(NEW.data, now()) + interval '1 second';

      INSERT INTO lote_categorias (
        lote_id, categoria, quant_inicial, quant_atual,
        data_pesagem, peso_entrada_kg_cab, peso_entrada_arrobas, gmd, periodo,
        rc_inicial, peso_vivo_atual_kg_cab, peso_vivo_meta_kg_cab, dias_restantes_meta,
        estrategia_nutricional, formulacao_id, raca, sexo, idade, ativo, created_at
      ) VALUES (
        NEW.lote_destino_id, NEW.categoria, NEW.numero_cabecas, NEW.numero_cabecas,
        NEW.data, v_source_cat.peso_entrada_kg_cab, v_source_cat.peso_entrada_arrobas,
        CASE WHEN v_dest_gmd IS NOT NULL THEN v_dest_gmd::text ELSE NULL END,
        v_source_cat.periodo, v_source_cat.rc_inicial,
        v_source_cat.peso_vivo_atual_kg_cab, v_source_cat.peso_vivo_meta_kg_cab, v_source_cat.dias_restantes_meta,
        COALESCE(v_dest_form_nome, v_source_cat.estrategia_nutricional),
        v_dest_lote.formulacao_id,
        v_source_cat.raca, v_source_cat.sexo, v_source_cat.idade, true, v_created_at
      );
    ELSE
      UPDATE lote_categorias
      SET quant_atual = calculate_quant_atual(lote_id, categoria)
      WHERE lote_id = NEW.lote_destino_id AND LOWER(categoria) = LOWER(NEW.categoria) AND ativo = true;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 2) ordens_servico: campos de controle só mudam por RPC/trigger (definer).
--    SECURITY INVOKER de propósito: current_user é 'authenticated' em escrita
--    direta via PostgREST e o dono da função dentro das RPCs/triggers definer.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_os_protege_campos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status NOT IN ('aberta', 'cancelada') THEN
      RAISE EXCEPTION 'OS % está % e não pode ser excluída. Estorne a baixa antes.', OLD.numero_os, OLD.status;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.quantidade_embarcada IS DISTINCT FROM OLD.quantidade_embarcada
     OR NEW.mortes_transporte IS DISTINCT FROM OLD.mortes_transporte
     OR NEW.valor_acerto IS DISTINCT FROM OLD.valor_acerto
     OR NEW.data_credito IS DISTINCT FROM OLD.data_credito
     OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
     OR NEW.closed_by IS DISTINCT FROM OLD.closed_by
     OR NEW.cancelada_at IS DISTINCT FROM OLD.cancelada_at
     OR NEW.motivo_cancelamento IS DISTINCT FROM OLD.motivo_cancelamento
     OR NEW.numero_os IS DISTINCT FROM OLD.numero_os
     OR NEW.ano IS DISTINCT FROM OLD.ano
     OR NEW.sequencial IS DISTINCT FROM OLD.sequencial
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.fazenda_id IS DISTINCT FROM OLD.fazenda_id
     OR NEW.fazenda_destino_id IS DISTINCT FROM OLD.fazenda_destino_id
     OR (OLD.status <> 'aberta' AND NEW.tipo_venda IS DISTINCT FROM OLD.tipo_venda)
  THEN
    RAISE EXCEPTION 'Campos de controle da OS % só mudam pelas ações do painel (fechar, cancelar, estornar)', OLD.numero_os;
  END IF;

  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at AND OLD.status NOT IN ('aberta', 'cancelada') THEN
    RAISE EXCEPTION 'OS % está % e não pode ser excluída. Estorne a baixa antes.', OLD.numero_os, OLD.status;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_os_protege_campos ON public.ordens_servico;
CREATE TRIGGER trg_os_protege_campos
  BEFORE UPDATE OR DELETE ON public.ordens_servico
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_os_protege_campos();

-- Reenvio do comunicado (upsert por local_id) passava pelo BEFORE INSERT e
-- incrementava o contador, queimando um número de OS a cada retry.
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

  IF NEW.local_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ordens_servico WHERE local_id = NEW.local_id
  ) THEN
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

-- ============================================================================
-- 3) os_recebimentos: integridade do laudo (INVOKER, ver nota do item 2)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_os_recebimento_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_os RECORD;
  v_travado boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Retry do sync (upsert por local_id): segue para o ON CONFLICT, cujas
    -- alterações são validadas pelo ramo UPDATE abaixo.
    IF NEW.local_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.os_recebimentos WHERE local_id = NEW.local_id
    ) THEN
      RETURN NEW;
    END IF;

    NEW.conferido := false;
    NEW.conferido_at := NULL;
    NEW.conferido_por := NULL;

    SELECT tipo, status, fazenda_id, fazenda_destino_id, numero_os
    INTO v_os
    FROM public.ordens_servico
    WHERE id = NEW.os_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'OS do laudo não encontrada ou sem acesso';
    END IF;
    IF v_os.status IN ('cancelada', 'fechada') THEN
      RAISE EXCEPTION 'OS % está % e não aceita novos recebimentos', v_os.numero_os, v_os.status;
    END IF;

    IF v_os.tipo = 'compra' THEN
      IF NEW.fazenda_id IS DISTINCT FROM v_os.fazenda_id THEN
        RAISE EXCEPTION 'Laudo de compra deve ser registrado pela fazenda da OS %', v_os.numero_os;
      END IF;
    ELSIF v_os.tipo = 'transferencia' THEN
      IF NEW.fazenda_id IS DISTINCT FROM v_os.fazenda_destino_id THEN
        RAISE EXCEPTION 'Laudo da transferência % deve ser registrado pela fazenda de destino', v_os.numero_os;
      END IF;
      IF v_os.status NOT IN ('embarcada', 'recebida') THEN
        RAISE EXCEPTION 'OS % ainda não tem embarque registrado na origem', v_os.numero_os;
      END IF;
    ELSE
      RAISE EXCEPTION 'OS % não recebe laudo de recebimento', v_os.numero_os;
    END IF;

    RETURN NEW;
  END IF;

  v_travado := OLD.conferido OR EXISTS (
    SELECT 1 FROM public.registros_movimentacao
    WHERE os_recebimento_id = OLD.id AND deleted_at IS NULL
  );

  IF TG_OP = 'DELETE' THEN
    IF v_travado THEN
      RAISE EXCEPTION 'Laudo com entrada já gerada não pode ser excluído. Estorne a baixa da OS.';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.conferido IS DISTINCT FROM OLD.conferido
     OR NEW.conferido_at IS DISTINCT FROM OLD.conferido_at
     OR NEW.conferido_por IS DISTINCT FROM OLD.conferido_por THEN
    RAISE EXCEPTION 'A conferência da carga só é feita pelo painel';
  END IF;

  IF NEW.os_id IS DISTINCT FROM OLD.os_id OR NEW.fazenda_id IS DISTINCT FROM OLD.fazenda_id THEN
    RAISE EXCEPTION 'Laudo não pode ser movido para outra OS ou fazenda';
  END IF;

  IF v_travado AND (
       NEW.contagens IS DISTINCT FROM OLD.contagens
    OR NEW.lote_destino_id IS DISTINCT FROM OLD.lote_destino_id
    OR NEW.mortes IS DISTINCT FROM OLD.mortes
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
  ) THEN
    RAISE EXCEPTION 'Laudo já conferido/processado não pode ser alterado. Estorne a baixa da OS.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_os_recebimento_guard ON public.os_recebimentos;
CREATE TRIGGER trg_os_recebimento_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.os_recebimentos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_os_recebimento_guard();

-- Status por laudo, ciente do tipo: compra aberta -> recebida; transferência
-- embarcada -> recebida; e volta quando o último laudo ativo sai (antes a OS
-- ficava 'recebida' sem laudo e fechava sem entrada nenhuma).
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
  v_tem_laudo boolean;
BEGIN
  v_os_id := COALESCE(NEW.os_id, OLD.os_id);
  IF v_os_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(mortes), 0), COUNT(*) > 0
  INTO v_mortes, v_tem_laudo
  FROM public.os_recebimentos
  WHERE os_id = v_os_id AND deleted_at IS NULL;

  UPDATE public.ordens_servico
  SET
    mortes_transporte = v_mortes,
    status = CASE
      WHEN v_tem_laudo AND tipo = 'compra' AND status = 'aberta' THEN 'recebida'
      WHEN v_tem_laudo AND tipo = 'transferencia' AND status = 'embarcada' THEN 'recebida'
      WHEN NOT v_tem_laudo AND tipo = 'compra' AND status = 'recebida'
        AND COALESCE(quantidade_embarcada, 0) = 0 THEN 'aberta'
      WHEN NOT v_tem_laudo AND tipo = 'transferencia' AND status = 'recebida' THEN
        CASE WHEN COALESCE(quantidade_embarcada, 0) > 0 THEN 'embarcada' ELSE 'aberta' END
      ELSE status
    END,
    updated_at = now()
  WHERE id = v_os_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- O trigger acima já cobre a transição da transferência
DROP TRIGGER IF EXISTS trg_os_recebimento_status_transferencia ON public.os_recebimentos;
DROP FUNCTION IF EXISTS public.trg_os_recebimento_status_transferencia();

-- ============================================================================
-- 4) Movimentação vinculada a OS (INVOKER, ver nota do item 2)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_movimentacao_os_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_status text;
  v_tipo text;
  v_numero text;
  v_origem uuid;
  v_destino uuid;
  v_direto boolean := current_user IN ('authenticated', 'anon');
BEGIN
  IF NEW.os_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Retry do sync (upsert por local_id): a linha já existe, não é movimentação
  -- nova. Sem isto o reenvio de um embarque já gravado falhava para sempre
  -- depois que a OS fechava.
  IF NEW.local_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.registros_movimentacao WHERE local_id = NEW.local_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT status, tipo, numero_os, fazenda_id, fazenda_destino_id
  INTO v_status, v_tipo, v_numero, v_origem, v_destino
  FROM public.ordens_servico WHERE id = NEW.os_id;

  IF v_status IS NULL THEN
    IF v_direto THEN
      RAISE EXCEPTION 'OS vinculada à movimentação não encontrada ou sem acesso';
    END IF;
    RETURN NEW;
  END IF;

  IF v_status = 'cancelada' OR v_status = 'fechada' THEN
    RAISE EXCEPTION 'OS % está % e não aceita novas movimentações', v_numero, v_status;
  END IF;

  IF v_direto AND NEW.fazenda_id IS DISTINCT FROM v_origem AND NEW.fazenda_id IS DISTINCT FROM v_destino THEN
    RAISE EXCEPTION 'Movimentação não pertence às fazendas da OS %', v_numero;
  END IF;

  -- Compra: múltiplos recebimentos por OS (um por caminhão/GTA) são o caso
  -- normal; cada laudo tem sua sessão, então a guarda de sessão única não se
  -- aplica.
  IF v_tipo = 'compra' THEN
    RETURN NEW;
  END IF;

  -- Transferência: a entrada no destino é gerada apenas pela conferência de
  -- cada carga (RPC). Entrada gravada direto pelo app duplicaria o crédito.
  IF v_tipo = 'transferencia' AND v_destino IS NOT NULL AND NEW.fazenda_id = v_destino THEN
    IF v_direto THEN
      RAISE EXCEPTION 'Entrada da transferência % é gerada pela conferência da carga no painel', v_numero;
    END IF;
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registros_movimentacao
    WHERE os_id = NEW.os_id
      AND deleted_at IS NULL
      AND fazenda_id = v_origem
      AND sessao_id IS DISTINCT FROM NEW.sessao_id
      AND local_id IS DISTINCT FROM NEW.local_id
  ) THEN
    RAISE EXCEPTION 'OS % já possui embarque registrado em outra sessão de pesagem', v_numero;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 5) Pesagem vinculada a OS: guarda antes do trigger de indivíduo (ordem
--    alfabética: trg_pesagem_os_guard < trg_registros_pesagem_upsert_individuo)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_pesagem_os_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_os RECORD;
BEGIN
  IF NEW.os_id IS NULL OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.local_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.registros_pesagem WHERE local_id = NEW.local_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT tipo, status, fazenda_id, numero_os INTO v_os
  FROM public.ordens_servico WHERE id = NEW.os_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OS vinculada à pesagem não encontrada ou sem acesso';
  END IF;
  IF v_os.status = 'cancelada' THEN
    RAISE EXCEPTION 'OS % foi cancelada; a pesagem não pode ser vinculada a ela', v_os.numero_os;
  END IF;
  IF v_os.tipo NOT IN ('venda', 'transferencia') THEN
    RAISE EXCEPTION 'OS % não embarca por pesagem', v_os.numero_os;
  END IF;
  IF NEW.fazenda_id IS DISTINCT FROM v_os.fazenda_id THEN
    RAISE EXCEPTION 'Pesagem de embarque deve ser da fazenda de origem da OS %', v_os.numero_os;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pesagem_os_guard ON public.registros_pesagem;
CREATE TRIGGER trg_pesagem_os_guard
  BEFORE INSERT ON public.registros_pesagem
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_pesagem_os_guard();

-- Retry do sync da pesagem (upsert por local_id) reexecutava os efeitos no
-- indivíduo: um animal estornado voltava a 'Venda Vivo'/'Transferido'.
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
  v_tipo_os text;
  v_tipo_venda text;
  v_status_venda text;
BEGIN
  -- Retry (linha já gravada): preserva o vínculo existente e não reaplica
  -- efeitos colaterais no indivíduo.
  IF NEW.local_id IS NOT NULL THEN
    SELECT rp.individuo_id, rp.individuo_status_anterior
    INTO v_individuo_id, v_status_anterior
    FROM public.registros_pesagem rp
    WHERE rp.local_id = NEW.local_id;
    IF FOUND THEN
      NEW.individuo_id := v_individuo_id;
      NEW.individuo_status_anterior := v_status_anterior;
      RETURN NEW;
    END IF;
  END IF;

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

    SELECT tipo, tipo_venda INTO v_tipo_os, v_tipo_venda
    FROM public.ordens_servico WHERE id = NEW.os_id;
    v_status_venda := CASE
      WHEN v_tipo_os = 'transferencia' THEN 'Transferido'
      WHEN v_tipo_venda = 'abate' THEN 'Abatido'
      ELSE 'Venda Vivo'
    END;

    -- Auditoria: animal já vendido/abatido/morto/transferido pesado de novo em outra OS
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
-- 6) Conferência de carga (transferência)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.conferir_recebimento_transferencia(
  p_os_recebimento_id uuid,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_rec RECORD;
  v_os RECORD;
  v_linha RECORD;
  v_count integer := 0;
BEGIN
  IF public.caller_is_peao() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação restrita ao painel de gestão');
  END IF;

  -- FOR UPDATE serializa duplo clique/retry: a segunda chamada espera a
  -- primeira e encontra a carga já conferida.
  SELECT * INTO v_rec FROM public.os_recebimentos
  WHERE id = p_os_recebimento_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recebimento não encontrado');
  END IF;

  SELECT * INTO v_os FROM public.ordens_servico
  WHERE id = v_rec.os_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND OR v_os.tipo <> 'transferencia' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recebimento não pertence a uma OS de transferência');
  END IF;

  IF v_rec.fazenda_id IS DISTINCT FROM v_os.fazenda_destino_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Laudo não pertence à fazenda de destino da OS');
  END IF;

  -- A conferência credita estoque do destino: só quem responde pelo destino
  IF NOT public.user_has_fazenda_access(v_os.fazenda_destino_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Somente a fazenda de destino pode conferir a carga');
  END IF;

  IF v_rec.conferido THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta carga já foi conferida');
  END IF;

  IF v_os.status NOT IN ('embarcada', 'recebida') OR COALESCE(v_os.quantidade_embarcada, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error',
      CASE WHEN v_os.status IN ('fechada', 'cancelada')
        THEN 'OS está ' || v_os.status
        ELSE 'OS ainda não tem embarque registrado na origem'
      END);
  END IF;

  IF v_rec.lote_destino_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.lotes
    WHERE id = v_rec.lote_destino_id
      AND fazenda_id = v_os.fazenda_destino_id
      AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lote de destino do laudo inválido ou excluído');
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_rec.contagens, '[]'::jsonb)) c
    WHERE NULLIF(btrim(c->>'categoria'), '') IS NULL
      AND (COALESCE((c->>'femeas')::integer, 0) + COALESCE((c->>'machos')::integer, 0)) > 0
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Laudo tem quantidade sem categoria');
  END IF;

  -- Uma movimentação por categoria+sexo, agregando linhas repetidas do laudo.
  -- Convenção igual à da compra: motivo 'Entrada' + lote_origem_id = lote
  -- receptor (shape que o trigger de estoque processa e que
  -- calculate_quant_atual soma uma única vez). tipo_entrada 'Transferência'
  -- marca a origem do crédito; lote_destino_id fica NULL para não duplicar.
  FOR v_linha IN
    SELECT min(btrim(c->>'categoria')) AS categoria, x.sexo, SUM(x.cabecas)::integer AS cabecas
    FROM jsonb_array_elements(COALESCE(v_rec.contagens, '[]'::jsonb)) c
    CROSS JOIN LATERAL (VALUES
      ('Fêmea', COALESCE((c->>'femeas')::integer, 0)),
      ('Macho', COALESCE((c->>'machos')::integer, 0))
    ) AS x(sexo, cabecas)
    WHERE NULLIF(btrim(c->>'categoria'), '') IS NOT NULL
    GROUP BY lower(btrim(c->>'categoria')), x.sexo
    HAVING SUM(x.cabecas) > 0
    ORDER BY lower(btrim(c->>'categoria')), x.sexo
  LOOP
    INSERT INTO public.registros_movimentacao (
      fazenda_id, data, lote_origem, lote_origem_id,
      destino, lote_destino_id,
      numero_cabecas, categoria, sexo,
      peso_vivo_atual_kg,
      motivo_movimentacao, subtipo, tipo_entrada,
      responsavel, nome_usuario,
      causa_observacao, observacao,
      fazenda_destino_id,
      os_id, os_recebimento_id, sessao_id, local_id,
      sync_status, version
    ) VALUES (
      v_rec.fazenda_id,
      COALESCE(v_rec.data_chegada::timestamp with time zone, v_rec.data, now()),
      v_rec.lote_destino, v_rec.lote_destino_id,
      NULL, NULL,
      v_linha.cabecas, v_linha.categoria, v_linha.sexo,
      v_rec.peso_medio_balancao,
      'Entrada'::public.tipo_movimentacao_motivo,
      'Entrada'::public.tipo_movimentacao_subtipo,
      'Transferência',
      v_rec.responsavel, COALESCE(v_rec.nome_usuario, v_rec.responsavel),
      NULL,
      'Conferência ' || COALESCE(v_os.numero_os, 'OS') || ' (GTA ' || COALESCE(v_rec.numero_gta, '-') || ')',
      v_os.fazenda_id,
      v_rec.os_id, v_rec.id, 'conf-' || v_rec.id::text,
      'conf-' || v_rec.id::text || '-' || v_linha.sexo || '-' || lower(v_linha.categoria),
      'synced', 1
    );
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Laudo sem quantidades recebidas');
  END IF;

  UPDATE public.os_recebimentos
  SET conferido = true,
      conferido_at = now(),
      conferido_por = COALESCE(public.current_usuario_id(), p_usuario_id),
      updated_at = now()
  WHERE id = v_rec.id;

  RETURN jsonb_build_object(
    'success', true,
    'numero_os', v_os.numero_os,
    'movimentacoes_criadas', v_count
  );
END;
$function$;

-- ============================================================================
-- 7) Fechamento: recusa peão, trava a OS, exige embarque/recebimento efetivo
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
  v_usuario uuid := COALESCE(public.current_usuario_id(), p_usuario_id);
BEGIN
  IF public.caller_is_peao() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação restrita ao painel de gestão');
  END IF;

  SELECT * INTO v_os FROM public.ordens_servico WHERE id = p_os_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS não encontrada');
  END IF;

  IF NOT (public.user_has_fazenda_access(v_os.fazenda_id)
          OR (v_os.fazenda_destino_id IS NOT NULL AND public.user_has_fazenda_access(v_os.fazenda_destino_id))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda desta OS');
  END IF;

  IF v_os.status = 'fechada' THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS já está fechada');
  END IF;
  IF v_os.status = 'cancelada' THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS está cancelada');
  END IF;
  IF v_os.status = 'aberta' OR COALESCE(v_os.quantidade_embarcada, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error',
      CASE WHEN v_os.tipo = 'compra'
        THEN 'OS ainda não tem recebimento registrado'
        ELSE 'OS ainda não tem embarque registrado'
      END);
  END IF;

  -- Compra e transferência: confirmação de recebimento da GTA é dever legal;
  -- a OS não fecha sem ao menos uma GTA anexada.
  IF v_os.tipo IN ('compra', 'transferencia') THEN
    SELECT COUNT(*) INTO v_gta_count
    FROM public.os_documentos
    WHERE os_id = p_os_id AND tipo = 'gta' AND deleted_at IS NULL;
    IF v_gta_count = 0 THEN
      RETURN jsonb_build_object('success', false, 'error',
        CASE WHEN v_os.tipo = 'compra'
          THEN 'Anexe a GTA do recebimento antes de fechar a OS de compra'
          ELSE 'Anexe a GTA da transferência antes de fechar a OS'
        END);
    END IF;
  END IF;

  -- Transferência: saída sem acerto. Exige recebimento no destino, ao menos uma
  -- carga conferida e nenhuma pendente (o crédito no destino só acontece na
  -- conferência).
  IF v_os.tipo = 'transferencia' THEN
    IF v_os.status <> 'recebida' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Aguardando recebimento na fazenda de destino');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.os_recebimentos
      WHERE os_id = p_os_id AND deleted_at IS NULL AND NOT conferido
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Existem cargas pendentes de conferência');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.os_recebimentos
      WHERE os_id = p_os_id AND deleted_at IS NULL AND conferido
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Nenhuma carga conferida no destino');
    END IF;

    UPDATE public.ordens_servico
    SET status = 'fechada',
        closed_at = now(),
        closed_by = v_usuario,
        updated_at = now()
    WHERE id = p_os_id;

    RETURN jsonb_build_object('success', true, 'numero_os', v_os.numero_os);
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
      valor_acerto = p_valor_acerto,
      data_credito = p_data_credito,
      closed_at = now(),
      closed_by = v_usuario,
      updated_at = now()
  WHERE id = p_os_id;

  RETURN jsonb_build_object('success', true, 'numero_os', v_os.numero_os);
END;
$function$;

-- ============================================================================
-- 8) Cancelamento e estorno: recusa peão e trava a OS
-- ============================================================================
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
  IF public.caller_is_peao() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação restrita ao painel de gestão');
  END IF;

  SELECT * INTO v_os FROM public.ordens_servico WHERE id = p_os_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS não encontrada');
  END IF;

  IF NOT (public.user_has_fazenda_access(v_os.fazenda_id)
          OR (v_os.fazenda_destino_id IS NOT NULL AND public.user_has_fazenda_access(v_os.fazenda_destino_id))) THEN
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
  IF public.caller_is_peao() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação restrita ao painel de gestão');
  END IF;

  SELECT * INTO v_os FROM public.ordens_servico WHERE id = p_os_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'OS não encontrada');
  END IF;

  IF NOT (public.user_has_fazenda_access(v_os.fazenda_id)
          OR (v_os.fazenda_destino_id IS NOT NULL AND public.user_has_fazenda_access(v_os.fazenda_destino_id))) THEN
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

  -- Reverte indivíduos marcados por esta OS ao status anterior
  UPDATE public.individuos i
  SET status = COALESCE(rp.individuo_status_anterior, 'Vivo'),
      updated_at = now()
  FROM public.registros_pesagem rp
  WHERE rp.os_id = p_os_id
    AND rp.individuo_id = i.id
    AND rp.deleted_at IS NULL
    AND i.status IN ('Abatido', 'Venda Vivo', 'Transferido');
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

GRANT EXECUTE ON FUNCTION public.conferir_recebimento_transferencia(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_os_venda(uuid, numeric, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_os_venda(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.estornar_baixa_os(uuid, uuid) TO authenticated;

-- ============================================================================
-- 9) os_documentos: documento sempre com fazenda_id de uma das pontas; o
--    destino consegue excluir (soft-delete) o que anexou com fazenda da origem
-- ============================================================================
DROP POLICY IF EXISTS "os_documentos_insert_via_os" ON public.os_documentos;
CREATE POLICY "os_documentos_insert_via_os" ON public.os_documentos
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_os_access(os_id) AND public.os_fazenda_pertence(os_id, fazenda_id));

DROP POLICY IF EXISTS "os_documentos_update_via_os" ON public.os_documentos;
CREATE POLICY "os_documentos_update_via_os" ON public.os_documentos
  FOR UPDATE TO authenticated
  USING (public.user_has_os_access(os_id))
  WITH CHECK (public.user_has_os_access(os_id) AND public.os_fazenda_pertence(os_id, fazenda_id));

-- ============================================================================
-- 10) Storage: objetos de OS só para quem tem acesso à OS do path
-- ============================================================================
DROP POLICY IF EXISTS "documentos-os-read" ON storage.objects;
CREATE POLICY "documentos-os-read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documentos-os' AND public.storage_os_object_access(name));

DROP POLICY IF EXISTS "documentos-os-upload" ON storage.objects;
CREATE POLICY "documentos-os-upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documentos-os' AND public.storage_os_object_access(name));

DROP POLICY IF EXISTS "documentos-os-update" ON storage.objects;
CREATE POLICY "documentos-os-update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'documentos-os' AND public.storage_os_object_access(name))
  WITH CHECK (bucket_id = 'documentos-os' AND public.storage_os_object_access(name));

DROP POLICY IF EXISTS "documentos-os-delete" ON storage.objects;
CREATE POLICY "documentos-os-delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'documentos-os' AND public.storage_os_object_access(name));

DROP POLICY IF EXISTS "videos-os-read" ON storage.objects;
CREATE POLICY "videos-os-read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'videos-os' AND public.storage_os_object_access(name));

DROP POLICY IF EXISTS "videos-os-upload" ON storage.objects;
CREATE POLICY "videos-os-upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'videos-os' AND public.storage_os_object_access(name));

DROP POLICY IF EXISTS "videos-os-update" ON storage.objects;
CREATE POLICY "videos-os-update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'videos-os' AND public.storage_os_object_access(name))
  WITH CHECK (bucket_id = 'videos-os' AND public.storage_os_object_access(name));

DROP POLICY IF EXISTS "videos-os-delete" ON storage.objects;
CREATE POLICY "videos-os-delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'videos-os' AND public.storage_os_object_access(name));
