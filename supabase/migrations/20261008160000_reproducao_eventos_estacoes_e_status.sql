-- ============================================================================
-- Indivíduos / Fase 4a: reprodução (estações de monta, eventos reprodutivos, status derivado)
-- ============================================================================
-- Hoje o sistema só conhece o PARTO (registros_maternidade). Não há cobertura, inseminação, diagnóstico
-- de gestação nem aborto, e "Vaca Prenha" é uma categoria escolhida à mão (0 animais a usam).
--
-- Esta migration cria, SEM alterar nenhuma tabela existente:
--   1) estacoes_monta           períodos de monta da fazenda
--   2) eventos_reprodutivos     Cobertura | Inseminação | Diagnóstico de gestação | Aborto, sempre de UMA fêmea
--   3) trg_eventos_reprodutivos_validar   integridade que as FKs não cobrem (fêmea, mesma fazenda, data)
--   4) gestacao_dias_padrao()   283 dias, num só lugar (ajuste por raça fica para depois)
--   5) v_status_reprodutivo     status, previsão de parto e intervalos DERIVADOS (nada digitado)
--
-- Decisões do responsável (08/10/2026): só estes 4 tipos de evento; gestação fixa em 283 dias; touro em
-- TEXTO LIVRE como caminho principal (nenhuma fazenda tem touro cadastrado; touro_id é opcional); o
-- diagnóstico sozinho basta para a previsão de parto (rebanho existente não tem cobertura lançada).
--
-- Regras do status (a partir do último parto sem aborto ou do último aborto, o "marco"):
--   Prenha        último diagnóstico após o marco é Prenha e não há cobertura/IA mais nova
--   Coberta       há cobertura/IA após o marco sem diagnóstico definitivo mais novo (aguardando diagnóstico)
--   Vazia         último diagnóstico é Vazia (sem cobertura mais nova) ou o último marco foi um aborto
--   Parida        último marco é um parto e nada aconteceu depois
--   Sem registro  nenhuma informação reprodutiva
--
-- Impacto no PWA: nenhum. Tabelas/view novas que o PWA não lê nem escreve. Sem backfill.
-- Segurança (padrão Fases 5/B): RLS por fazenda para authenticated, anon sem acesso, view com
-- security_invoker, função de gatilho sem EXECUTE público, auditoria genérica.
-- Rollback: supabase/rollbacks/20261008160000_reproducao_eventos_estacoes_e_status_rollback.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Gestação padrão (um só lugar para trocar depois)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gestacao_dias_padrao()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$ SELECT 283 $function$;

REVOKE EXECUTE ON FUNCTION public.gestacao_dias_padrao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestacao_dias_padrao() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2) Estações de monta
-- ----------------------------------------------------------------------------
CREATE TABLE public.estacoes_monta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT estacoes_monta_periodo_check CHECK (data_fim >= data_inicio)
);

CREATE UNIQUE INDEX estacoes_monta_nome_unico
  ON public.estacoes_monta (fazenda_id, lower(btrim(nome))) WHERE deleted_at IS NULL;
CREATE INDEX idx_estacoes_monta_fazenda ON public.estacoes_monta (fazenda_id) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 3) Eventos reprodutivos
-- ----------------------------------------------------------------------------
CREATE TABLE public.eventos_reprodutivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  individuo_id uuid NOT NULL REFERENCES public.individuos(id) ON DELETE CASCADE,   -- a fêmea (gatilho valida)
  tipo text NOT NULL,
  data date NOT NULL,                                       -- data na fazenda, sem fuso
  estacao_id uuid REFERENCES public.estacoes_monta(id) ON DELETE SET NULL,
  -- cobertura / inseminação
  touro_nome text,                                          -- caminho principal: texto livre
  touro_id uuid REFERENCES public.individuos(id) ON DELETE SET NULL,   -- opcional: touro cadastrado
  semen_partida text,                                       -- só inseminação
  tecnico text,
  -- diagnóstico de gestação
  metodo_diagnostico text,
  resultado text,
  idade_gestacao_dias integer,
  evento_cobertura_id uuid REFERENCES public.eventos_reprodutivos(id) ON DELETE SET NULL,
  observacao text,
  responsavel text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT eventos_reprodutivos_tipo_check
    CHECK (tipo IN ('Cobertura', 'Inseminação', 'Diagnóstico de gestação', 'Aborto')),
  CONSTRAINT eventos_reprodutivos_metodo_check
    CHECK (metodo_diagnostico IS NULL OR metodo_diagnostico IN ('Palpação', 'Ultrassom', 'Outro')),
  CONSTRAINT eventos_reprodutivos_resultado_check
    CHECK (resultado IS NULL OR resultado IN ('Prenha', 'Vazia', 'Inconclusivo')),
  -- resultado existe se, e somente se, o evento é um diagnóstico
  CONSTRAINT eventos_reprodutivos_resultado_so_no_diagnostico
    CHECK ((tipo = 'Diagnóstico de gestação') = (resultado IS NOT NULL)),
  CONSTRAINT eventos_reprodutivos_metodo_so_no_diagnostico
    CHECK (metodo_diagnostico IS NULL OR tipo = 'Diagnóstico de gestação'),
  CONSTRAINT eventos_reprodutivos_idade_gestacao_check
    CHECK (idade_gestacao_dias IS NULL OR (tipo = 'Diagnóstico de gestação' AND resultado = 'Prenha'
                                           AND idade_gestacao_dias BETWEEN 0 AND 300)),
  CONSTRAINT eventos_reprodutivos_touro_so_na_cobertura
    CHECK ((touro_nome IS NULL AND touro_id IS NULL AND semen_partida IS NULL) OR tipo IN ('Cobertura', 'Inseminação')),
  CONSTRAINT eventos_reprodutivos_semen_so_na_inseminacao
    CHECK (semen_partida IS NULL OR tipo = 'Inseminação'),
  CONSTRAINT eventos_reprodutivos_cobertura_ref_check
    CHECK (evento_cobertura_id IS NULL OR tipo IN ('Diagnóstico de gestação', 'Aborto'))
);

CREATE INDEX idx_eventos_reprodutivos_individuo
  ON public.eventos_reprodutivos (individuo_id, data DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_eventos_reprodutivos_fazenda_estacao
  ON public.eventos_reprodutivos (fazenda_id, estacao_id) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 4) Integridade que as FKs não cobrem
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_eventos_reprodutivos_validar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_sexo text;
  v_faz uuid;
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_aux record;
BEGIN
  NEW.updated_at := now();

  -- Excluir (soft-delete) um evento nunca deve falhar por causa do estado atual do animal
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT i.sexo, i.fazenda_id INTO v_sexo, v_faz
  FROM public.individuos i
  WHERE i.id = NEW.individuo_id AND i.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Indivíduo não encontrado ou excluído' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_faz <> NEW.fazenda_id THEN
    RAISE EXCEPTION 'O indivíduo pertence a outra fazenda' USING ERRCODE = 'check_violation';
  END IF;
  IF v_sexo <> 'Fêmea' THEN
    RAISE EXCEPTION 'Evento reprodutivo só se aplica a fêmeas (indivíduo é %)', v_sexo USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.data > v_hoje THEN
    RAISE EXCEPTION 'A data do evento não pode ser futura' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.touro_id IS NOT NULL THEN
    SELECT i.sexo, i.fazenda_id INTO v_aux
    FROM public.individuos i WHERE i.id = NEW.touro_id AND i.deleted_at IS NULL;
    IF NOT FOUND OR v_aux.fazenda_id <> NEW.fazenda_id OR v_aux.sexo <> 'Macho' THEN
      RAISE EXCEPTION 'O touro deve ser um macho ativo da mesma fazenda' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.estacao_id IS NOT NULL THEN
    PERFORM 1 FROM public.estacoes_monta e
    WHERE e.id = NEW.estacao_id AND e.fazenda_id = NEW.fazenda_id AND e.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Estação de monta inválida para esta fazenda' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.evento_cobertura_id IS NOT NULL THEN
    SELECT e.individuo_id, e.fazenda_id, e.tipo, e.data INTO v_aux
    FROM public.eventos_reprodutivos e WHERE e.id = NEW.evento_cobertura_id AND e.deleted_at IS NULL;
    IF NOT FOUND OR v_aux.individuo_id <> NEW.individuo_id OR v_aux.fazenda_id <> NEW.fazenda_id
       OR v_aux.tipo NOT IN ('Cobertura', 'Inseminação') OR v_aux.data > NEW.data THEN
      RAISE EXCEPTION 'A cobertura referenciada deve ser da mesma fêmea, anterior ao evento' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trg_eventos_reprodutivos_validar() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_eventos_reprodutivos_validar
  BEFORE INSERT OR UPDATE ON public.eventos_reprodutivos
  FOR EACH ROW EXECUTE FUNCTION public.trg_eventos_reprodutivos_validar();

CREATE TRIGGER update_estacoes_monta_updated_at
  BEFORE UPDATE ON public.estacoes_monta
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_audit_estacoes_monta
  AFTER INSERT OR DELETE OR UPDATE ON public.estacoes_monta
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

CREATE TRIGGER trg_audit_eventos_reprodutivos
  AFTER INSERT OR DELETE OR UPDATE ON public.eventos_reprodutivos
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- ----------------------------------------------------------------------------
-- 5) RLS e privilégios (padrão Fases 5/B)
-- ----------------------------------------------------------------------------
ALTER TABLE public.estacoes_monta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_reprodutivos ENABLE ROW LEVEL SECURITY;

CREATE POLICY estacoes_monta_tenant ON public.estacoes_monta FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

CREATE POLICY eventos_reprodutivos_tenant ON public.eventos_reprodutivos FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

REVOKE ALL ON public.estacoes_monta, public.eventos_reprodutivos FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.estacoes_monta, public.eventos_reprodutivos FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estacoes_monta, public.eventos_reprodutivos TO authenticated;

-- ----------------------------------------------------------------------------
-- 6) Status reprodutivo derivado (uma linha por fêmea viva)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_status_reprodutivo
WITH (security_invoker = true) AS
WITH hoje AS (
  SELECT (now() AT TIME ZONE 'America/Cuiaba')::date AS d
),
partos AS (
  -- Partos da mãe biológica; aborto registrado na maternidade não conta como parto
  SELECT r.individuo_id_mae AS individuo_id,
         (r.data AT TIME ZONE 'America/Cuiaba')::date AS data,
         row_number() OVER (PARTITION BY r.individuo_id_mae ORDER BY r.data DESC) AS rn
  FROM public.registros_maternidade r
  WHERE r.deleted_at IS NULL
    AND r.individuo_id_mae IS NOT NULL
    AND NOT (COALESCE(r.tipo_parto, '[]'::jsonb) ? 'Aborto')
),
femeas AS (
  SELECT i.id AS individuo_id, i.fazenda_id, i.id_brinco, i.id_chip, i.id_manejo, i.categoria, i.lote_atual,
         (SELECT p.data FROM partos p WHERE p.individuo_id = i.id AND p.rn = 1) AS ultimo_parto,
         (SELECT p.data FROM partos p WHERE p.individuo_id = i.id AND p.rn = 2) AS parto_anterior,
         (SELECT max(e.data) FROM public.eventos_reprodutivos e
           WHERE e.individuo_id = i.id AND e.tipo = 'Aborto' AND e.deleted_at IS NULL) AS ultimo_aborto
  FROM public.individuos i
  WHERE i.deleted_at IS NULL AND i.sexo = 'Fêmea' AND i.status = 'Vivo'
),
base AS (
  -- GREATEST ignora NULL: o marco é o mais recente entre o último parto e o último aborto
  SELECT f.*, GREATEST(f.ultimo_parto, f.ultimo_aborto) AS marco FROM femeas f
),
calc AS (
  SELECT b.*,
         cob.id AS cob_id, cob.data AS cob_data, cob.tipo AS cob_tipo, cob.estacao_id AS cob_estacao_id,
         COALESCE(cob.touro_nome, t.id_brinco, t.id_manejo) AS cob_touro,
         dg.data AS dg_data, dg.resultado AS dg_resultado, dg.idade_gestacao_dias AS dg_idade
  FROM base b
  LEFT JOIN LATERAL (
    SELECT e.* FROM public.eventos_reprodutivos e
    WHERE e.individuo_id = b.individuo_id AND e.deleted_at IS NULL
      AND e.tipo IN ('Cobertura', 'Inseminação') AND (b.marco IS NULL OR e.data > b.marco)
    ORDER BY e.data DESC, e.created_at DESC LIMIT 1
  ) cob ON true
  LEFT JOIN public.individuos t ON t.id = cob.touro_id
  LEFT JOIN LATERAL (
    SELECT e.* FROM public.eventos_reprodutivos e
    WHERE e.individuo_id = b.individuo_id AND e.deleted_at IS NULL
      AND e.tipo = 'Diagnóstico de gestação' AND (b.marco IS NULL OR e.data > b.marco)
    ORDER BY e.data DESC, e.created_at DESC LIMIT 1
  ) dg ON true
),
s AS (
  SELECT c.*,
         CASE
           -- diagnóstico é o fato mais recente (ou não há cobertura depois dele)
           WHEN c.dg_data IS NOT NULL AND (c.cob_data IS NULL OR c.dg_data >= c.cob_data) THEN
             CASE c.dg_resultado
               WHEN 'Prenha' THEN 'Prenha'
               WHEN 'Vazia' THEN 'Vazia'
               ELSE CASE WHEN c.cob_data IS NOT NULL THEN 'Coberta' ELSE 'Sem registro' END
             END
           WHEN c.cob_data IS NOT NULL THEN 'Coberta'
           WHEN c.marco IS NOT NULL THEN CASE WHEN c.ultimo_aborto IS NOT DISTINCT FROM c.marco THEN 'Vazia' ELSE 'Parida' END
           ELSE 'Sem registro'
         END AS status_reprodutivo
  FROM calc c
)
SELECT
  s.individuo_id, s.fazenda_id, s.id_brinco, s.id_chip, s.id_manejo, s.categoria, s.lote_atual,
  s.status_reprodutivo,
  s.ultimo_parto,
  s.parto_anterior,
  (s.ultimo_parto - s.parto_anterior) AS intervalo_entre_partos_dias,
  (h.d - s.ultimo_parto) AS dias_desde_ultimo_parto,
  s.ultimo_aborto,
  s.cob_id AS ultima_cobertura_id,
  s.cob_data AS ultima_cobertura_data,
  s.cob_tipo AS ultima_cobertura_tipo,
  s.cob_touro AS ultima_cobertura_touro,
  s.cob_estacao_id AS ultima_cobertura_estacao_id,
  (h.d - s.cob_data) AS dias_desde_cobertura,
  s.dg_data AS ultimo_diagnostico_data,
  s.dg_resultado AS ultimo_diagnostico_resultado,
  CASE s.status_reprodutivo
    WHEN 'Prenha' THEN COALESCE(s.cob_data + public.gestacao_dias_padrao(), s.dg_data - s.dg_idade + public.gestacao_dias_padrao())
    WHEN 'Coberta' THEN s.cob_data + public.gestacao_dias_padrao()
  END AS previsao_parto,
  (s.status_reprodutivo = 'Prenha') AS previsao_confirmada
FROM s CROSS JOIN hoje h;

REVOKE ALL ON public.v_status_reprodutivo FROM anon;
GRANT SELECT ON public.v_status_reprodutivo TO authenticated;

COMMENT ON VIEW public.v_status_reprodutivo IS
  'Status reprodutivo derivado por fêmea viva (Prenha/Coberta/Vazia/Parida/Sem registro), previsão de parto (283 dias) e intervalos. Nada é digitado: vem de eventos_reprodutivos e registros_maternidade.';
