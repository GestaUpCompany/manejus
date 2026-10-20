-- ============================================================================
-- Indivíduos / Fase 4 C2 (1/3): protocolos de IATF editáveis por fazenda
-- ============================================================================
-- Cria o CATÁLOGO de protocolos (passos relativos ao D0). Lote de protocolo, fêmeas, tarefas e IA vêm nas
-- migrations seguintes. Nenhuma tabela existente é alterada; o PWA e o painel atuais não percebem nada.
--
--   1) protocolos_iatf          protocolo da fazenda (nome, descrição, ativo)
--   2) protocolos_iatf_passos   passos com dia relativo ao D0 (0 a 30); exatamente 1 passo de Inseminacao
--   3) copiar_modelo_protocolo_iatf(p_fazenda_id)   cria o modelo clássico D0/D8/D10, editável
--
-- Produto do passo: medicamento_id opcional (catálogo da fazenda) + medicamento_nome/dose em texto, porque o
-- catálogo pode mudar depois (mesmo critério de aplicacoes_sanitarias).
-- Segurança (padrão Fases 5/B): RLS por fazenda para authenticated, anon sem acesso, auditoria genérica.
-- Rollback: supabase/rollbacks/20261020100000_protocolos_iatf_rollback.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Protocolos
-- ----------------------------------------------------------------------------
CREATE TABLE public.protocolos_iatf (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX protocolos_iatf_nome_unico
  ON public.protocolos_iatf (fazenda_id, lower(btrim(nome))) WHERE deleted_at IS NULL;
CREATE INDEX idx_protocolos_iatf_fazenda ON public.protocolos_iatf (fazenda_id) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2) Passos
-- ----------------------------------------------------------------------------
CREATE TABLE public.protocolos_iatf_passos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo_id uuid NOT NULL REFERENCES public.protocolos_iatf(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,   -- desnormalizado para a RLS
  dia integer NOT NULL CHECK (dia BETWEEN 0 AND 30),                           -- relativo ao D0
  ordem integer NOT NULL DEFAULT 0,
  rotulo text NOT NULL CHECK (btrim(rotulo) <> ''),
  tipo text NOT NULL CHECK (tipo IN ('Aplicacao', 'Retirada', 'Inseminacao', 'Outro')),
  medicamento_id uuid REFERENCES public.medicamentos(id) ON DELETE SET NULL,
  medicamento_nome text,
  dose text,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_protocolos_iatf_passos_protocolo ON public.protocolos_iatf_passos (protocolo_id, dia, ordem);
-- Um protocolo tem exatamente um passo de IA (a regra "pelo menos um" é validada no painel e na criação do lote)
CREATE UNIQUE INDEX protocolos_iatf_passos_uma_ia
  ON public.protocolos_iatf_passos (protocolo_id) WHERE tipo = 'Inseminacao';

-- Mantém a fazenda do passo igual à do protocolo (a RLS confia nela)
CREATE OR REPLACE FUNCTION public.trg_protocolos_iatf_passos_validar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_faz uuid;
BEGIN
  SELECT p.fazenda_id INTO v_faz FROM public.protocolos_iatf p WHERE p.id = NEW.protocolo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Protocolo não encontrado' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_faz <> NEW.fazenda_id THEN
    RAISE EXCEPTION 'O passo deve ser da mesma fazenda do protocolo' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.medicamento_id IS NOT NULL THEN
    PERFORM 1 FROM public.medicamentos m WHERE m.id = NEW.medicamento_id AND m.fazenda_id = NEW.fazenda_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Medicamento de outra fazenda' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trg_protocolos_iatf_passos_validar() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_protocolos_iatf_passos_validar
  BEFORE INSERT OR UPDATE ON public.protocolos_iatf_passos
  FOR EACH ROW EXECUTE FUNCTION public.trg_protocolos_iatf_passos_validar();

CREATE TRIGGER update_protocolos_iatf_updated_at
  BEFORE UPDATE ON public.protocolos_iatf
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_audit_protocolos_iatf
  AFTER INSERT OR DELETE OR UPDATE ON public.protocolos_iatf
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

CREATE TRIGGER trg_audit_protocolos_iatf_passos
  AFTER INSERT OR DELETE OR UPDATE ON public.protocolos_iatf_passos
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- ----------------------------------------------------------------------------
-- 3) RLS e privilégios (padrão Fases 5/B)
-- ----------------------------------------------------------------------------
ALTER TABLE public.protocolos_iatf ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protocolos_iatf_passos ENABLE ROW LEVEL SECURITY;

CREATE POLICY protocolos_iatf_tenant ON public.protocolos_iatf FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

CREATE POLICY protocolos_iatf_passos_tenant ON public.protocolos_iatf_passos FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

REVOKE ALL ON public.protocolos_iatf, public.protocolos_iatf_passos FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.protocolos_iatf, public.protocolos_iatf_passos FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocolos_iatf, public.protocolos_iatf_passos TO authenticated;

-- ----------------------------------------------------------------------------
-- 4) Modelo clássico D0/D8/D10 (editável depois; os dados fixos do modelo ficam só aqui)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.copiar_modelo_protocolo_iatf(p_fazenda_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_nome text := 'IATF clássico (D0/D8/D10)';
  v_n integer := 1;
BEGIN
  IF NOT (public.is_admin_user() OR public.caller_has_fazenda_access(p_fazenda_id)) THEN
    RAISE EXCEPTION 'Sem acesso à fazenda' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Nome livre: acrescenta (2), (3)... se a fazenda já copiou o modelo
  WHILE EXISTS (
    SELECT 1 FROM public.protocolos_iatf p
    WHERE p.fazenda_id = p_fazenda_id AND p.deleted_at IS NULL AND lower(btrim(p.nome)) = lower(v_nome)
  ) LOOP
    v_n := v_n + 1;
    v_nome := 'IATF clássico (D0/D8/D10) (' || v_n || ')';
  END LOOP;

  INSERT INTO public.protocolos_iatf (fazenda_id, nome, descricao)
  VALUES (p_fazenda_id, v_nome,
          'Modelo clássico: D0 implante de progesterona + estradiol; D8 retirada, prostaglandina e eCG; D10 inseminação. Ajuste produtos e doses ao protocolo do veterinário.')
  RETURNING id INTO v_id;

  INSERT INTO public.protocolos_iatf_passos (protocolo_id, fazenda_id, dia, ordem, rotulo, tipo, medicamento_nome)
  VALUES
    (v_id, p_fazenda_id, 0, 1, 'Implante de progesterona + estradiol', 'Aplicacao', 'Progesterona + benzoato de estradiol'),
    (v_id, p_fazenda_id, 8, 2, 'Retirada do implante + prostaglandina + eCG', 'Retirada', 'Prostaglandina + eCG'),
    (v_id, p_fazenda_id, 10, 3, 'Inseminação (IA)', 'Inseminacao', NULL);

  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.copiar_modelo_protocolo_iatf(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copiar_modelo_protocolo_iatf(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.protocolos_iatf IS 'Protocolos de IATF da fazenda (catálogo editável). Os passos ficam em protocolos_iatf_passos, com dia relativo ao D0.';
