-- Consumo de confinamento por lote/dia (tabela derivada de registros_oferta_trato + registros_leitura_cocho).
--
-- Regras (decididas com o usuario):
--   * Granularidade: lote + dia (America/Cuiaba). Um lote pode ocupar mais de um curral no mesmo dia.
--   * Oferta do dia D = soma de kg_ofertado_real dos tratos do dia (por curral).
--   * A leitura de cocho e feita ANTES do 1o trato da manha: a leitura de D+1 descreve a sobra do que foi
--     ofertado em D. Por curral: consumo = ofertado * LEAST(1, 1 + percentual_ajuste/100), com o
--     percentual_ajuste ja cadastrado em notas_leitura_cocho_config. Sem leitura em D+1: consumo = ofertado
--     e o dia fica provisorio (leitura_confirmada = false).
--   * Notas <= 0 (lambido/limpo): o consumo e um piso (o animal pode ter comido mais). consumo_piso = true.
--   * Cabecas e peso do dia: calculate_quant_em + mesma logica de peso de recalcular_peso_vivo_lote
--     (sem categorias ao pe), com fallback quando o lote nao tem plano ativo.
--   * Recalculo idempotente por (lote, dia), disparado por triggers em registros_oferta_trato e
--     registros_leitura_cocho. Os triggers NUNCA derrubam o sync do PWA (excecao vira WARNING).
--   * Mudancas retroativas de cabecas/peso/formulacao nao disparam trigger: usar
--     recalc_consumo_confinamento_periodo().

CREATE TABLE IF NOT EXISTS public.consumo_confinamento_dia (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id            uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  lote_id               uuid NOT NULL REFERENCES public.lotes(id) ON DELETE CASCADE,
  data                  date NOT NULL,
  n_currais             integer NOT NULL,
  n_tratos              integer NOT NULL,
  kg_ofertado_mn        numeric(12,3) NOT NULL,
  kg_consumido_mn       numeric(12,3) NOT NULL,
  fator_consumo         numeric(7,4) NOT NULL,
  currais_com_leitura   integer NOT NULL DEFAULT 0,
  leitura_confirmada    boolean NOT NULL DEFAULT false,
  consumo_piso          boolean NOT NULL DEFAULT false,
  formulacao_id         uuid REFERENCES public.formulacoes(id) ON DELETE SET NULL,
  teor_ms_dieta         numeric,
  custo_mn_tonelada     numeric,
  n_cabecas             integer,
  peso_vivo_kg          numeric(10,2),
  kg_mn_cab_dia         numeric(10,4),
  kg_ms_cab_dia         numeric(10,4),
  consumo_percent_pv    numeric(8,4),
  custo_reais_cab_dia   numeric(10,4),
  fora_faixa_pv         boolean NOT NULL DEFAULT false,
  calculado_em          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_consumo_confinamento_dia UNIQUE (lote_id, data)
);

CREATE INDEX IF NOT EXISTS idx_consumo_confinamento_dia_fazenda_data
  ON public.consumo_confinamento_dia (fazenda_id, data);

ALTER TABLE public.consumo_confinamento_dia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consumo_confinamento_dia_select ON public.consumo_confinamento_dia;
CREATE POLICY consumo_confinamento_dia_select ON public.consumo_confinamento_dia
  FOR SELECT TO authenticated
  USING (fazenda_id IN (
    SELECT uf.fazenda_id
    FROM public.usuario_fazenda uf
    JOIN public.usuarios u ON u.id = uf.usuario_id
    WHERE u.auth_id = auth.uid() AND uf.ativo = true
  ));

GRANT SELECT ON public.consumo_confinamento_dia TO authenticated;

-- Lote que ocupava o curral na data (lote_curral_historico).
CREATE OR REPLACE FUNCTION public.fn_lote_do_curral_em(p_curral_id uuid, p_data date)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT lote_id
  FROM lote_curral_historico
  WHERE curral_id = p_curral_id
    AND data_inicial <= p_data
    AND (data_final IS NULL OR data_final >= p_data)
  ORDER BY data_inicial DESC
  LIMIT 1;
$$;

-- Cabecas e peso vivo medio do lote ao fim do dia p_data (sem categorias ao pe).
-- Peso por categoria segue recalcular_peso_vivo_lote (caminho sem ajuste manual); sem plano/GMD,
-- cai para o peso atual ou de inicio da categoria.
CREATE OR REPLACE FUNCTION public.calc_cabecas_peso_lote_em(p_lote_id uuid, p_data date)
RETURNS TABLE (n_cabecas integer, peso_vivo_kg numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $$
DECLARE
  v_plano_id uuid;
  v_data_inicio date;
  v_formulacao_id uuid;
  v_ate timestamptz;
  v_total_cab integer := 0;
  v_cab_com_peso integer := 0;
  v_total_peso numeric := 0;
  v_peso numeric;
  v_q integer;
  cat RECORD;
BEGIN
  SELECT id, data_inicio, formulacao_id
  INTO v_plano_id, v_data_inicio, v_formulacao_id
  FROM planos_nutricionais
  WHERE lote_id = p_lote_id AND ativo = true AND data_fim IS NULL
  LIMIT 1;

  v_ate := ((p_data + 1)::timestamp AT TIME ZONE 'America/Cuiaba');

  FOR cat IN
    SELECT lc.categoria,
           lc.peso_vivo_atual_kg_cab,
           lc.data_ajuste_peso,
           COALESCE(pcp.peso_inicio_kg_cab, lc.peso_entrada_kg_cab) AS peso_inicio_cat,
           fcg.gmd AS gmd_cat
    FROM lote_categorias lc
    LEFT JOIN plano_categoria_personalizacao pcp
      ON pcp.plano_id = v_plano_id AND pcp.lote_categoria_id = lc.id AND pcp.ativo = true
    LEFT JOIN formulacao_categorias_gmd fcg
      ON fcg.formulacao_id = v_formulacao_id
     AND LOWER(TRIM(fcg.categoria)) = LOWER(TRIM(lc.categoria))
    WHERE lc.lote_id = p_lote_id
      AND lc.ativo = true
      AND LOWER(unaccent(TRIM(lc.categoria))) NOT IN ('bezerro ao pe', 'bezerra ao pe')
  LOOP
    v_q := calculate_quant_em(p_lote_id, cat.categoria, v_ate);
    IF v_q IS NULL OR v_q <= 0 THEN
      CONTINUE;
    END IF;
    v_total_cab := v_total_cab + v_q;

    IF cat.data_ajuste_peso IS NOT NULL AND cat.peso_vivo_atual_kg_cab IS NOT NULL AND cat.gmd_cat IS NOT NULL THEN
      v_peso := cat.peso_vivo_atual_kg_cab + cat.gmd_cat * (p_data - CURRENT_DATE);
    ELSIF cat.peso_inicio_cat IS NOT NULL AND v_data_inicio IS NOT NULL AND cat.gmd_cat IS NOT NULL THEN
      v_peso := cat.peso_inicio_cat + cat.gmd_cat * GREATEST(p_data - v_data_inicio, 0);
    ELSE
      v_peso := COALESCE(cat.peso_vivo_atual_kg_cab, cat.peso_inicio_cat);
    END IF;

    IF v_peso IS NOT NULL AND v_peso > 0 THEN
      v_total_peso := v_total_peso + v_peso * v_q;
      v_cab_com_peso := v_cab_com_peso + v_q;
    END IF;
  END LOOP;

  RETURN QUERY SELECT
    v_total_cab,
    CASE WHEN v_cab_com_peso > 0 THEN ROUND(v_total_peso / v_cab_com_peso, 2) ELSE NULL END;
END;
$$;

-- Recalculo idempotente do consumo de um lote em um dia (dia da OFERTA).
CREATE OR REPLACE FUNCTION public.recalc_consumo_confinamento_dia(p_fazenda_id uuid, p_lote_id uuid, p_data date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $$
DECLARE
  v_n_currais integer;
  v_n_tratos integer;
  v_ofertado numeric;
  v_consumido numeric;
  v_com_leitura integer;
  v_piso boolean;
  v_form uuid;
  v_teor numeric;
  v_custo numeric;
  v_cab integer;
  v_peso numeric;
  v_mn numeric;
  v_ms numeric;
  v_pv numeric;
  v_custo_cab numeric;
BEGIN
  WITH ofertas AS (
    SELECT o.curral_id, SUM(o.kg_ofertado_real) AS kg, COUNT(*) AS n
    FROM registros_oferta_trato o
    WHERE o.fazenda_id = p_fazenda_id
      AND o.deleted_at IS NULL
      AND o.kg_ofertado_real IS NOT NULL
      AND (o.data AT TIME ZONE 'America/Cuiaba')::date = p_data
      AND COALESCE(o.lote_id, fn_lote_do_curral_em(o.curral_id, p_data)) = p_lote_id
    GROUP BY o.curral_id
  ),
  leit AS (
    SELECT DISTINCT ON (of.curral_id) of.curral_id, l.leitura_cocho, l.nota_config_id
    FROM ofertas of
    JOIN registros_leitura_cocho l
      ON l.fazenda_id = p_fazenda_id
     AND l.deleted_at IS NULL
     AND l.leitura_cocho IS NOT NULL
     AND (l.data AT TIME ZONE 'America/Cuiaba')::date = p_data + 1
     AND (l.curral_id = of.curral_id OR (l.curral_id IS NULL AND l.lote_id = p_lote_id))
    ORDER BY of.curral_id, (l.curral_id IS NOT NULL) DESC, l.created_at DESC
  ),
  ajuste AS (
    SELECT lt.curral_id, lt.leitura_cocho,
           COALESCE(c1.percentual_ajuste, c2.percentual_ajuste) AS pct
    FROM leit lt
    LEFT JOIN notas_leitura_cocho_config c1 ON c1.id = lt.nota_config_id
    LEFT JOIN notas_leitura_cocho_config c2
      ON c2.fazenda_id = p_fazenda_id AND c2.nota = lt.leitura_cocho
  )
  SELECT COUNT(*),
         SUM(of.n),
         SUM(of.kg),
         SUM(of.kg * COALESCE(LEAST(1, 1 + a.pct / 100), 1)),
         COUNT(a.pct),
         COALESCE(BOOL_OR(a.pct IS NOT NULL AND a.leitura_cocho <= 0), false)
  INTO v_n_currais, v_n_tratos, v_ofertado, v_consumido, v_com_leitura, v_piso
  FROM ofertas of
  LEFT JOIN ajuste a ON a.curral_id = of.curral_id;

  IF v_n_currais IS NULL OR v_n_currais = 0 OR v_ofertado IS NULL OR v_ofertado <= 0 THEN
    DELETE FROM consumo_confinamento_dia WHERE lote_id = p_lote_id AND data = p_data;
    RETURN;
  END IF;

  -- Dieta: fabrica do trato (maior volume) -> plano ativo do lote -> formulacao do lote.
  SELECT f.formulacao_id
  INTO v_form
  FROM registros_oferta_trato o
  JOIN registros_fabrica_confinamento f ON f.id = o.fabrica_confinamento_id
  WHERE o.fazenda_id = p_fazenda_id
    AND o.deleted_at IS NULL
    AND o.kg_ofertado_real IS NOT NULL
    AND (o.data AT TIME ZONE 'America/Cuiaba')::date = p_data
    AND COALESCE(o.lote_id, fn_lote_do_curral_em(o.curral_id, p_data)) = p_lote_id
    AND f.formulacao_id IS NOT NULL
  GROUP BY f.formulacao_id
  ORDER BY SUM(o.kg_ofertado_real) DESC
  LIMIT 1;

  IF v_form IS NULL THEN
    SELECT formulacao_id INTO v_form
    FROM planos_nutricionais
    WHERE lote_id = p_lote_id AND ativo = true AND data_fim IS NULL AND formulacao_id IS NOT NULL
    LIMIT 1;
  END IF;
  IF v_form IS NULL THEN
    SELECT formulacao_id INTO v_form FROM lotes WHERE id = p_lote_id;
  END IF;
  IF v_form IS NOT NULL THEN
    SELECT teor_ms_dieta, custo_mn_tonelada INTO v_teor, v_custo FROM formulacoes WHERE id = v_form;
  END IF;

  SELECT c.n_cabecas, c.peso_vivo_kg INTO v_cab, v_peso FROM calc_cabecas_peso_lote_em(p_lote_id, p_data) c;

  IF v_cab IS NOT NULL AND v_cab > 0 THEN
    v_mn := v_consumido / v_cab;
    IF v_teor IS NOT NULL AND v_teor > 0 THEN
      v_ms := v_mn * v_teor / 100;
      IF v_peso IS NOT NULL AND v_peso > 0 THEN
        v_pv := v_ms / v_peso * 100;
      END IF;
    END IF;
    IF v_custo IS NOT NULL THEN
      v_custo_cab := v_mn * v_custo / 1000;
    END IF;
  END IF;

  INSERT INTO consumo_confinamento_dia (
    fazenda_id, lote_id, data, n_currais, n_tratos, kg_ofertado_mn, kg_consumido_mn, fator_consumo,
    currais_com_leitura, leitura_confirmada, consumo_piso, formulacao_id, teor_ms_dieta, custo_mn_tonelada,
    n_cabecas, peso_vivo_kg, kg_mn_cab_dia, kg_ms_cab_dia, consumo_percent_pv, custo_reais_cab_dia,
    fora_faixa_pv, calculado_em
  ) VALUES (
    p_fazenda_id, p_lote_id, p_data, v_n_currais, v_n_tratos, v_ofertado, v_consumido,
    ROUND(v_consumido / v_ofertado, 4),
    v_com_leitura, (v_com_leitura = v_n_currais), v_piso, v_form, v_teor, v_custo,
    v_cab, v_peso, v_mn, v_ms, v_pv, v_custo_cab,
    (v_pv IS NOT NULL AND (v_pv < 2.0 OR v_pv > 3.5)), now()
  )
  ON CONFLICT (lote_id, data) DO UPDATE SET
    fazenda_id = EXCLUDED.fazenda_id,
    n_currais = EXCLUDED.n_currais,
    n_tratos = EXCLUDED.n_tratos,
    kg_ofertado_mn = EXCLUDED.kg_ofertado_mn,
    kg_consumido_mn = EXCLUDED.kg_consumido_mn,
    fator_consumo = EXCLUDED.fator_consumo,
    currais_com_leitura = EXCLUDED.currais_com_leitura,
    leitura_confirmada = EXCLUDED.leitura_confirmada,
    consumo_piso = EXCLUDED.consumo_piso,
    formulacao_id = EXCLUDED.formulacao_id,
    teor_ms_dieta = EXCLUDED.teor_ms_dieta,
    custo_mn_tonelada = EXCLUDED.custo_mn_tonelada,
    n_cabecas = EXCLUDED.n_cabecas,
    peso_vivo_kg = EXCLUDED.peso_vivo_kg,
    kg_mn_cab_dia = EXCLUDED.kg_mn_cab_dia,
    kg_ms_cab_dia = EXCLUDED.kg_ms_cab_dia,
    consumo_percent_pv = EXCLUDED.consumo_percent_pv,
    custo_reais_cab_dia = EXCLUDED.custo_reais_cab_dia,
    fora_faixa_pv = EXCLUDED.fora_faixa_pv,
    calculado_em = EXCLUDED.calculado_em;
END;
$$;

-- Recalculo em lote (backfill ou correcao retroativa de cabecas/peso/formulacao). Retorna dias recalculados.
CREATE OR REPLACE FUNCTION public.recalc_consumo_confinamento_periodo(p_fazenda_id uuid, p_ini date, p_fim date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $$
DECLARE
  r RECORD;
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT COALESCE(o.lote_id, fn_lote_do_curral_em(o.curral_id, (o.data AT TIME ZONE 'America/Cuiaba')::date)) AS lote_id,
           (o.data AT TIME ZONE 'America/Cuiaba')::date AS dia
    FROM registros_oferta_trato o
    WHERE o.fazenda_id = p_fazenda_id
      AND o.deleted_at IS NULL
      AND (o.data AT TIME ZONE 'America/Cuiaba')::date BETWEEN p_ini AND p_fim
  LOOP
    IF r.lote_id IS NOT NULL THEN
      PERFORM recalc_consumo_confinamento_dia(p_fazenda_id, r.lote_id, r.dia);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

-- Dispara o recalculo a partir de uma linha de oferta de trato.
CREATE OR REPLACE FUNCTION public.fn_recalc_consumo_por_oferta(p_fazenda_id uuid, p_curral_id uuid, p_lote_id uuid, p_data timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $$
DECLARE
  v_dia date := (p_data AT TIME ZONE 'America/Cuiaba')::date;
  v_lote uuid := COALESCE(p_lote_id, fn_lote_do_curral_em(p_curral_id, v_dia));
BEGIN
  IF v_lote IS NOT NULL THEN
    PERFORM recalc_consumo_confinamento_dia(p_fazenda_id, v_lote, v_dia);
  END IF;
END;
$$;

-- Dispara o recalculo a partir de uma leitura de cocho: ela fecha a oferta do dia anterior.
CREATE OR REPLACE FUNCTION public.fn_recalc_consumo_por_leitura(p_fazenda_id uuid, p_curral_id uuid, p_lote_id uuid, p_data timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $$
DECLARE
  v_dia date := (p_data AT TIME ZONE 'America/Cuiaba')::date - 1;
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT COALESCE(o.lote_id, fn_lote_do_curral_em(o.curral_id, v_dia)) AS lote_id
    FROM registros_oferta_trato o
    WHERE o.fazenda_id = p_fazenda_id
      AND o.deleted_at IS NULL
      AND (o.data AT TIME ZONE 'America/Cuiaba')::date = v_dia
      AND ((p_curral_id IS NOT NULL AND o.curral_id = p_curral_id)
        OR (p_lote_id IS NOT NULL AND o.lote_id = p_lote_id))
  LOOP
    IF r.lote_id IS NOT NULL THEN
      PERFORM recalc_consumo_confinamento_dia(p_fazenda_id, r.lote_id, v_dia);
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_consumo_confinamento_oferta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      PERFORM fn_recalc_consumo_por_oferta(OLD.fazenda_id, OLD.curral_id, OLD.lote_id, OLD.data);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      PERFORM fn_recalc_consumo_por_oferta(NEW.fazenda_id, NEW.curral_id, NEW.lote_id, NEW.data);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'consumo_confinamento (oferta): %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_consumo_confinamento_leitura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      PERFORM fn_recalc_consumo_por_leitura(OLD.fazenda_id, OLD.curral_id, OLD.lote_id, OLD.data);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      PERFORM fn_recalc_consumo_por_leitura(NEW.fazenda_id, NEW.curral_id, NEW.lote_id, NEW.data);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'consumo_confinamento (leitura): %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_consumo_confinamento_oferta ON public.registros_oferta_trato;
CREATE TRIGGER trg_consumo_confinamento_oferta
  AFTER INSERT OR UPDATE OR DELETE ON public.registros_oferta_trato
  FOR EACH ROW EXECUTE FUNCTION public.trg_consumo_confinamento_oferta();

DROP TRIGGER IF EXISTS trg_consumo_confinamento_leitura ON public.registros_leitura_cocho;
CREATE TRIGGER trg_consumo_confinamento_leitura
  AFTER INSERT OR UPDATE OR DELETE ON public.registros_leitura_cocho
  FOR EACH ROW EXECUTE FUNCTION public.trg_consumo_confinamento_leitura();

-- Funcoes SECURITY DEFINER nao devem ser chamaveis por RPC com fazenda arbitraria.
REVOKE EXECUTE ON FUNCTION public.calc_cabecas_peso_lote_em(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_consumo_confinamento_dia(uuid, uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_consumo_confinamento_periodo(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_recalc_consumo_por_oferta(uuid, uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_recalc_consumo_por_leitura(uuid, uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.consumo_confinamento_dia IS
  'Consumo diario de confinamento por lote (dia da oferta). Derivada de registros_oferta_trato + leitura de cocho de D+1. Nao editar manualmente.';
