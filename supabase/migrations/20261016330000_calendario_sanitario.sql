-- ============================================================================
-- Sanidade C1: calendário sanitário (programação de campanhas por fazenda) e pendências calculadas
-- ============================================================================
-- Hoje só se sabe a próxima dose DEPOIS da primeira aplicação (intervalo do catálogo). O calendário cobre o que o mercado
-- chama de campanha: "vacinar X nestas categorias todo ano em tal data", inclusive para quem nunca lançou a aplicação.
-- Aditivo: tabela nova + função de leitura. Não altera aplicações, contagem, peso nem movimentação; só avisa.
--   * calendario_sanitario: uma programação por linha. Ocorrências = data_base + k * periodo_meses (12 = anual, 6 = semestral...).
--     categorias vazio = todas as categorias do lote. antecedencia_dias abre a janela antes da data; prazo_dias é quanto a
--     campanha continua "atrasada" depois da data, antes de ser considerada encerrada.
--   * calendario_sanitario_pendencias(fazenda, em): para cada programação ativa, a ocorrência vigente e, por lote/categoria com
--     cabeças, quem ainda NÃO tem aplicação do produto (por lote, categoria vazia vale para todas) a partir do início da janela.
--     Situação: 'a_vencer' (dentro da antecedência) ou 'atrasada' (passou da data, dentro do prazo). Informa cabeças já aplicadas.
--     Limite conhecido: só conta aplicação por LOTE (aplicação individual não encerra a campanha do lote); cobertura parcial
--     aparece em cabecas_aplicadas, mas não reabre a pendência.
--   * Datas oficiais (aftosa, brucelose...) NÃO são embutidas: cada fazenda informa a sua data_base, conforme o órgão estadual.
--   * RLS padrão: is_admin_user() OR caller_has_fazenda_access(fazenda_id); sem acesso de anon. Função SECURITY INVOKER.
-- Rollback: supabase/rollbacks/20261016330000_calendario_sanitario_rollback.sql
-- ============================================================================

CREATE TABLE public.calendario_sanitario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  tipo text NOT NULL DEFAULT 'Vacinação',
  medicamento_id uuid REFERENCES public.medicamentos(id) ON DELETE SET NULL,
  produto_nome text NOT NULL CHECK (btrim(produto_nome) <> ''),      -- usado para achar as aplicações (por id ou por nome)
  categorias text[] NOT NULL DEFAULT '{}',                           -- vazio = todas as categorias do lote
  data_base date NOT NULL,                                           -- uma ocorrência de referência
  periodo_meses integer NOT NULL CHECK (periodo_meses BETWEEN 1 AND 60),
  antecedencia_dias integer NOT NULL DEFAULT 15 CHECK (antecedencia_dias BETWEEN 0 AND 120),
  prazo_dias integer NOT NULL DEFAULT 60 CHECK (prazo_dias BETWEEN 1 AND 365),
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT calendario_sanitario_tipo_check
    CHECK (tipo IN ('Vacinação', 'Vermifugação', 'Tratamento', 'Preventivo', 'Outro'))
);

CREATE UNIQUE INDEX calendario_sanitario_nome_unico
  ON public.calendario_sanitario (fazenda_id, lower(btrim(nome))) WHERE deleted_at IS NULL;
CREATE INDEX idx_calendario_sanitario_fazenda ON public.calendario_sanitario (fazenda_id) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.trg_calendario_sanitario_validar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fazenda uuid;
BEGIN
  IF NEW.medicamento_id IS NOT NULL THEN
    SELECT fazenda_id INTO v_fazenda FROM public.medicamentos WHERE id = NEW.medicamento_id;
    IF v_fazenda IS DISTINCT FROM NEW.fazenda_id THEN
      RAISE EXCEPTION 'O medicamento não pertence à fazenda da programação';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trg_calendario_sanitario_validar() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_calendario_sanitario_validar
  BEFORE INSERT OR UPDATE ON public.calendario_sanitario
  FOR EACH ROW EXECUTE FUNCTION public.trg_calendario_sanitario_validar();

CREATE TRIGGER trg_audit_calendario_sanitario
  AFTER INSERT OR DELETE OR UPDATE ON public.calendario_sanitario
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

ALTER TABLE public.calendario_sanitario ENABLE ROW LEVEL SECURITY;

CREATE POLICY calendario_sanitario_tenant ON public.calendario_sanitario FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

REVOKE ALL ON public.calendario_sanitario FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.calendario_sanitario FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendario_sanitario TO authenticated;

-- ----------------------------------------------------------------------------
-- Pendências do calendário (leitura; a RLS vale para quem chama)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calendario_sanitario_pendencias(p_fazenda_id uuid, p_em date DEFAULT NULL)
 RETURNS TABLE (
   programacao_id uuid, nome text, produto_nome text, lote_id uuid, lote_nome text, categoria text,
   quant_atual integer, ocorrencia date, situacao text, dias integer, cabecas_aplicadas integer
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
  WITH ref AS (SELECT COALESCE(p_em, (now() AT TIME ZONE 'America/Cuiaba')::date) AS d),
  prog AS (
    SELECT c.*, ref.d,
           -- última ocorrência (data_base + k períodos) cuja janela já abriu: ocorrência <= hoje + antecedência
           CASE WHEN c.data_base > ref.d + c.antecedencia_dias THEN NULL ELSE (
             SELECT max(k) FROM generate_series(
               0,
               ((extract(year FROM age(ref.d + c.antecedencia_dias, c.data_base)) * 12
                 + extract(month FROM age(ref.d + c.antecedencia_dias, c.data_base)))::int / c.periodo_meses)
             ) k
             WHERE (c.data_base + make_interval(months => k * c.periodo_meses))::date <= ref.d + c.antecedencia_dias
           ) END AS k
    FROM public.calendario_sanitario c CROSS JOIN ref
    WHERE c.fazenda_id = p_fazenda_id AND c.ativo AND c.deleted_at IS NULL
  ),
  oc AS (
    SELECT p.*, (p.data_base + make_interval(months => p.k * p.periodo_meses))::date AS ocorrencia
    FROM prog p WHERE p.k IS NOT NULL
  ),
  alvo AS (
    SELECT o.*, l.id AS l_id, l.nome AS l_nome, lc.categoria AS l_categoria, lc.quant_atual AS l_quant
    FROM oc o
    JOIN public.lotes l ON l.fazenda_id = o.fazenda_id AND l.deleted_at IS NULL AND COALESCE(l.ativo, true)
    JOIN public.lote_categorias lc ON lc.lote_id = l.id AND COALESCE(lc.ativo, true) AND lc.quant_atual > 0
    WHERE o.d <= o.ocorrencia + o.prazo_dias
      AND (cardinality(o.categorias) = 0
           OR lower(btrim(lc.categoria)) IN (SELECT lower(btrim(x)) FROM unnest(o.categorias) AS x))
  ),
  feito AS (
    SELECT al.*, f.n AS n_aplicacoes, f.cabecas
    FROM alvo al
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS n, COALESCE(sum(a.numero_cabecas), 0)::int AS cabecas
      FROM public.aplicacoes_sanitarias a
      WHERE a.fazenda_id = al.fazenda_id AND a.deleted_at IS NULL
        AND a.individuo_id IS NULL AND a.lote_id = al.l_id
        AND (a.categoria IS NULL OR lower(btrim(a.categoria)) = lower(btrim(al.l_categoria)))
        AND a.data >= al.ocorrencia - al.antecedencia_dias
        AND (a.medicamento_id = al.medicamento_id OR lower(btrim(a.medicamento_nome)) = lower(btrim(al.produto_nome)))
    ) f
  )
  SELECT fe.id, fe.nome, fe.produto_nome, fe.l_id, fe.l_nome, fe.l_categoria, fe.l_quant, fe.ocorrencia,
         CASE WHEN fe.d > fe.ocorrencia THEN 'atrasada' ELSE 'a_vencer' END,
         (fe.ocorrencia - fe.d)::int,
         fe.cabecas
  FROM feito fe
  WHERE fe.n_aplicacoes = 0
  ORDER BY fe.ocorrencia, fe.nome, fe.l_nome, fe.l_categoria;
$function$;

REVOKE EXECUTE ON FUNCTION public.calendario_sanitario_pendencias(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calendario_sanitario_pendencias(uuid, date) TO authenticated, service_role;
