-- ============================================================================
-- Sanidade S1: carência/intervalo no catálogo e aplicações sanitárias (por animal ou por lote)
-- ============================================================================
-- Aditivo: colunas anuláveis em medicamentos + tabela nova. Nada existente é alterado; o PWA não lê estas tabelas.
--   * aplicacoes_sanitarias: um evento por animal OU por lote (com numero_cabecas), com snapshot do produto/carência/intervalo
--     (o catálogo pode mudar depois). Datas derivadas por gatilho: liberacao_abate_em = data + carência; proxima_aplicacao_em = data + intervalo.
--   * Não altera contagem, peso nem movimentação: sanidade é só registro (alerta antes de bloqueio).
--   * RLS padrão: is_admin_user() OR caller_has_fazenda_access(fazenda_id); sem acesso de anon.
-- Rollback: supabase/rollbacks/20261016270000_sanidade_aplicacoes_rollback.sql
-- ============================================================================

ALTER TABLE public.medicamentos
  ADD COLUMN IF NOT EXISTS carencia_abate_dias integer CHECK (carencia_abate_dias IS NULL OR carencia_abate_dias >= 0),
  ADD COLUMN IF NOT EXISTS intervalo_reaplicacao_dias integer CHECK (intervalo_reaplicacao_dias IS NULL OR intervalo_reaplicacao_dias > 0);

CREATE TABLE public.aplicacoes_sanitarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  data date NOT NULL,                                          -- data na fazenda, sem fuso
  tipo text NOT NULL,
  individuo_id uuid REFERENCES public.individuos(id) ON DELETE SET NULL,
  lote_id uuid REFERENCES public.lotes(id) ON DELETE SET NULL,
  categoria text,                                              -- quando o alvo é o lote (opcional)
  numero_cabecas integer,                                      -- quando o alvo é o lote
  medicamento_id uuid REFERENCES public.medicamentos(id) ON DELETE SET NULL,
  medicamento_nome text NOT NULL CHECK (btrim(medicamento_nome) <> ''),   -- snapshot
  principio_ativo text,
  dose_aplicada text,
  via_aplicacao text,
  lote_produto text,
  validade_produto date,
  carencia_abate_dias integer CHECK (carencia_abate_dias IS NULL OR carencia_abate_dias >= 0),   -- snapshot do catálogo
  intervalo_reaplicacao_dias integer CHECK (intervalo_reaplicacao_dias IS NULL OR intervalo_reaplicacao_dias > 0),
  liberacao_abate_em date,                                     -- derivado (gatilho)
  proxima_aplicacao_em date,                                   -- derivado (gatilho)
  diagnostico text,
  observacao text,
  responsavel text,
  origem text NOT NULL DEFAULT 'painel',
  local_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT aplicacoes_sanitarias_tipo_check
    CHECK (tipo IN ('Vacinação', 'Vermifugação', 'Tratamento', 'Preventivo', 'Outro')),
  CONSTRAINT aplicacoes_sanitarias_origem_check CHECK (origem IN ('painel', 'pwa')),
  CONSTRAINT aplicacoes_sanitarias_alvo_check CHECK (individuo_id IS NOT NULL OR lote_id IS NOT NULL),
  CONSTRAINT aplicacoes_sanitarias_cabecas_check
    CHECK (numero_cabecas IS NULL OR (numero_cabecas > 0 AND individuo_id IS NULL))
);

CREATE UNIQUE INDEX aplicacoes_sanitarias_local_id_key ON public.aplicacoes_sanitarias (local_id);
CREATE INDEX idx_aplicacoes_sanitarias_individuo ON public.aplicacoes_sanitarias (individuo_id, data DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_aplicacoes_sanitarias_lote ON public.aplicacoes_sanitarias (lote_id, data DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_aplicacoes_sanitarias_fazenda ON public.aplicacoes_sanitarias (fazenda_id, data DESC) WHERE deleted_at IS NULL;

-- Integridade que as FKs não cobrem + campos derivados
CREATE OR REPLACE FUNCTION public.trg_aplicacoes_sanitarias_validar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_fazenda uuid;
  v_carencia integer;
  v_intervalo integer;
BEGIN
  IF NEW.data > (now() AT TIME ZONE 'America/Cuiaba')::date THEN
    RAISE EXCEPTION 'A data da aplicação não pode ser futura';
  END IF;

  IF NEW.individuo_id IS NOT NULL THEN
    SELECT fazenda_id INTO v_fazenda FROM public.individuos WHERE id = NEW.individuo_id;
    IF v_fazenda IS DISTINCT FROM NEW.fazenda_id THEN
      RAISE EXCEPTION 'O animal não pertence à fazenda da aplicação';
    END IF;
  END IF;

  IF NEW.lote_id IS NOT NULL THEN
    SELECT fazenda_id INTO v_fazenda FROM public.lotes WHERE id = NEW.lote_id;
    IF v_fazenda IS DISTINCT FROM NEW.fazenda_id THEN
      RAISE EXCEPTION 'O lote não pertence à fazenda da aplicação';
    END IF;
  END IF;

  IF NEW.medicamento_id IS NOT NULL THEN
    SELECT m.fazenda_id, m.carencia_abate_dias, m.intervalo_reaplicacao_dias
      INTO v_fazenda, v_carencia, v_intervalo
    FROM public.medicamentos m WHERE m.id = NEW.medicamento_id;
    IF v_fazenda IS DISTINCT FROM NEW.fazenda_id THEN
      RAISE EXCEPTION 'O medicamento não pertence à fazenda da aplicação';
    END IF;
    -- snapshot do catálogo só quando o lançamento não informou o valor
    IF TG_OP = 'INSERT' THEN
      NEW.carencia_abate_dias := COALESCE(NEW.carencia_abate_dias, v_carencia);
      NEW.intervalo_reaplicacao_dias := COALESCE(NEW.intervalo_reaplicacao_dias, v_intervalo);
    END IF;
  END IF;

  NEW.liberacao_abate_em := CASE WHEN NEW.carencia_abate_dias IS NULL THEN NULL ELSE NEW.data + NEW.carencia_abate_dias END;
  NEW.proxima_aplicacao_em := CASE WHEN NEW.intervalo_reaplicacao_dias IS NULL THEN NULL ELSE NEW.data + NEW.intervalo_reaplicacao_dias END;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trg_aplicacoes_sanitarias_validar() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_aplicacoes_sanitarias_validar
  BEFORE INSERT OR UPDATE ON public.aplicacoes_sanitarias
  FOR EACH ROW EXECUTE FUNCTION public.trg_aplicacoes_sanitarias_validar();

CREATE TRIGGER trg_audit_aplicacoes_sanitarias
  AFTER INSERT OR DELETE OR UPDATE ON public.aplicacoes_sanitarias
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

ALTER TABLE public.aplicacoes_sanitarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY aplicacoes_sanitarias_tenant ON public.aplicacoes_sanitarias FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

REVOKE ALL ON public.aplicacoes_sanitarias FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.aplicacoes_sanitarias FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aplicacoes_sanitarias TO authenticated;
