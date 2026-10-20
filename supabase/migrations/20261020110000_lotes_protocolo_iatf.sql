-- ============================================================================
-- Indivíduos / Fase 4 C2 (2/3): lote de protocolo de IATF, fêmeas e tarefas
-- ============================================================================
-- Um lote de protocolo é um grupo de fêmeas que segue um protocolo a partir de um D0. Na criação, os passos do
-- protocolo viram TAREFAS com data calculada (D0 + dia). A tarefa guarda um snapshot do passo, então editar o
-- protocolo depois não muda lotes já criados.
--
--   1) lotes_protocolo_iatf            grupo (protocolo, D0, status) com local_id para criação offline futura
--   2) lotes_protocolo_iatf_femeas     fêmeas do grupo (Ativa | Descartada)
--   3) lotes_protocolo_iatf_tarefas    passos com data prevista e marcação de execução
--   4) criar_lote_protocolo_iatf       cria lote + fêmeas + tarefas numa transação (idempotente por local_id)
--   5) marcar_tarefa_protocolo_iatf    marca/desmarca o passo (local_id da marcação do PWA); o lote conclui sozinho
--                                      quando não há pendência
--
-- A Inseminação em eventos_reprodutivos (passo de IA) e o elo protocolo_lote_id vêm na migration 3/3.
-- As RPCs são SECURITY INVOKER: a RLS por fazenda vale para quem chama. Não mexe em quant_atual nem em
-- nenhuma tabela existente. O PWA e o painel atuais não percebem nada.
-- Rollback: supabase/rollbacks/20261020110000_lotes_protocolo_iatf_rollback.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Lote de protocolo
-- ----------------------------------------------------------------------------
CREATE TABLE public.lotes_protocolo_iatf (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  protocolo_id uuid NOT NULL REFERENCES public.protocolos_iatf(id),
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  data_d0 date NOT NULL,
  estacao_id uuid REFERENCES public.estacoes_monta(id) ON DELETE SET NULL,
  responsavel text,
  status text NOT NULL DEFAULT 'Em andamento' CHECK (status IN ('Em andamento', 'Concluído', 'Cancelado')),
  observacao text,
  local_id text,
  origem text NOT NULL DEFAULT 'painel' CHECK (origem IN ('painel', 'pwa')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Índice único COMPLETO (parcial dá 42P10 no upsert)
CREATE UNIQUE INDEX lotes_protocolo_iatf_local_id_key ON public.lotes_protocolo_iatf (local_id);
CREATE INDEX idx_lotes_protocolo_iatf_fazenda ON public.lotes_protocolo_iatf (fazenda_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_lotes_protocolo_iatf_protocolo ON public.lotes_protocolo_iatf (protocolo_id);

-- ----------------------------------------------------------------------------
-- 2) Fêmeas do lote
-- ----------------------------------------------------------------------------
CREATE TABLE public.lotes_protocolo_iatf_femeas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_protocolo_id uuid NOT NULL REFERENCES public.lotes_protocolo_iatf(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,   -- desnormalizado para a RLS
  individuo_id uuid NOT NULL REFERENCES public.individuos(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'Ativa' CHECK (status IN ('Ativa', 'Descartada')),
  motivo_descarte text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lotes_protocolo_iatf_femeas_unica UNIQUE (lote_protocolo_id, individuo_id)
);

CREATE INDEX idx_lotes_protocolo_iatf_femeas_individuo ON public.lotes_protocolo_iatf_femeas (individuo_id);

-- ----------------------------------------------------------------------------
-- 3) Tarefas (snapshot do passo + execução)
-- ----------------------------------------------------------------------------
CREATE TABLE public.lotes_protocolo_iatf_tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_protocolo_id uuid NOT NULL REFERENCES public.lotes_protocolo_iatf(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,   -- desnormalizado para a RLS
  passo_id uuid REFERENCES public.protocolos_iatf_passos(id) ON DELETE SET NULL,
  dia integer NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  rotulo text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('Aplicacao', 'Retirada', 'Inseminacao', 'Outro')),
  medicamento_id uuid REFERENCES public.medicamentos(id) ON DELETE SET NULL,
  medicamento_nome text,
  dose text,
  data_prevista date NOT NULL,
  feita_em date,
  feita_por text,
  observacao text,
  local_id text,                                                               -- chave da marcação feita no PWA
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índice único COMPLETO (parcial dá 42P10 no upsert)
CREATE UNIQUE INDEX lotes_protocolo_iatf_tarefas_local_id_key ON public.lotes_protocolo_iatf_tarefas (local_id);
CREATE INDEX idx_lotes_protocolo_iatf_tarefas_lote ON public.lotes_protocolo_iatf_tarefas (lote_protocolo_id, data_prevista, ordem);
CREATE INDEX idx_lotes_protocolo_iatf_tarefas_pendentes ON public.lotes_protocolo_iatf_tarefas (fazenda_id, data_prevista) WHERE feita_em IS NULL;

-- ----------------------------------------------------------------------------
-- 4) Integridade que as FKs não cobrem
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_lotes_protocolo_iatf_validar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_faz uuid;
BEGIN
  NEW.updated_at := now();

  SELECT p.fazenda_id INTO v_faz FROM public.protocolos_iatf p WHERE p.id = NEW.protocolo_id;
  IF NOT FOUND OR v_faz <> NEW.fazenda_id THEN
    RAISE EXCEPTION 'Protocolo inválido para esta fazenda' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.estacao_id IS NOT NULL THEN
    PERFORM 1 FROM public.estacoes_monta e
    WHERE e.id = NEW.estacao_id AND e.fazenda_id = NEW.fazenda_id AND e.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Estação de monta inválida para esta fazenda' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_lotes_protocolo_iatf_filho_validar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_faz uuid;
  v_ind record;
BEGIN
  NEW.updated_at := now();

  SELECT l.fazenda_id INTO v_faz FROM public.lotes_protocolo_iatf l WHERE l.id = NEW.lote_protocolo_id;
  IF NOT FOUND OR v_faz <> NEW.fazenda_id THEN
    RAISE EXCEPTION 'Lote de protocolo inválido para esta fazenda' USING ERRCODE = 'check_violation';
  END IF;

  -- Só na fêmea: sexo, fazenda e vida do animal (descarte e edição posteriores não revalidam o animal)
  IF TG_TABLE_NAME = 'lotes_protocolo_iatf_femeas' AND (TG_OP = 'INSERT' OR NEW.individuo_id IS DISTINCT FROM OLD.individuo_id) THEN
    SELECT i.sexo, i.fazenda_id, i.status INTO v_ind
    FROM public.individuos i WHERE i.id = NEW.individuo_id AND i.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Indivíduo não encontrado ou excluído' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_ind.fazenda_id <> NEW.fazenda_id THEN
      RAISE EXCEPTION 'O indivíduo pertence a outra fazenda' USING ERRCODE = 'check_violation';
    END IF;
    IF v_ind.sexo <> 'Fêmea' THEN
      RAISE EXCEPTION 'Protocolo de IATF só se aplica a fêmeas (indivíduo é %)', v_ind.sexo USING ERRCODE = 'check_violation';
    END IF;
    IF v_ind.status <> 'Vivo' THEN
      RAISE EXCEPTION 'A fêmea precisa estar viva (status %)', v_ind.status USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trg_lotes_protocolo_iatf_validar() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_lotes_protocolo_iatf_filho_validar() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_lotes_protocolo_iatf_validar
  BEFORE INSERT OR UPDATE ON public.lotes_protocolo_iatf
  FOR EACH ROW EXECUTE FUNCTION public.trg_lotes_protocolo_iatf_validar();

CREATE TRIGGER trg_lotes_protocolo_iatf_femeas_validar
  BEFORE INSERT OR UPDATE ON public.lotes_protocolo_iatf_femeas
  FOR EACH ROW EXECUTE FUNCTION public.trg_lotes_protocolo_iatf_filho_validar();

CREATE TRIGGER trg_lotes_protocolo_iatf_tarefas_validar
  BEFORE INSERT OR UPDATE ON public.lotes_protocolo_iatf_tarefas
  FOR EACH ROW EXECUTE FUNCTION public.trg_lotes_protocolo_iatf_filho_validar();

CREATE TRIGGER trg_audit_lotes_protocolo_iatf
  AFTER INSERT OR DELETE OR UPDATE ON public.lotes_protocolo_iatf
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

CREATE TRIGGER trg_audit_lotes_protocolo_iatf_femeas
  AFTER INSERT OR DELETE OR UPDATE ON public.lotes_protocolo_iatf_femeas
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

CREATE TRIGGER trg_audit_lotes_protocolo_iatf_tarefas
  AFTER INSERT OR DELETE OR UPDATE ON public.lotes_protocolo_iatf_tarefas
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- ----------------------------------------------------------------------------
-- 5) RLS e privilégios (padrão Fases 5/B)
-- ----------------------------------------------------------------------------
ALTER TABLE public.lotes_protocolo_iatf ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes_protocolo_iatf_femeas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes_protocolo_iatf_tarefas ENABLE ROW LEVEL SECURITY;

CREATE POLICY lotes_protocolo_iatf_tenant ON public.lotes_protocolo_iatf FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

CREATE POLICY lotes_protocolo_iatf_femeas_tenant ON public.lotes_protocolo_iatf_femeas FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

CREATE POLICY lotes_protocolo_iatf_tarefas_tenant ON public.lotes_protocolo_iatf_tarefas FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

REVOKE ALL ON public.lotes_protocolo_iatf, public.lotes_protocolo_iatf_femeas, public.lotes_protocolo_iatf_tarefas FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.lotes_protocolo_iatf, public.lotes_protocolo_iatf_femeas, public.lotes_protocolo_iatf_tarefas FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lotes_protocolo_iatf, public.lotes_protocolo_iatf_femeas, public.lotes_protocolo_iatf_tarefas TO authenticated;

-- ----------------------------------------------------------------------------
-- 6) Criar lote (lote + fêmeas + tarefas numa transação)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_lote_protocolo_iatf(
  p_fazenda_id uuid,
  p_protocolo_id uuid,
  p_nome text,
  p_data_d0 date,
  p_individuos uuid[],
  p_estacao_id uuid DEFAULT NULL,
  p_responsavel text DEFAULT NULL,
  p_local_id text DEFAULT NULL,
  p_origem text DEFAULT 'painel'
) RETURNS uuid
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_prot record;
  v_ids uuid[];
BEGIN
  -- Reenvio do mesmo lote (PWA futuro): devolve o que já existe
  IF p_local_id IS NOT NULL THEN
    SELECT l.id INTO v_id FROM public.lotes_protocolo_iatf l WHERE l.local_id = p_local_id;
    IF FOUND THEN RETURN v_id; END IF;
  END IF;

  IF p_nome IS NULL OR btrim(p_nome) = '' THEN
    RAISE EXCEPTION 'Informe o nome do lote' USING ERRCODE = 'check_violation';
  END IF;
  IF p_data_d0 IS NULL THEN
    RAISE EXCEPTION 'Informe o D0' USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.id, p.ativo INTO v_prot
  FROM public.protocolos_iatf p
  WHERE p.id = p_protocolo_id AND p.fazenda_id = p_fazenda_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Protocolo não encontrado nesta fazenda' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NOT v_prot.ativo THEN
    RAISE EXCEPTION 'O protocolo está inativo' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM public.protocolos_iatf_passos s WHERE s.protocolo_id = p_protocolo_id AND s.tipo = 'Inseminacao';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O protocolo precisa ter um passo de Inseminação' USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_ids FROM unnest(p_individuos) AS x WHERE x IS NOT NULL;
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos uma fêmea' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.lotes_protocolo_iatf (fazenda_id, protocolo_id, nome, data_d0, estacao_id, responsavel, local_id, origem)
  VALUES (p_fazenda_id, p_protocolo_id, btrim(p_nome), p_data_d0, p_estacao_id, NULLIF(btrim(p_responsavel), ''), p_local_id,
          CASE WHEN p_origem = 'pwa' THEN 'pwa' ELSE 'painel' END)
  RETURNING id INTO v_id;

  -- O gatilho valida sexo, vida e fazenda de cada fêmea
  INSERT INTO public.lotes_protocolo_iatf_femeas (lote_protocolo_id, fazenda_id, individuo_id)
  SELECT v_id, p_fazenda_id, x FROM unnest(v_ids) AS x;

  INSERT INTO public.lotes_protocolo_iatf_tarefas
    (lote_protocolo_id, fazenda_id, passo_id, dia, ordem, rotulo, tipo, medicamento_id, medicamento_nome, dose, data_prevista)
  SELECT v_id, p_fazenda_id, s.id, s.dia, s.ordem, s.rotulo, s.tipo, s.medicamento_id, s.medicamento_nome, s.dose,
         p_data_d0 + s.dia
  FROM public.protocolos_iatf_passos s
  WHERE s.protocolo_id = p_protocolo_id;

  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.criar_lote_protocolo_iatf(uuid, uuid, text, date, uuid[], uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_lote_protocolo_iatf(uuid, uuid, text, date, uuid[], uuid, text, text, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7) Marcar / desmarcar tarefa (o passo de IA também passa por aqui; a Inseminação é gravada na migration 3/3)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marcar_tarefa_protocolo_iatf(
  p_fazenda_id uuid,
  p_tarefa_id uuid,
  p_feita_em date,
  p_observacao text DEFAULT NULL,
  p_responsavel text DEFAULT NULL,
  p_local_id text DEFAULT NULL
) RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_t record;
  v_status text;
BEGIN
  SELECT t.id, t.lote_protocolo_id INTO v_t
  FROM public.lotes_protocolo_iatf_tarefas t WHERE t.id = p_tarefa_id AND t.fazenda_id = p_fazenda_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada nesta fazenda' USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT l.status INTO v_status FROM public.lotes_protocolo_iatf l
  WHERE l.id = v_t.lote_protocolo_id AND l.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de protocolo não encontrado' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_status = 'Cancelado' THEN
    RAISE EXCEPTION 'O lote está cancelado' USING ERRCODE = 'check_violation';
  END IF;

  IF p_feita_em IS NOT NULL AND p_feita_em > (now() AT TIME ZONE 'America/Cuiaba')::date THEN
    RAISE EXCEPTION 'A data de execução não pode ser futura' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.lotes_protocolo_iatf_tarefas
     SET feita_em = p_feita_em,
         feita_por = CASE WHEN p_feita_em IS NULL THEN NULL ELSE NULLIF(btrim(p_responsavel), '') END,
         observacao = CASE WHEN p_feita_em IS NULL THEN observacao ELSE COALESCE(NULLIF(btrim(p_observacao), ''), observacao) END,
         local_id = CASE WHEN p_feita_em IS NULL THEN NULL ELSE COALESCE(NULLIF(btrim(p_local_id), ''), local_id) END,
         updated_at = now()
   WHERE id = p_tarefa_id;

  -- O lote conclui sozinho quando não resta tarefa pendente e reabre se uma marcação for desfeita
  UPDATE public.lotes_protocolo_iatf l
     SET status = CASE WHEN EXISTS (
           SELECT 1 FROM public.lotes_protocolo_iatf_tarefas t WHERE t.lote_protocolo_id = l.id AND t.feita_em IS NULL
         ) THEN 'Em andamento' ELSE 'Concluído' END
   WHERE l.id = v_t.lote_protocolo_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.marcar_tarefa_protocolo_iatf(uuid, uuid, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_tarefa_protocolo_iatf(uuid, uuid, date, text, text, text) TO authenticated, service_role;

COMMENT ON TABLE public.lotes_protocolo_iatf IS 'Grupo de fêmeas sob um protocolo de IATF a partir de um D0. Tarefas com data calculada em lotes_protocolo_iatf_tarefas.';
