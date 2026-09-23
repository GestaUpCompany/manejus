-- ============================================================================
-- CREEP FEEDING — suplementação separada para bezerro(a) ao pé
-- ============================================================================
-- Modelo: bezerro(a) ao pé é tratado como um "lote separado" dentro do lote,
-- com cocho próprio, formulação própria (creep) e dados de consumo próprios.
--
-- Decisões de modelagem:
-- 1. formulacoes.e_creep marca formulações exclusivas de creep feeding. Elas
--    só aceitam as categorias bezerro(a) ao pé em formulacao_categorias_gmd e
--    nunca entram em planos nutricionais.
-- 2. A dieta creep vigente do bezerro fica em lote_categorias.formulacao_id.
--    As RPCs de plano (iniciar/encerrar/migrar_plano_lote) já excluem essas
--    categorias dos updates, então a coluna está livre para esse uso. O
--    relatório de consumo já resolve dieta via COALESCE(lc.formulacao_id, ...).
-- 3. registros_suplementacao ganha escopo ('lote' | 'creep'). Uma operação de
--    trato que cobre adultos + bezerros grava 1 linha por alvo; as duas linhas
--    compartilham grupo_operacao (= local_id raiz do registro PWA). O PWA usa
--    local_id derivado ("<id>" e "<id>:creep") para manter idempotência.
-- 4. Na linha 'creep': n_cabecas = nº de bezerros, qtd_bezerros = 0, de modo
--    que o denominador existente (n_cabecas - qtd_bezerros) já produz o nº de
--    bezerros. Na linha 'lote' os campos seguem como hoje (n_cabecas total,
--    qtd_bezerros = nº de bezerros → denominador = adultos).
-- 5. kg_deposito vai em apenas UMA linha da operação (a linha 'lote'; ou a
--    'creep' quando o lançamento for só creep) — trg_suplementacao_mov debita
--    kg_cocho + kg_deposito do estoque e duplicar inflaria o consumo.
-- ============================================================================

-- ============================================================================
-- 1. Colunas novas
-- ============================================================================

ALTER TABLE public.formulacoes
  ADD COLUMN IF NOT EXISTS e_creep boolean NOT NULL DEFAULT false;

ALTER TABLE public.registros_suplementacao
  ADD COLUMN IF NOT EXISTS escopo text NOT NULL DEFAULT 'lote'
    CONSTRAINT registros_suplementacao_escopo_check CHECK (escopo IN ('lote', 'creep')),
  ADD COLUMN IF NOT EXISTS grupo_operacao text;

CREATE INDEX IF NOT EXISTS idx_registros_suplementacao_lote_escopo
  ON public.registros_suplementacao(lote_id, escopo)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- 2. Guards de integridade
-- ============================================================================

-- 2.1. formulacao_categorias_gmd: formulação creep só aceita bezerro(a) ao pé;
--      formulação normal nunca aceita bezerro(a) ao pé.
CREATE OR REPLACE FUNCTION public.fn_valida_creep_categoria_gmd()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_e_creep boolean;
  v_cat text;
BEGIN
  SELECT f.e_creep INTO v_e_creep
  FROM public.formulacoes f WHERE f.id = NEW.formulacao_id;

  v_cat := lower(unaccent(trim(NEW.categoria)));
  IF v_e_creep THEN
    IF v_cat NOT IN ('bezerro ao pe', 'bezerra ao pe') THEN
      RAISE EXCEPTION 'Formulação creep só aceita as categorias bezerro ao pé e bezerra ao pé (recebido: %)', NEW.categoria;
    END IF;
  ELSE
    IF v_cat IN ('bezerro ao pe', 'bezerra ao pe') THEN
      RAISE EXCEPTION 'Categorias bezerro(a) ao pé só podem receber GMD em formulações creep (e_creep = true)';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_valida_creep_categoria_gmd ON public.formulacao_categorias_gmd;
CREATE TRIGGER trg_valida_creep_categoria_gmd
  BEFORE INSERT OR UPDATE ON public.formulacao_categorias_gmd
  FOR EACH ROW EXECUTE FUNCTION public.fn_valida_creep_categoria_gmd();

-- 2.2. planos_nutricionais nunca apontam para formulação creep.
CREATE OR REPLACE FUNCTION public.fn_valida_plano_nao_creep()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.formulacao_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.formulacoes f WHERE f.id = NEW.formulacao_id AND f.e_creep
  ) THEN
    RAISE EXCEPTION 'Formulação creep não pode ser usada em plano nutricional. Vincule-a diretamente à categoria bezerro(a) ao pé no lote.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_valida_plano_nao_creep ON public.planos_nutricionais;
CREATE TRIGGER trg_valida_plano_nao_creep
  BEFORE INSERT OR UPDATE ON public.planos_nutricionais
  FOR EACH ROW EXECUTE FUNCTION public.fn_valida_plano_nao_creep();

-- 2.3. Integridade categoria × formulação em lote_categorias (defensiva, mesmo
--      padrão de enforce_lote_formulacao_vigente):
--      - categoria ao pé com formulação não-creep → limpa (dieta é creep)
--      - categoria não-ao-pé com creep → aponta para a formulação do lote
--      - ao pé com creep atribuída/trocada → materializa GMD da formulação
--        (cobre atribuição via Lotes.tsx e recategorização bezerro↔bezerra,
--        que resolve GMD contra a formulação do lote e retornaria NULL)
--      - ao pé sem GMD após write → aplica o default (0.600 / 0.500), estendendo
--        fn_set_gmd_bezerro_ao_pe (que só cobre INSERT) às recategorizações
CREATE OR REPLACE FUNCTION public.fn_lote_categoria_creep_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_calf boolean;
  v_e_creep boolean;
  v_gmd numeric;
  v_cat text;
BEGIN
  v_cat := lower(unaccent(trim(NEW.categoria)));
  v_is_calf := v_cat IN ('bezerro ao pe', 'bezerra ao pe');

  IF NEW.formulacao_id IS NOT NULL THEN
    SELECT f.e_creep INTO v_e_creep
    FROM public.formulacoes f WHERE f.id = NEW.formulacao_id;

    IF NOT FOUND THEN
      NEW.formulacao_id := NULL;
    ELSIF v_is_calf AND NOT v_e_creep THEN
      NEW.formulacao_id := NULL;
      NEW.estrategia_nutricional := NULL;
    ELSIF NOT v_is_calf AND v_e_creep THEN
      SELECT l.formulacao_id INTO NEW.formulacao_id
      FROM public.lotes l WHERE l.id = NEW.lote_id;
    END IF;
  END IF;

  -- Categoria ao pé com creep vigente: materializa GMD da formulação quando a
  -- formulação ou a categoria mudou (INSERT não tem OLD).
  IF v_is_calf AND NEW.formulacao_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.formulacao_id IS DISTINCT FROM OLD.formulacao_id
          OR NEW.categoria IS DISTINCT FROM OLD.categoria) THEN
    SELECT fcg.gmd INTO v_gmd
    FROM public.formulacao_categorias_gmd fcg
    WHERE fcg.formulacao_id = NEW.formulacao_id
      AND LOWER(TRIM(fcg.categoria)) = LOWER(TRIM(NEW.categoria))
    LIMIT 1;
    IF v_gmd IS NOT NULL THEN
      NEW.gmd := v_gmd::text;
      SELECT f.nome INTO NEW.estrategia_nutricional
      FROM public.formulacoes f WHERE f.id = NEW.formulacao_id;
    ELSIF TG_OP = 'UPDATE' THEN
      -- formulação creep não cobre a categoria nova: mantém o GMD anterior
      -- (a escrita explícita de quem recategorizou resolveu contra a
      -- formulação do lote e produziria NULL)
      NEW.gmd := OLD.gmd;
    END IF;
  END IF;

  -- Fallback de GMD padrão para ao pé sem GMD (recategorização para ao pé,
  -- creep sem linha de GMD para a categoria, etc.)
  IF v_is_calf AND NEW.gmd IS NULL THEN
    NEW.gmd := CASE
      WHEN v_cat = 'bezerro ao pe' THEN '0.600'
      ELSE '0.500'
    END;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_lote_categoria_creep_integrity ON public.lote_categorias;
CREATE TRIGGER trg_lote_categoria_creep_integrity
  BEFORE INSERT OR UPDATE ON public.lote_categorias
  FOR EACH ROW EXECUTE FUNCTION public.fn_lote_categoria_creep_integrity();

-- 2.4. Propagação de GMD creep: repropagar_gmd_para_lotes (trigger em
--      formulacao_categorias_gmd) só alcançava lotes via lotes.formulacao_id,
--      que nunca aponta para creep (enforce_lote_formulacao_vigente + planos).
--      Ramo adicional propaga via lote_categorias.formulacao_id direto.
--      Sem desconto de enfermaria: GMD do bezerro ao pé é próprio (política Z7).
CREATE OR REPLACE FUNCTION public.repropagar_gmd_para_lotes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  v_form_id uuid;
BEGIN
  v_form_id := COALESCE(NEW.formulacao_id, OLD.formulacao_id);

  IF v_form_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Seta GMD aplicando 50% se o lote for enfermaria
  UPDATE public.lote_categorias lc
    SET gmd = CASE
      WHEN l.destino = 'enfermaria' THEN (fcg.gmd * 0.5)::text
      ELSE fcg.gmd::text
    END
    FROM public.formulacao_categorias_gmd fcg, public.lotes l
    WHERE lc.ativo = true
      AND lc.data_fim IS NULL
      AND fcg.formulacao_id = v_form_id
      AND l.id = lc.lote_id
      AND l.formulacao_id = v_form_id
      AND LOWER(TRIM(lc.categoria)) = LOWER(TRIM(fcg.categoria));

  -- Creep: propagação direta para categorias vinculadas à formulação
  -- (categoria ao pé aponta para a creep via lc.formulacao_id, sem plano)
  IF TG_OP <> 'DELETE' THEN
    UPDATE public.lote_categorias lc
      SET gmd = fcg.gmd::text
      FROM public.formulacao_categorias_gmd fcg
      WHERE lc.ativo = true
        AND lc.data_fim IS NULL
        AND lc.formulacao_id = v_form_id
        AND fcg.formulacao_id = v_form_id
        AND LOWER(TRIM(lc.categoria)) = LOWER(TRIM(fcg.categoria))
        AND LOWER(unaccent(lc.categoria)) IN ('bezerro ao pe', 'bezerra ao pe');
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE public.lote_categorias lc
      SET gmd = NULL
      WHERE lc.ativo = true
        AND lc.data_fim IS NULL
        AND LOWER(TRIM(lc.categoria)) = LOWER(TRIM(OLD.categoria))
        AND EXISTS (
          SELECT 1 FROM public.lotes l
          WHERE l.id = lc.lote_id
            AND l.formulacao_id = v_form_id
        )
        AND LOWER(unaccent(lc.categoria)) NOT ILIKE 'bezerro ao pe'
        AND LOWER(unaccent(lc.categoria)) NOT ILIKE 'bezerra ao pe';

    -- Creep: categoria ao pé vinculada à formulação perde o GMD removido
    UPDATE public.lote_categorias lc
      SET gmd = NULL
      WHERE lc.ativo = true
        AND lc.data_fim IS NULL
        AND lc.formulacao_id = OLD.formulacao_id
        AND LOWER(TRIM(lc.categoria)) = LOWER(TRIM(OLD.categoria))
        AND LOWER(unaccent(lc.categoria)) IN ('bezerro ao pe', 'bezerra ao pe');
  END IF;

  RETURN NULL;
END;
$func$;

-- ============================================================================
-- 3. Funções de cálculo conscientes de escopo
-- ============================================================================

-- 3.1. calcular_consumo_registro_anterior (trigger AFTER INSERT)
--      Mesma lógica da versão 20260806130000, + filtro de escopo no lookup do
--      registro anterior (série por lote + formulação + escopo).
CREATE OR REPLACE FUNCTION public.calcular_consumo_registro_anterior()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET timezone TO 'America/Cuiaba'
AS $function$
DECLARE
  v_prev RECORD;
  v_dias INTEGER;
  v_animais_elegiveis INTEGER;
  v_consumo_kg_mn NUMERIC;
  v_consumo_kg_ms NUMERIC;
  v_consumo_pct_pv NUMERIC;
  v_custo_medio NUMERIC;
  v_teor_ms NUMERIC;
  v_custo_mn_tonelada NUMERIC;
BEGIN
  -- So calcula se o novo registro tem lote_id e formulacao
  IF NEW.lote_id IS NULL OR NEW.formulacao IS NULL THEN
    RETURN NEW;
  END IF;

  -- Buscar o registro anterior do mesmo lote+formulacao+escopo (data imediatamente antes de NEW)
  SELECT id, data, kg_cocho, n_cabecas, qtd_bezerros, peso_vivo_kg, formulacao
  INTO v_prev
  FROM registros_suplementacao
  WHERE lote_id = NEW.lote_id
    AND formulacao = NEW.formulacao
    AND escopo = NEW.escopo
    AND deleted_at IS NULL
    AND id != NEW.id
    AND data <= NEW.data
  ORDER BY data DESC
  LIMIT 1;

  -- Se nao ha registro anterior, nada a calcular
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Se o registro anterior nao tem kg_cocho, pular
  IF v_prev.kg_cocho IS NULL OR v_prev.kg_cocho = 0 THEN
    RETURN NEW;
  END IF;

  -- Animais elegiveis = n_cabecas - bezerros (na linha creep, n_cabecas já é o
  -- nº de bezerros e qtd_bezerros = 0, então a fórmula vale para os dois escopos)
  v_animais_elegiveis := COALESCE(v_prev.n_cabecas, 0) - COALESCE(v_prev.qtd_bezerros, 0);
  IF v_animais_elegiveis <= 0 THEN
    RETURN NEW;
  END IF;

  -- Intervalo em dias (minimo 1 para evitar divisao por zero)
  v_dias := GREATEST(
    ((NEW.data AT TIME ZONE 'America/Cuiaba')::date - (v_prev.data AT TIME ZONE 'America/Cuiaba')::date),
    1
  );

  v_consumo_kg_mn := v_prev.kg_cocho / v_dias / v_animais_elegiveis;

  SELECT f.teor_ms_dieta, f.custo_mn_tonelada
  INTO v_teor_ms, v_custo_mn_tonelada
  FROM formulacoes f
  WHERE f.fazenda_id = NEW.fazenda_id
    AND f.nome = v_prev.formulacao
    AND f.ativo = true
  LIMIT 1;

  IF v_teor_ms IS NOT NULL AND v_teor_ms > 0 THEN
    v_consumo_kg_ms := v_consumo_kg_mn * (v_teor_ms / 100);
  ELSE
    v_consumo_kg_ms := NULL;
  END IF;

  IF v_consumo_kg_ms IS NOT NULL AND v_prev.peso_vivo_kg IS NOT NULL AND v_prev.peso_vivo_kg > 0 THEN
    v_consumo_pct_pv := (v_consumo_kg_ms / v_prev.peso_vivo_kg) * 100;
  ELSE
    v_consumo_pct_pv := NULL;
  END IF;

  IF v_custo_mn_tonelada IS NOT NULL AND v_consumo_kg_mn IS NOT NULL THEN
    v_custo_medio := (v_custo_mn_tonelada * v_consumo_kg_mn) / 1000;
  ELSE
    v_custo_medio := NULL;
  END IF;

  UPDATE registros_suplementacao
  SET
    consumo_medio_geral_kg_mn = v_consumo_kg_mn,
    consumo_medio_30dias_kg_mn = v_consumo_kg_mn,
    consumo_medio_geral_kg_ms = v_consumo_kg_ms,
    consumo_medio_30dias_kg_ms = v_consumo_kg_ms,
    consumo_medio_geral_percent_pv = v_consumo_pct_pv,
    consumo_medio_30dias_percent_pv = v_consumo_pct_pv,
    custo_medio_reais_cab_dia = v_custo_medio,
    updated_at = NOW()
  WHERE id = v_prev.id;

  RETURN NEW;
END;
$function$;

-- 3.2. recalc_consumo_on_cabecas_update (trigger AFTER UPDATE)
--      Mesma lógica da versão 20260817153557, + filtro de escopo nos lookups.
CREATE OR REPLACE FUNCTION public.recalc_consumo_on_cabecas_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_prox RECORD;
  v_prev RECORD;
  v_dias INTEGER;
  v_animais_elegiveis INTEGER;
  v_consumo_kg_mn NUMERIC;
  v_consumo_kg_ms NUMERIC;
  v_consumo_pct_pv NUMERIC;
  v_custo_medio NUMERIC;
  v_teor_ms NUMERIC;
  v_custo_mn_tonelada NUMERIC;
  v_mudou_cabecas BOOLEAN;
BEGIN
  v_mudou_cabecas := NEW.n_cabecas IS DISTINCT FROM OLD.n_cabecas
     OR NEW.qtd_bezerros IS DISTINCT FROM OLD.qtd_bezerros
     OR NEW.peso_vivo_kg IS DISTINCT FROM OLD.peso_vivo_kg;

  IF NOT v_mudou_cabecas
     AND NEW.kg_cocho IS NOT DISTINCT FROM OLD.kg_cocho THEN
    RETURN NEW;
  END IF;

  IF NEW.lote_id IS NULL OR NEW.formulacao IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1. Recalcular consumo do próprio registro (NEW)
  SELECT id, data INTO v_prox
  FROM registros_suplementacao
  WHERE lote_id = NEW.lote_id
    AND formulacao = NEW.formulacao
    AND escopo = NEW.escopo
    AND deleted_at IS NULL
    AND id != NEW.id
    AND data > NEW.data
  ORDER BY data ASC, created_at ASC
  LIMIT 1;

  IF FOUND AND NEW.kg_cocho IS NOT NULL AND NEW.kg_cocho > 0 THEN
    v_animais_elegiveis := COALESCE(NEW.n_cabecas, 0) - COALESCE(NEW.qtd_bezerros, 0);

    IF v_animais_elegiveis > 0 THEN
      v_dias := GREATEST(
        ((v_prox.data AT TIME ZONE 'America/Cuiaba')::date - (NEW.data AT TIME ZONE 'America/Cuiaba')::date),
        1
      );

      v_consumo_kg_mn := NEW.kg_cocho / v_dias / v_animais_elegiveis;

      SELECT f.teor_ms_dieta, f.custo_mn_tonelada
      INTO v_teor_ms, v_custo_mn_tonelada
      FROM formulacoes f
      WHERE f.fazenda_id = NEW.fazenda_id
        AND f.nome = NEW.formulacao
        AND f.ativo = true
      LIMIT 1;

      IF v_teor_ms IS NOT NULL AND v_teor_ms > 0 THEN
        v_consumo_kg_ms := v_consumo_kg_mn * (v_teor_ms / 100);
      ELSE
        v_consumo_kg_ms := NULL;
      END IF;

      IF v_consumo_kg_ms IS NOT NULL AND NEW.peso_vivo_kg IS NOT NULL AND NEW.peso_vivo_kg > 0 THEN
        v_consumo_pct_pv := (v_consumo_kg_ms / NEW.peso_vivo_kg) * 100;
      ELSE
        v_consumo_pct_pv := NULL;
      END IF;

      IF v_custo_mn_tonelada IS NOT NULL AND v_consumo_kg_mn IS NOT NULL THEN
        v_custo_medio := (v_custo_mn_tonelada * v_consumo_kg_mn) / 1000;
      ELSE
        v_custo_medio := NULL;
      END IF;

      UPDATE registros_suplementacao
      SET
        consumo_medio_geral_kg_mn = v_consumo_kg_mn,
        consumo_medio_30dias_kg_mn = v_consumo_kg_mn,
        consumo_medio_geral_kg_ms = v_consumo_kg_ms,
        consumo_medio_30dias_kg_ms = v_consumo_kg_ms,
        consumo_medio_geral_percent_pv = v_consumo_pct_pv,
        consumo_medio_30dias_percent_pv = v_consumo_pct_pv,
        custo_medio_reais_cab_dia = v_custo_medio,
        updated_at = NOW()
      WHERE id = NEW.id;
    END IF;
  END IF;

  -- 2. Recalcular consumo do registro anterior da MESMA série (lote+formulacao+escopo)
  IF v_mudou_cabecas THEN
    SELECT id, data, kg_cocho, n_cabecas, qtd_bezerros, peso_vivo_kg, formulacao
    INTO v_prev
    FROM registros_suplementacao
    WHERE lote_id = NEW.lote_id
      AND formulacao = NEW.formulacao
      AND escopo = NEW.escopo
      AND deleted_at IS NULL
      AND id != NEW.id
      AND data <= NEW.data
    ORDER BY data DESC, created_at DESC
    LIMIT 1;

    IF FOUND AND v_prev.kg_cocho IS NOT NULL AND v_prev.kg_cocho > 0 THEN
      v_animais_elegiveis := COALESCE(v_prev.n_cabecas, 0) - COALESCE(v_prev.qtd_bezerros, 0);

      IF v_animais_elegiveis > 0 THEN
        v_dias := GREATEST(
          ((NEW.data AT TIME ZONE 'America/Cuiaba')::date - (v_prev.data AT TIME ZONE 'America/Cuiaba')::date),
          1
        );

        v_consumo_kg_mn := v_prev.kg_cocho / v_dias / v_animais_elegiveis;

        SELECT f.teor_ms_dieta, f.custo_mn_tonelada
        INTO v_teor_ms, v_custo_mn_tonelada
        FROM formulacoes f
        WHERE f.fazenda_id = NEW.fazenda_id
          AND f.nome = v_prev.formulacao
          AND f.ativo = true
        LIMIT 1;

        IF v_teor_ms IS NOT NULL AND v_teor_ms > 0 THEN
          v_consumo_kg_ms := v_consumo_kg_mn * (v_teor_ms / 100);
        ELSE
          v_consumo_kg_ms := NULL;
        END IF;

        IF v_consumo_kg_ms IS NOT NULL AND v_prev.peso_vivo_kg IS NOT NULL AND v_prev.peso_vivo_kg > 0 THEN
          v_consumo_pct_pv := (v_consumo_kg_ms / v_prev.peso_vivo_kg) * 100;
        ELSE
          v_consumo_pct_pv := NULL;
        END IF;

        IF v_custo_mn_tonelada IS NOT NULL AND v_consumo_kg_mn IS NOT NULL THEN
          v_custo_medio := (v_custo_mn_tonelada * v_consumo_kg_mn) / 1000;
        ELSE
          v_custo_medio := NULL;
        END IF;

        UPDATE registros_suplementacao
        SET
          consumo_medio_geral_kg_mn = v_consumo_kg_mn,
          consumo_medio_30dias_kg_mn = v_consumo_kg_mn,
          consumo_medio_geral_kg_ms = v_consumo_kg_ms,
          consumo_medio_30dias_kg_ms = v_consumo_kg_ms,
          consumo_medio_geral_percent_pv = v_consumo_pct_pv,
          consumo_medio_30dias_percent_pv = v_consumo_pct_pv,
          custo_medio_reais_cab_dia = v_custo_medio,
          updated_at = NOW()
        WHERE id = v_prev.id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3.3. recalcular_peso_vivo_lote — escopo-aware
--      escopo 'lote': média ponderada SEM categorias bezerro(a) ao pé (elas são
--      suplementadas separadamente via creep).
--      escopo 'creep': média ponderada SÓ das categorias ao pé, usando lc.gmd
--      próprio (o cron update_dados_lotes já evolui peso_vivo_atual_kg_cab
--      diariamente por esse GMD). Bezerros não têm plano nutricional, então a
--      projeção ancora em peso_vivo_atual_kg_cab + gmd * (data_reg - hoje),
--      ou em data_ajuste_peso quando p_ajuste_manual (espelha a branch de
--      ajuste da versão anterior).
CREATE OR REPLACE FUNCTION public.recalcular_peso_vivo_lote(
  p_lote_id uuid,
  p_ajuste_manual boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_plano_id uuid;
  v_data_inicio date;
  v_formulacao_id uuid;
  v_tem_plano boolean;
  reg RECORD;
  cat RECORD;
  v_total_peso numeric;
  v_total_cabecas integer;
  v_cat_peso numeric;
  v_dias integer;
  v_peso_ponderado numeric;
BEGIN
  SELECT id, data_inicio, formulacao_id
  INTO v_plano_id, v_data_inicio, v_formulacao_id
  FROM planos_nutricionais
  WHERE lote_id = p_lote_id
    AND ativo = true
    AND data_fim IS NULL
  LIMIT 1;

  v_tem_plano := FOUND;

  FOR reg IN
    SELECT id, (data AT TIME ZONE 'America/Cuiaba')::date AS data_reg, escopo
    FROM registros_suplementacao
    WHERE lote_id = p_lote_id
      AND deleted_at IS NULL
  LOOP
    v_total_peso := 0;
    v_total_cabecas := 0;

    IF reg.escopo = 'creep' THEN
      -- Média ponderada das categorias bezerro(a) ao pé (GMD próprio em lc.gmd)
      FOR cat IN
        SELECT lc.quant_atual, lc.peso_vivo_atual_kg_cab, lc.data_ajuste_peso,
               NULLIF(lc.gmd, '')::numeric AS gmd_cat
        FROM lote_categorias lc
        WHERE lc.lote_id = p_lote_id
          AND lc.ativo = true
          AND lc.data_fim IS NULL
          AND lc.quant_atual > 0
          AND lower(unaccent(trim(lc.categoria))) IN ('bezerro ao pe', 'bezerra ao pe')
      LOOP
        IF cat.peso_vivo_atual_kg_cab IS NULL THEN
          CONTINUE;
        END IF;
        IF cat.gmd_cat IS NOT NULL THEN
          IF p_ajuste_manual AND cat.data_ajuste_peso IS NOT NULL THEN
            v_dias := (reg.data_reg - cat.data_ajuste_peso)::integer;
          ELSE
            v_dias := (reg.data_reg - CURRENT_DATE)::integer;
          END IF;
          v_cat_peso := cat.peso_vivo_atual_kg_cab + cat.gmd_cat * v_dias;
        ELSE
          v_cat_peso := cat.peso_vivo_atual_kg_cab;
        END IF;
        v_total_peso := v_total_peso + (v_cat_peso * cat.quant_atual);
        v_total_cabecas := v_total_cabecas + cat.quant_atual;
      END LOOP;
    ELSE
      -- escopo 'lote': exige plano ativo (comportamento anterior)
      IF NOT v_tem_plano THEN
        CONTINUE;
      END IF;

      FOR cat IN
        SELECT
          lc.id,
          lc.categoria,
          lc.quant_atual,
          lc.peso_vivo_atual_kg_cab,
          lc.data_ajuste_peso,
          COALESCE(pcp.peso_inicio_kg_cab, lc.peso_entrada_kg_cab) AS peso_inicio_cat,
          fcg.gmd AS gmd_cat
        FROM lote_categorias lc
        LEFT JOIN plano_categoria_personalizacao pcp
          ON pcp.plano_id = v_plano_id
          AND pcp.lote_categoria_id = lc.id
          AND pcp.ativo = true
        LEFT JOIN formulacao_categorias_gmd fcg
          ON fcg.formulacao_id = v_formulacao_id
          AND LOWER(TRIM(fcg.categoria)) = LOWER(TRIM(lc.categoria))
        WHERE lc.lote_id = p_lote_id
          AND lc.ativo = true
          AND lc.data_fim IS NULL
          AND lc.quant_atual > 0
          AND lower(unaccent(trim(lc.categoria))) NOT IN ('bezerro ao pe', 'bezerra ao pe')
      LOOP
        IF cat.data_ajuste_peso IS NOT NULL AND cat.peso_vivo_atual_kg_cab IS NOT NULL AND cat.gmd_cat IS NOT NULL THEN
          IF p_ajuste_manual THEN
            v_dias := (reg.data_reg - cat.data_ajuste_peso)::integer;
          ELSE
            v_dias := (reg.data_reg - CURRENT_DATE)::integer;
          END IF;
          v_cat_peso := cat.peso_vivo_atual_kg_cab + cat.gmd_cat * v_dias;
        ELSIF cat.peso_inicio_cat IS NOT NULL AND v_data_inicio IS NOT NULL AND cat.gmd_cat IS NOT NULL THEN
          v_dias := GREATEST((reg.data_reg - v_data_inicio)::integer, 0);
          v_cat_peso := cat.peso_inicio_cat + cat.gmd_cat * v_dias;
        ELSE
          v_cat_peso := COALESCE(cat.peso_vivo_atual_kg_cab, cat.peso_inicio_cat, 0);
        END IF;

        v_total_peso := v_total_peso + (v_cat_peso * cat.quant_atual);
        v_total_cabecas := v_total_cabecas + cat.quant_atual;
      END LOOP;
    END IF;

    IF v_total_cabecas > 0 THEN
      v_peso_ponderado := v_total_peso / v_total_cabecas;

      UPDATE registros_suplementacao
      SET peso_vivo_kg = ROUND(v_peso_ponderado, 2),
          updated_at = NOW()
      WHERE id = reg.id
        AND peso_vivo_kg IS DISTINCT FROM ROUND(v_peso_ponderado, 2);
    END IF;
  END LOOP;
END;
$function$;

-- 3.4. recalcular_pesos_suplementacao_historico — escopo-aware
--      escopo 'lote': lógica anterior (plano histórico via lote_categoria_id),
--      mas só itera categorias não-ao-pé.
--      escopo 'creep': bezerros não têm plano; peso projetado via lc.gmd +
--      peso_vivo_atual_kg_cab (âncora evoluída diariamente pelo cron).
CREATE OR REPLACE FUNCTION public.recalcular_pesos_suplementacao_historico(
  p_fazenda_id uuid DEFAULT NULL,
  p_lote_id uuid DEFAULT NULL
)
RETURNS TABLE (
  registro_id uuid,
  lote_id uuid,
  data_registro timestamptz,
  peso_anterior numeric,
  peso_novo numeric,
  plano_usado uuid,
  formulacao_nome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rec RECORD;
  v_plano RECORD;
  v_peso_novo numeric;
  v_dias integer;
  v_data_reg date;
  v_data_ajuste date;
  v_data_inicio date;
  v_gmd numeric;
  v_count integer := 0;
BEGIN
  FOR v_rec IN
    SELECT rs.id, rs.data, rs.lote_id, rs.peso_vivo_kg, rs.escopo, lc.id AS lote_cat_id
    FROM registros_suplementacao rs
    JOIN lotes l ON l.id = rs.lote_id
    LEFT JOIN lote_categorias lc ON lc.lote_id = rs.lote_id AND lc.ativo = true AND lc.data_fim IS NULL
      AND (
        (rs.escopo = 'creep' AND lower(unaccent(trim(lc.categoria))) IN ('bezerro ao pe', 'bezerra ao pe'))
        OR (rs.escopo <> 'creep' AND lower(unaccent(trim(lc.categoria))) NOT IN ('bezerro ao pe', 'bezerra ao pe'))
      )
    WHERE rs.deleted_at IS NULL
      AND rs.lote_id IS NOT NULL
      AND (p_fazenda_id IS NULL OR l.fazenda_id = p_fazenda_id)
      AND (p_lote_id IS NULL OR rs.lote_id = p_lote_id)
  LOOP
    v_data_reg := v_rec.data::date;
    v_peso_novo := NULL;

    IF v_rec.escopo = 'creep' THEN
      -- Bezerros ao pé: sem plano nutricional; média ponderada com GMD próprio.
      -- O LEFT JOIN já produziu uma linha por categoria ao pé; o cálculo abaixo
      -- agrega todas de uma vez (idempotente entre iterações do loop).
      SELECT ROUND(
               SUM((lc2.peso_vivo_atual_kg_cab + NULLIF(lc2.gmd, '')::numeric * (v_data_reg - CURRENT_DATE)) * lc2.quant_atual)
               / NULLIF(SUM(lc2.quant_atual), 0),
               2)
      INTO v_peso_novo
      FROM lote_categorias lc2
      WHERE lc2.lote_id = v_rec.lote_id
        AND lc2.ativo = true
        AND lc2.data_fim IS NULL
        AND lc2.quant_atual > 0
        AND lc2.peso_vivo_atual_kg_cab IS NOT NULL
        AND lc2.gmd IS NOT NULL AND lc2.gmd <> ''
        AND lower(unaccent(trim(lc2.categoria))) IN ('bezerro ao pe', 'bezerra ao pe');

      -- O loop externo produz uma linha por categoria ao pé; o guard FOUND
      -- deduplica (só retorna na iteração que de fato gravou).
      IF v_peso_novo IS NOT NULL THEN
        UPDATE registros_suplementacao
        SET peso_vivo_kg = v_peso_novo, updated_at = now()
        WHERE id = v_rec.id
          AND peso_vivo_kg IS DISTINCT FROM v_peso_novo;

        IF FOUND THEN
          v_count := v_count + 1;
          registro_id := v_rec.id;
          lote_id := v_rec.lote_id;
          data_registro := v_rec.data;
          peso_anterior := v_rec.peso_vivo_kg;
          peso_novo := v_peso_novo;
          plano_usado := NULL;
          formulacao_nome := NULL;
          RETURN NEXT;
        END IF;
      END IF;
      CONTINUE;
    END IF;

    -- escopo 'lote': lógica anterior (plano histórico que cobria a data)
    SELECT pn.id, pn.peso_inicio_kg_cab, pn.data_inicio, pn.gmd_planejado,
           pn.formulacao_id, lc.data_ajuste_peso, lc.peso_vivo_atual_kg_cab,
           f.gmd AS formulacao_gmd, f.nome AS formulacao_nome
    INTO v_plano
    FROM planos_nutricionais pn
    JOIN lote_categorias lc ON lc.id = pn.lote_categoria_id
    LEFT JOIN formulacoes f ON f.id = pn.formulacao_id
    WHERE pn.lote_categoria_id = v_rec.lote_cat_id
      AND pn.data_inicio IS NOT NULL
      AND pn.data_inicio <= v_rec.data::date
      AND (pn.data_fim IS NULL OR pn.data_fim >= v_rec.data::date)
    ORDER BY pn.data_inicio DESC
    LIMIT 1;

    IF v_plano.id IS NULL THEN
      CONTINUE;
    END IF;

    v_gmd := COALESCE(v_plano.gmd_planejado, v_plano.formulacao_gmd);
    IF v_gmd IS NULL THEN
      CONTINUE;
    END IF;

    IF v_plano.data_ajuste_peso IS NOT NULL AND v_plano.peso_vivo_atual_kg_cab IS NOT NULL THEN
      v_data_ajuste := v_plano.data_ajuste_peso::date;
      IF v_data_reg >= v_data_ajuste THEN
        v_dias := (v_data_reg - v_data_ajuste)::integer;
        v_peso_novo := v_plano.peso_vivo_atual_kg_cab + v_gmd * v_dias;
      END IF;
    END IF;

    IF v_peso_novo IS NULL AND v_plano.peso_inicio_kg_cab IS NOT NULL AND v_plano.data_inicio IS NOT NULL THEN
      v_data_inicio := v_plano.data_inicio::date;
      v_dias := GREATEST(0, (v_data_reg - v_data_inicio)::integer);
      v_peso_novo := v_plano.peso_inicio_kg_cab + v_gmd * v_dias;
    END IF;

    IF v_peso_novo IS NOT NULL THEN
      v_peso_novo := ROUND(v_peso_novo, 2);

      IF v_rec.peso_vivo_kg IS NULL OR v_rec.peso_vivo_kg != v_peso_novo THEN
        UPDATE registros_suplementacao
        SET peso_vivo_kg = v_peso_novo, updated_at = now()
        WHERE id = v_rec.id;

        v_count := v_count + 1;

        registro_id := v_rec.id;
        lote_id := v_rec.lote_id;
        data_registro := v_rec.data;
        peso_anterior := v_rec.peso_vivo_kg;
        peso_novo := v_peso_novo;
        plano_usado := v_plano.id;
        formulacao_nome := v_plano.formulacao_nome;

        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'Recalculados % registros de suplementacao', v_count;
END;
$function$;

-- ============================================================================
-- 4. RPC do relatório público de consumo — partição por (lote_id, escopo)
-- ============================================================================
-- O lote passa a emitir uma entrada por escopo com registros. A entrada
-- escopo='creep' agrega apenas as categorias bezerro(a) ao pé (dieta via
-- lc.formulacao_id = formulação creep) e usa MIN(data) dos registros creep
-- como data_inicio (bezerros não têm plano nutricional).
CREATE OR REPLACE FUNCTION public.get_dados_relatorio_consumo(
  p_token uuid,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET timezone TO 'America/Cuiaba'
AS $function$
DECLARE
  v_fazenda_id uuid;
  v_ativo boolean;
  v_expira timestamptz;
  v_fazenda_nome text;
  v_fazenda_logo_url text;
  v_lotes jsonb;
  v_lotes_disponiveis jsonb;
BEGIN
  SELECT fazenda_id, ativo, expira_em INTO v_fazenda_id, v_ativo, v_expira
  FROM relatorios_publicos
  WHERE id = p_token AND tipo = 'consumo';

  IF NOT FOUND OR v_ativo = false OR (v_expira IS NOT NULL AND v_expira < now()) THEN
    RAISE EXCEPTION 'Token invalido ou expirado';
  END IF;

  SELECT nome, logo_url INTO v_fazenda_nome, v_fazenda_logo_url
  FROM fazendas WHERE id = v_fazenda_id;

  -- Lotes disponíveis (todos com registros, sem filtro de data, para o slicer)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('lote_id', l.id, 'lote_nome', l.nome) ORDER BY l.nome), '[]'::jsonb)
  INTO v_lotes_disponiveis
  FROM (
    SELECT DISTINCT r.lote_id
    FROM registros_suplementacao r
    WHERE r.fazenda_id = v_fazenda_id
      AND r.deleted_at IS NULL
      AND r.lote_id IS NOT NULL
  ) regs
  JOIN lotes l ON l.id = regs.lote_id AND l.ativo = true;

  -- Dados calculados por lote + escopo
  WITH registros_windowed AS (
    SELECT
      r.lote_id,
      r.escopo,
      r.data,
      to_char(r.data AT TIME ZONE 'America/Cuiaba', 'DD/MM') AS data_label,
      LAG(r.kg_cocho) OVER w AS lag_kg_cocho,
      LAG(r.n_cabecas) Over w AS lag_n_cabecas,
      LAG(r.qtd_bezerros) OVER w AS lag_qtd_bezerros,
      LAG(r.consumo_medio_geral_percent_pv) OVER w AS lag_consumo_percent_pv,
      LAG(r.leitura) OVER w AS lag_leitura,
      LAG(r.custo_medio_reais_cab_dia) OVER w AS lag_custo,
      LAG(r.data) OVER w AS lag_data
    FROM registros_suplementacao r
    WHERE r.fazenda_id = v_fazenda_id
      AND r.deleted_at IS NULL
      AND r.lote_id IS NOT NULL
      AND r.lote_id IN (SELECT id FROM lotes WHERE ativo = true)
      AND (p_data_inicio IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date >= p_data_inicio)
      AND (p_data_fim IS NULL OR (r.data AT TIME ZONE 'America/Cuiaba')::date <= p_data_fim)
    WINDOW w AS (PARTITION BY r.lote_id, r.escopo ORDER BY r.data, r.created_at)
  ),
  dados_por_lote AS (
    SELECT
      lote_id,
      escopo,
      jsonb_agg(jsonb_build_object(
        'data', to_char(data AT TIME ZONE 'America/Cuiaba', 'YYYY-MM-DD'),
        'data_label', data_label,
        'trato_kg_cab_dia',
          CASE WHEN lag_kg_cocho IS NOT NULL AND lag_data IS NOT NULL THEN
            lag_kg_cocho / GREATEST(1, ((data AT TIME ZONE 'America/Cuiaba')::date - (lag_data AT TIME ZONE 'America/Cuiaba')::date)) / GREATEST(1, COALESCE(lag_n_cabecas, 0) - COALESCE(lag_qtd_bezerros, 0))
          ELSE NULL END,
        'consumo_percent_pv', COALESCE(lag_consumo_percent_pv, 0),
        'leitura_cocho', CASE WHEN lag_leitura IS NOT NULL AND lag_leitura ~ '^[0-9]+\.?[0-9]*$' THEN lag_leitura::numeric ELSE NULL END,
        'custo_reais_cab_dia', lag_custo
      ) ORDER BY data) AS dados
    FROM registros_windowed
    WHERE lag_data IS NOT NULL
    GROUP BY lote_id, escopo
  ),
  lotes_com_registros AS (
    SELECT DISTINCT lote_id, escopo
    FROM registros_suplementacao
    WHERE fazenda_id = v_fazenda_id
      AND deleted_at IS NULL
      AND lote_id IS NOT NULL
      AND lote_id IN (SELECT id FROM lotes WHERE ativo = true)
      AND (p_data_inicio IS NULL OR (data AT TIME ZONE 'America/Cuiaba')::date >= p_data_inicio)
      AND (p_data_fim IS NULL OR (data AT TIME ZONE 'America/Cuiaba')::date <= p_data_fim)
  ),
  -- Categorias do lote, filtradas pelo escopo da série:
  --   escopo 'lote'  → categorias não-ao-pé
  --   escopo 'creep' → apenas bezerro(a) ao pé (dieta via lc.formulacao_id)
  cats_por_lote AS (
    SELECT
      lcr.lote_id,
      lcr.escopo,
      lc.id AS lote_categoria_id,
      lc.categoria,
      lc.raca,
      lc.quant_atual,
      lc.peso_entrada_kg_cab,
      lc.peso_vivo_atual_kg_cab,
      lc.data_meta_projetada,
      lc.formulacao_id,
      lc.peso_vivo_meta_kg_cab,
      l.formulacao_id AS lote_formulacao_id,
      pn.id AS plano_id,
      pn.data_inicio AS plano_data_inicio,
      pn.formulacao_id AS plano_formulacao_id,
      pn_lote.id AS plano_lote_id,
      pn_lote.data_inicio AS plano_lote_data_inicio,
      pn_lote.formulacao_id AS plano_lote_formulacao_id,
      pn_lote.periodo_dias AS plano_lote_periodo_dias,
      pcp.periodo_dias AS pcp_periodo_dias
    FROM lotes_com_registros lcr
    JOIN lotes l ON l.id = lcr.lote_id AND l.ativo = true
    JOIN lote_categorias lc ON lc.lote_id = lcr.lote_id AND lc.ativo = true AND lc.data_fim IS NULL
      AND (
        (lcr.escopo = 'creep' AND lower(unaccent(trim(lc.categoria))) IN ('bezerro ao pe', 'bezerra ao pe'))
        OR (lcr.escopo <> 'creep' AND lower(unaccent(trim(lc.categoria))) NOT IN ('bezerro ao pe', 'bezerra ao pe'))
      )
    -- Plano ativo vinculado à categoria (modelo antigo)
    LEFT JOIN LATERAL (
      SELECT * FROM planos_nutricionais
      WHERE lote_categoria_id = lc.id AND ativo = true AND fazenda_id = v_fazenda_id
      ORDER BY data_inicio DESC NULLS LAST LIMIT 1
    ) pn ON true
    -- Plano ativo vinculado ao lote (modelo atual)
    LEFT JOIN LATERAL (
      SELECT * FROM planos_nutricionais
      WHERE lote_id = lcr.lote_id AND lote_categoria_id IS NULL AND ativo = true AND data_fim IS NULL AND fazenda_id = v_fazenda_id
      ORDER BY data_inicio DESC NULLS LAST LIMIT 1
    ) pn_lote ON true
    -- Personalização do plano efetivo para a categoria
    LEFT JOIN plano_categoria_personalizacao pcp
      ON pcp.plano_id = COALESCE(pn.id, pn_lote.id)
      AND pcp.lote_categoria_id = lc.id
      AND pcp.ativo = true
  ),
  primeira_dieta_por_lote AS (
    SELECT todas.lote_id, MIN(todas.data_inicio) AS data_inicio
    FROM (
      SELECT p.lote_id, p.data_inicio
      FROM planos_nutricionais p
      WHERE p.fazenda_id = v_fazenda_id
        AND p.lote_id IS NOT NULL
        AND p.data_inicio IS NOT NULL
      UNION ALL
      SELECT lc.lote_id, p.data_inicio
      FROM planos_nutricionais p
      JOIN lote_categorias lc ON lc.id = p.lote_categoria_id
      WHERE p.fazenda_id = v_fazenda_id
        AND p.data_inicio IS NOT NULL
    ) todas
    GROUP BY todas.lote_id
  ),
  -- "Início" da dieta creep = primeiro registro creep do lote (sem plano)
  primeiro_creep_por_lote AS (
    SELECT lote_id, MIN((data AT TIME ZONE 'America/Cuiaba')::date) AS data_inicio
    FROM registros_suplementacao
    WHERE fazenda_id = v_fazenda_id
      AND escopo = 'creep'
      AND deleted_at IS NULL
      AND lote_id IS NOT NULL
    GROUP BY lote_id
  ),
  cats_com_erro AS (
    SELECT
      lote_id,
      escopo,
      jsonb_agg(jsonb_build_object(
        'categoria', categoria,
        'dados_faltantes', to_jsonb(array_remove(ARRAY[
          CASE WHEN peso_entrada_kg_cab IS NULL THEN 'peso_entrada_kg_cab' END,
          CASE WHEN peso_vivo_atual_kg_cab IS NULL THEN 'peso_vivo_atual_kg_cab' END,
          CASE WHEN quant_atual IS NULL OR quant_atual <= 0 THEN 'quant_atual' END
        ], NULL))
      )) AS erros
    FROM cats_por_lote
    WHERE peso_entrada_kg_cab IS NULL
       OR peso_vivo_atual_kg_cab IS NULL
       OR quant_atual IS NULL OR quant_atual <= 0
    GROUP BY lote_id, escopo
  ),
  info_lotes AS (
    SELECT
      cpl.lote_id,
      cpl.escopo,
      l.nome AS lote_nome,
      CASE WHEN cce.erros IS NULL AND SUM(cpl.quant_atual) > 0 THEN
        ROUND((SUM(cpl.peso_entrada_kg_cab * cpl.quant_atual) / SUM(cpl.quant_atual))::numeric, 2)
      END AS peso_entrada_kg_cab,
      CASE WHEN cce.erros IS NULL AND SUM(cpl.quant_atual) > 0 THEN
        ROUND((SUM(cpl.peso_vivo_atual_kg_cab * cpl.quant_atual) / SUM(cpl.quant_atual))::numeric, 2)
      END AS peso_vivo_atual_kg_cab,
      CASE WHEN cce.erros IS NULL THEN SUM(cpl.quant_atual) END AS n_cabecas_atual,
      CASE WHEN cce.erros IS NULL AND COUNT(DISTINCT cpl.raca) = 1 THEN MAX(cpl.raca)
           WHEN cce.erros IS NULL THEN 'Misto' END AS raca,
      CASE WHEN cce.erros IS NULL THEN string_agg(cpl.categoria, ', ' ORDER BY cpl.categoria) END AS categoria,
      CASE WHEN cce.erros IS NULL THEN (
        SELECT f.nome FROM cats_por_lote c2
        LEFT JOIN formulacoes f ON f.id = COALESCE(c2.formulacao_id, c2.plano_formulacao_id, c2.plano_lote_formulacao_id, c2.lote_formulacao_id)
        WHERE c2.lote_id = cpl.lote_id AND c2.escopo = cpl.escopo AND f.nome IS NOT NULL
        ORDER BY c2.quant_atual DESC NULLS LAST
        LIMIT 1
      ) END AS dieta,
      CASE WHEN cce.erros IS NULL AND cpl.escopo <> 'creep' THEN to_char(MIN(COALESCE(cpl.plano_data_inicio, cpl.plano_lote_data_inicio)), 'YYYY-MM-DD')
           WHEN cce.erros IS NULL THEN to_char(pcp2.data_inicio, 'YYYY-MM-DD') END AS data_inicio_plano,
      CASE WHEN cce.erros IS NULL AND cpl.escopo <> 'creep' AND MIN(COALESCE(cpl.plano_data_inicio, cpl.plano_lote_data_inicio)) IS NOT NULL THEN
        GREATEST(0, ((now() AT TIME ZONE 'America/Cuiaba')::date - MIN(COALESCE(cpl.plano_data_inicio, cpl.plano_lote_data_inicio))::date))
           WHEN cce.erros IS NULL AND cpl.escopo = 'creep' AND pcp2.data_inicio IS NOT NULL THEN
        GREATEST(0, ((now() AT TIME ZONE 'America/Cuiaba')::date - pcp2.data_inicio::date))
      END AS dias,
      CASE WHEN cce.erros IS NULL AND cpl.escopo <> 'creep' AND pdl.data_inicio IS NOT NULL THEN
        GREATEST(0, ((now() AT TIME ZONE 'America/Cuiaba')::date - pdl.data_inicio::date))
           WHEN cce.erros IS NULL AND cpl.escopo = 'creep' AND pcp2.data_inicio IS NOT NULL THEN
        GREATEST(0, ((now() AT TIME ZONE 'America/Cuiaba')::date - pcp2.data_inicio::date))
      END AS dias_total,
      CASE WHEN cce.erros IS NULL AND cpl.escopo <> 'creep' THEN
        COALESCE(
          to_char(MAX(cpl.data_meta_projetada), 'YYYY-MM-DD'),
          to_char(
            (MIN(COALESCE(cpl.plano_data_inicio, cpl.plano_lote_data_inicio)) + MAX(COALESCE(cpl.pcp_periodo_dias, cpl.plano_lote_periodo_dias)))::date,
            'YYYY-MM-DD'
          )
        )
      END AS data_prevista_final,
      cce.erros
    FROM cats_por_lote cpl
    JOIN lotes l ON l.id = cpl.lote_id AND l.ativo = true
    LEFT JOIN primeira_dieta_por_lote pdl ON pdl.lote_id = cpl.lote_id
    LEFT JOIN primeiro_creep_por_lote pcp2 ON pcp2.lote_id = cpl.lote_id
    LEFT JOIN cats_com_erro cce ON cce.lote_id = cpl.lote_id AND cce.escopo = cpl.escopo
    GROUP BY cpl.lote_id, cpl.escopo, l.nome, cce.erros, pdl.data_inicio, pcp2.data_inicio
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'lote_id', il.lote_id,
    'lote_nome', il.lote_nome,
    'escopo', il.escopo,
    'info', jsonb_build_object(
      'lote_id', il.lote_id,
      'lote_nome', il.lote_nome,
      'escopo', il.escopo,
      'peso_entrada_kg', il.peso_entrada_kg_cab,
      'peso_atual_kg', il.peso_vivo_atual_kg_cab,
      'data_prevista_final', il.data_prevista_final,
      'n_cabecas_atual', il.n_cabecas_atual,
      'raca', il.raca,
      'categoria', il.categoria,
      'dieta', il.dieta,
      'data_inicio_plano', il.data_inicio_plano,
      'dias', il.dias,
      'dias_total', il.dias_total,
      'erro', il.erros
    ),
    'dados', COALESCE(dp.dados, '[]'::jsonb)
  ) ORDER BY il.dieta NULLS LAST, il.lote_nome), '[]'::jsonb)
  INTO v_lotes
  FROM info_lotes il
  LEFT JOIN dados_por_lote dp ON dp.lote_id = il.lote_id AND dp.escopo = il.escopo;

  RETURN jsonb_build_object(
    'fazenda_id', v_fazenda_id,
    'dados', jsonb_build_object(
      'fazenda_nome', v_fazenda_nome,
      'fazenda_logo_url', v_fazenda_logo_url,
      'lotes', v_lotes,
      'lotes_disponiveis', v_lotes_disponiveis
    )
  );
END;
$function$;
