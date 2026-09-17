-- Segurança e integridade do lançamento de tratos
--
-- 1. Substitui as policies permissivas (USING true) de registros_oferta_trato
--    por policies restritas ao vínculo ativo em usuario_fazenda, usando a
--    função helper user_has_fazenda_access (mesma que protege outras tabelas).
--    Cobre web (controllers) e PWA (peões possuem usuarios + usuario_fazenda).
-- 2. CHECK constraints para impedir kg negativos.
-- 3. Coluna origem ('pwa' | 'painel') para auditoria da fonte do lançamento.
-- 4. Índice único por dia operacional (fuso America/Cuiaba), corrigindo a
--    unicidade que antes era por instante exato (timestamptz) e permitia
--    duplicatas entre painel (meio-dia fixo) e PWA (horário real).
-- 5. RPC lancar_tratos_folha: gravação atômica e validada dos lançamentos
--    da folha de campo feita pelo painel web.

-- ============================================================
-- 1. Policies RLS por fazenda
-- ============================================================
DROP POLICY IF EXISTS rls_registros_oferta_trato_select ON public.registros_oferta_trato;
DROP POLICY IF EXISTS rls_registros_oferta_trato_insert ON public.registros_oferta_trato;
DROP POLICY IF EXISTS rls_registros_oferta_trato_update ON public.registros_oferta_trato;
DROP POLICY IF EXISTS rls_registros_oferta_trato_delete ON public.registros_oferta_trato;

CREATE POLICY rls_registros_oferta_trato_select ON public.registros_oferta_trato
  FOR SELECT TO authenticated
  USING (public.user_has_fazenda_access(fazenda_id));

CREATE POLICY rls_registros_oferta_trato_insert ON public.registros_oferta_trato
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_fazenda_access(fazenda_id));

CREATE POLICY rls_registros_oferta_trato_update ON public.registros_oferta_trato
  FOR UPDATE TO authenticated
  USING (public.user_has_fazenda_access(fazenda_id))
  WITH CHECK (public.user_has_fazenda_access(fazenda_id));

CREATE POLICY rls_registros_oferta_trato_delete ON public.registros_oferta_trato
  FOR DELETE TO authenticated
  USING (public.user_has_fazenda_access(fazenda_id));

-- ============================================================
-- 2. Integridade de quantidades
-- ============================================================
ALTER TABLE public.registros_oferta_trato
  ADD CONSTRAINT registros_oferta_trato_kg_planejado_positivo
    CHECK (kg_planejado >= 0),
  ADD CONSTRAINT registros_oferta_trato_kg_real_positivo
    CHECK (kg_ofertado_real >= 0);

-- ============================================================
-- 3. Origem do lançamento (auditoria)
-- ============================================================
ALTER TABLE public.registros_oferta_trato
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'pwa';

ALTER TABLE public.registros_oferta_trato
  ADD CONSTRAINT registros_oferta_trato_origem_check
    CHECK (origem IN ('pwa', 'painel'));

-- ============================================================
-- 4. Unicidade por dia operacional (America/Cuiaba)
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS registros_oferta_trato_dia_operacional_uk
  ON public.registros_oferta_trato
    (curral_id, ((data AT TIME ZONE 'America/Cuiaba')::date), ordem_trato)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 5. RPC de lançamento atômico (folha de campo no painel web)
-- ============================================================
CREATE OR REPLACE FUNCTION public.lancar_tratos_folha(p_registros jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_item jsonb;
  v_fazenda uuid;
  v_curral uuid;
  v_lote uuid;
  v_programacao uuid;
  v_data timestamptz;
  v_ordem integer;
  v_kg_plan numeric;
  v_kg_real numeric;
  v_leitura integer;
  v_id uuid;
  v_total integer := 0;
BEGIN
  IF p_registros IS NULL
     OR jsonb_typeof(p_registros) <> 'array'
     OR jsonb_array_length(p_registros) = 0 THEN
    RAISE EXCEPTION 'Nenhum lançamento informado.';
  END IF;

  IF (SELECT count(DISTINCT item->>'fazenda_id')
        FROM jsonb_array_elements(p_registros) item) <> 1 THEN
    RAISE EXCEPTION 'Todos os lançamentos devem pertencer à mesma fazenda.';
  END IF;

  SELECT (item->>'fazenda_id')::uuid INTO v_fazenda
    FROM jsonb_array_elements(p_registros) item LIMIT 1;

  IF NOT public.user_has_fazenda_access(v_fazenda) THEN
    RAISE EXCEPTION 'Usuário sem acesso à fazenda informada.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_registros) LOOP
    v_curral := (v_item->>'curral_id')::uuid;
    v_lote := nullif(v_item->>'lote_id', '')::uuid;
    v_programacao := nullif(v_item->>'programacao_id', '')::uuid;
    v_data := (v_item->>'data')::timestamptz;
    v_ordem := (v_item->>'ordem_trato')::integer;
    v_kg_plan := nullif(v_item->>'kg_planejado', '')::numeric;
    v_kg_real := (v_item->>'kg_ofertado_real')::numeric;
    v_leitura := nullif(v_item->>'leitura_cocho_nota', '')::integer;

    IF v_curral IS NULL OR v_data IS NULL OR v_ordem IS NULL OR v_ordem <= 0 THEN
      RAISE EXCEPTION 'Lançamento inválido: curral, data e ordem do trato são obrigatórios.';
    END IF;

    IF v_kg_real IS NULL OR v_kg_real < 0 OR (v_kg_plan IS NOT NULL AND v_kg_plan < 0) THEN
      RAISE EXCEPTION 'Quantidade de trato inválida: kg real é obrigatório e não pode ser negativo.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM currais WHERE id = v_curral AND fazenda_id = v_fazenda) THEN
      RAISE EXCEPTION 'Curral informado não pertence à fazenda.';
    END IF;

    IF v_lote IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM lotes WHERE id = v_lote AND fazenda_id = v_fazenda) THEN
      RAISE EXCEPTION 'Lote informado não pertence à fazenda.';
    END IF;

    IF v_programacao IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM programacao_tratos
                      WHERE id = v_programacao AND fazenda_id = v_fazenda) THEN
        RAISE EXCEPTION 'Programação informada não pertence à fazenda.';
      END IF;
      IF v_ordem > (SELECT quantidade_tratos FROM programacao_tratos
                     WHERE id = v_programacao) THEN
        RAISE EXCEPTION 'Ordem do trato excede a quantidade configurada na programação.';
      END IF;
    END IF;

    -- Resolve o registro lógico já existente (mesmo curral, dia operacional e ordem),
    -- para atualizar em vez de duplicar quando o PWA já gravou o mesmo trato.
    SELECT rot.id INTO v_id
      FROM registros_oferta_trato rot
     WHERE rot.deleted_at IS NULL
       AND rot.curral_id = v_curral
       AND (rot.data AT TIME ZONE 'America/Cuiaba')::date
           = (v_data AT TIME ZONE 'America/Cuiaba')::date
       AND rot.ordem_trato = v_ordem
     ORDER BY rot.created_at DESC
     LIMIT 1;

    v_id := COALESCE(v_id, nullif(v_item->>'id', '')::uuid, gen_random_uuid());

    INSERT INTO registros_oferta_trato (
      id, fazenda_id, curral_id, lote_id, data, ordem_trato,
      kg_planejado, kg_ofertado_real, leitura_cocho_nota,
      programacao_id, nome_usuario, sync_status, origem, local_id
    ) VALUES (
      v_id, v_fazenda, v_curral, v_lote, v_data, v_ordem,
      v_kg_plan, v_kg_real, v_leitura,
      v_programacao, v_item->>'nome_usuario', 'synced',
      coalesce(nullif(v_item->>'origem', ''), 'painel'),
      nullif(v_item->>'local_id', '')
    )
    ON CONFLICT (id) DO UPDATE SET
      lote_id = EXCLUDED.lote_id,
      kg_planejado = EXCLUDED.kg_planejado,
      kg_ofertado_real = EXCLUDED.kg_ofertado_real,
      leitura_cocho_nota = EXCLUDED.leitura_cocho_nota,
      programacao_id = EXCLUDED.programacao_id,
      nome_usuario = EXCLUDED.nome_usuario;

    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lancar_tratos_folha(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lancar_tratos_folha(jsonb) TO authenticated;
