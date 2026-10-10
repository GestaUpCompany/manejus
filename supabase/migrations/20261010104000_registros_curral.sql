-- Registro de troca de curral do PWA (Fase 3): registros_curral + movimentacao automatica
--
-- Hoje o peao registra troca de PASTO (registros_pastagens, trigger processar_movimentacao_pastagem).
-- Esta migration cria o equivalente para CURRAL: o PWA grava um registro offline, sincroniza, e um
-- trigger move o lote entre currais respeitando o 1:1 e a convencao de datas (o dia da troca e do
-- lote que entra; o que sai termina em D-1).
--
-- Decisoes:
--  * O trigger NUNCA falha o INSERT: se a troca nao puder ser aplicada (curral ocupado, lote ja saiu,
--    data atropelando o historico), o registro fica salvo com movimentacao_status = 'recusada' e o
--    motivo em movimentacao_erro. Um erro no trigger travaria a fila de sincronizacao do peao.
--  * A troca usa o nucleo interno _ocupar_curral, sem checagem de acesso: a policy de INSERT ja
--    garantiu que o registro e de uma fazenda do usuario. trocar_lote_curral (RPC do painel) continua
--    checando acesso e agora delega ao mesmo nucleo.
--  * Registros chegam com atraso e fora de ordem: a data efetiva e a do registro (limitada a hoje).
--  * Sem fotos nesta versao (o formulario de curral nao as usa).
--
-- Conteudo:
-- 1. _ocupar_curral (nucleo interno) e trocar_lote_curral como casca com checagem de acesso
-- 2. Tabela registros_curral + indices + RLS + grants
-- 3. Trigger processar_movimentacao_curral
--
-- Rollback: supabase/rollbacks/20261010104000_registros_curral_rollback.sql

-- ============================================================================
-- 1. Nucleo interno de ocupacao
-- ============================================================================
-- Mesma logica de trocar_lote_curral (20261010100000), sem checagem de acesso, com:
--   * p_data_hora: momento exato da troca (registro do peao). Quando informado, vira a
--     data_hora_entrada da nova ocupacao e a data_hora_saida das encerradas;
--   * retorno com a lista de ocupacoes encerradas (encerradas).

CREATE OR REPLACE FUNCTION public._ocupar_curral(
  p_curral_id uuid,
  p_lote_id uuid,
  p_data_entrada date DEFAULT NULL,
  p_kg_mn_dia_dia1 numeric DEFAULT NULL,
  p_data_hora timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_curral record;
  v_lote record;
  v_tz text;
  v_hoje date;
  v_data date;
  v_antigas uuid[];
  v_encerradas uuid[];
  v_conflito record;
  v_ocupacao_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(p_curral_id::text, p_lote_id::text), 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(GREATEST(p_curral_id::text, p_lote_id::text), 0));

  SELECT c.id, c.fazenda_id, c.lote_id, c.ativo, c.deleted_at
    INTO v_curral
    FROM public.currais c
   WHERE c.id = p_curral_id;

  IF NOT FOUND OR v_curral.ativo IS DISTINCT FROM true OR v_curral.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Curral não encontrado ou inativo');
  END IF;

  SELECT l.id, l.fazenda_id, l.sistema_producao
    INTO v_lote
    FROM public.lotes l
   WHERE l.id = p_lote_id
     AND l.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lote não encontrado');
  END IF;

  IF v_lote.fazenda_id <> v_curral.fazenda_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lote e curral pertencem a fazendas diferentes');
  END IF;

  IF v_lote.sistema_producao NOT IN ('Confinamento', 'TIP', 'Sequestro') THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Sistema de produção do lote (' || COALESCE(v_lote.sistema_producao, 'indefinido') || ') não utiliza curral');
  END IF;

  SELECT COALESCE(f.timezone, 'America/Cuiaba') INTO v_tz FROM public.fazendas f WHERE f.id = v_curral.fazenda_id;
  v_tz := COALESCE(v_tz, 'America/Cuiaba');
  v_hoje := (now() AT TIME ZONE v_tz)::date;
  v_data := COALESCE(p_data_entrada, v_hoje);

  IF v_data > v_hoje THEN
    RETURN jsonb_build_object('success', false, 'error', 'A data de entrada não pode ser futura');
  END IF;

  IF v_curral.lote_id = p_lote_id THEN
    UPDATE public.lote_curral_historico
       SET kg_mn_dia_dia1 = COALESCE(p_kg_mn_dia_dia1, kg_mn_dia_dia1), updated_at = now()
     WHERE curral_id = p_curral_id AND data_final IS NULL
    RETURNING id INTO v_ocupacao_id;
    RETURN jsonb_build_object('success', true, 'ocupacao_id', v_ocupacao_id, 'sem_alteracao', true);
  END IF;

  SELECT array_agg(h.id) INTO v_antigas
    FROM public.lote_curral_historico h
   WHERE h.data_final IS NULL
     AND (h.curral_id = p_curral_id OR h.lote_id = p_lote_id);

  IF v_data < v_hoje THEN
    SELECT h.data_inicial INTO v_conflito
      FROM public.lote_curral_historico h
     WHERE h.id = ANY(COALESCE(v_antigas, '{}'::uuid[]))
       AND h.data_inicial >= v_data
     ORDER BY h.data_inicial DESC
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('success', false, 'error',
        'A data de entrada deve ser posterior à entrada da ocupação atual (' || to_char(v_conflito.data_inicial, 'DD/MM/YYYY') || ')');
    END IF;

    SELECT h.data_final INTO v_conflito
      FROM public.lote_curral_historico h
     WHERE (h.curral_id = p_curral_id OR h.lote_id = p_lote_id)
       AND h.data_final IS NOT NULL
       AND h.data_final >= v_data
     ORDER BY h.data_final DESC
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Já existe ocupação deste curral ou lote até ' || to_char(v_conflito.data_final, 'DD/MM/YYYY') || '; informe uma data posterior');
    END IF;
  END IF;

  BEGIN
    UPDATE public.currais
       SET lote_id = NULL, updated_at = now()
     WHERE lote_id = p_lote_id
       AND id <> p_curral_id
       AND deleted_at IS NULL;

    UPDATE public.currais
       SET lote_id = p_lote_id, updated_at = now()
     WHERE id = p_curral_id;

    IF v_data < v_hoje THEN
      UPDATE public.lote_curral_historico
         SET data_final = v_data - 1, updated_at = now()
       WHERE id = ANY(COALESCE(v_antigas, '{}'::uuid[]));

      UPDATE public.lote_curral_historico
         SET data_inicial = v_data, updated_at = now()
       WHERE curral_id = p_curral_id
         AND lote_id = p_lote_id
         AND data_final IS NULL;
    END IF;

    UPDATE public.lote_curral_historico
       SET kg_mn_dia_dia1 = p_kg_mn_dia_dia1, updated_at = now()
     WHERE curral_id = p_curral_id
       AND data_final IS NULL
    RETURNING id INTO v_ocupacao_id;

    -- Ocupacoes realmente encerradas por esta troca (as removidas por "ceder o dia" nao existem mais).
    SELECT array_agg(h.id) INTO v_encerradas
      FROM public.lote_curral_historico h
     WHERE h.id = ANY(COALESCE(v_antigas, '{}'::uuid[]))
       AND h.data_final IS NOT NULL;

    -- Hora exata da troca: do registro do peao; senao, inicio do dia da entrada retroativa.
    IF p_data_hora IS NOT NULL OR v_data < v_hoje THEN
      UPDATE public.lote_curral_historico
         SET data_hora_entrada = COALESCE(p_data_hora, (v_data::timestamp AT TIME ZONE v_tz)),
             updated_at = now()
       WHERE id = v_ocupacao_id;

      UPDATE public.lote_curral_historico
         SET data_hora_saida = COALESCE(p_data_hora, (v_data::timestamp AT TIME ZONE v_tz)),
             updated_at = now()
       WHERE id = ANY(COALESCE(v_encerradas, '{}'::uuid[]));
    END IF;
  EXCEPTION
    WHEN exclusion_violation OR unique_violation THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Conflito de ocupação: o curral ou o lote já está ocupado nesse período');
  END;

  RETURN jsonb_build_object(
    'success', true,
    'ocupacao_id', v_ocupacao_id,
    'encerradas', to_jsonb(COALESCE(v_encerradas, '{}'::uuid[]))
  );
END;
$$;

-- Interna: nao e chamavel por clientes (so por funcoes SECURITY DEFINER do proprio schema).
REVOKE ALL ON FUNCTION public._ocupar_curral(uuid, uuid, date, numeric, timestamptz) FROM PUBLIC, anon, authenticated;

-- trocar_lote_curral: casca com checagem de acesso sobre o nucleo.
CREATE OR REPLACE FUNCTION public.trocar_lote_curral(
  p_curral_id uuid,
  p_lote_id uuid,
  p_data_entrada date DEFAULT NULL,
  p_kg_mn_dia_dia1 numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_fazenda_id uuid;
BEGIN
  SELECT c.fazenda_id INTO v_fazenda_id
    FROM public.currais c
   WHERE c.id = p_curral_id AND c.ativo = true AND c.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Curral não encontrado ou inativo');
  END IF;

  IF NOT public.user_has_fazenda_access(v_fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda do curral');
  END IF;

  RETURN public._ocupar_curral(p_curral_id, p_lote_id, p_data_entrada, p_kg_mn_dia_dia1, NULL);
END;
$$;

-- ============================================================================
-- 2. Tabela registros_curral
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.registros_curral (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  dispositivo_id uuid,
  nome_usuario text,
  local_id text,
  data timestamptz NOT NULL,
  horario_manejo time,
  manejador text,
  lote text,
  lote_id uuid REFERENCES public.lotes(id) ON DELETE SET NULL,
  curral_saida text,
  curral_saida_id uuid REFERENCES public.currais(id) ON DELETE SET NULL,
  curral_entrada text,
  curral_entrada_id uuid REFERENCES public.currais(id) ON DELETE SET NULL,
  tempo_ocupacao text,
  gado_contado text,
  total_animais integer DEFAULT 0,
  categorias_detalhes jsonb,
  escore_gado numeric,
  escore_fezes integer,
  numero_pessoas_manejo integer,
  equipe_nomes jsonb,
  avaliacao_geral jsonb,
  observacao text,
  -- resultado da troca de curral disparada por este registro
  movimentacao_status text,
  movimentacao_erro text,
  sync_status text DEFAULT 'synced',
  version integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT registros_curral_movimentacao_status_check
    CHECK (movimentacao_status IS NULL OR movimentacao_status IN ('aplicada', 'recusada', 'ignorada'))
);

COMMENT ON TABLE public.registros_curral IS
  'Registro de troca de curral do PWA (equivalente de registros_pastagens para currais). O trigger processar_movimentacao_curral move o lote e grava o resultado em movimentacao_status/erro.';
COMMENT ON COLUMN public.registros_curral.movimentacao_status IS
  'aplicada: o lote foi movido; recusada: a troca nao pode ser aplicada (ver movimentacao_erro); ignorada: registro sem lote ou sem curral de entrada';

CREATE UNIQUE INDEX IF NOT EXISTS registros_curral_local_id_key ON public.registros_curral (local_id);
CREATE INDEX IF NOT EXISTS idx_registros_curral_fazenda ON public.registros_curral (fazenda_id);
CREATE INDEX IF NOT EXISTS idx_registros_curral_data ON public.registros_curral (data);
CREATE INDEX IF NOT EXISTS idx_registros_curral_lote ON public.registros_curral (lote_id);
CREATE INDEX IF NOT EXISTS idx_registros_curral_deleted ON public.registros_curral (deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE public.registros_curral ENABLE ROW LEVEL SECURITY;

-- caller_has_fazenda_access cobre usuarios do painel e o peao do PWA.
DROP POLICY IF EXISTS registros_curral_select ON public.registros_curral;
DROP POLICY IF EXISTS registros_curral_insert ON public.registros_curral;
DROP POLICY IF EXISTS registros_curral_update ON public.registros_curral;
DROP POLICY IF EXISTS registros_curral_delete ON public.registros_curral;

CREATE POLICY registros_curral_select ON public.registros_curral
  FOR SELECT TO authenticated
  USING (public.caller_has_fazenda_access(fazenda_id));
CREATE POLICY registros_curral_insert ON public.registros_curral
  FOR INSERT TO authenticated
  WITH CHECK (public.caller_has_fazenda_access(fazenda_id));
CREATE POLICY registros_curral_update ON public.registros_curral
  FOR UPDATE TO authenticated
  USING (public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.caller_has_fazenda_access(fazenda_id));
CREATE POLICY registros_curral_delete ON public.registros_curral
  FOR DELETE TO authenticated
  USING (public.caller_has_fazenda_access(fazenda_id));

-- Minimo privilegio: os privilegios padrao do Supabase dariam tambem TRUNCATE/REFERENCES/TRIGGER.
REVOKE ALL ON public.registros_curral FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registros_curral TO authenticated;

-- Mesmo ajuste na view da Fase 2 (20261010103000), que herdou TRUNCATE/REFERENCES/TRIGGER por padrao:
-- v_historico_ocupacao_pasto so tem SELECT para authenticated.
REVOKE ALL ON public.v_historico_ocupacao_curral FROM authenticated;
GRANT SELECT ON public.v_historico_ocupacao_curral TO authenticated;

CREATE OR REPLACE TRIGGER update_registros_curral_updated_at
  BEFORE UPDATE ON public.registros_curral
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3. Trigger: troca o lote de curral a partir do registro
-- ============================================================================

CREATE OR REPLACE FUNCTION public.processar_movimentacao_curral()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_lote_id uuid;
  v_tz text;
  v_hoje date;
  v_dia date;
  v_destino_lote uuid;
  v_resultado jsonb;
  v_status text;
  v_erro text;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Lote: o informado; senao, o que esta no curral de saida.
  v_lote_id := NEW.lote_id;
  IF v_lote_id IS NULL AND NEW.curral_saida_id IS NOT NULL THEN
    SELECT c.lote_id INTO v_lote_id
      FROM public.currais c
     WHERE c.id = NEW.curral_saida_id AND c.fazenda_id = NEW.fazenda_id;
  END IF;

  IF v_lote_id IS NULL OR NEW.curral_entrada_id IS NULL THEN
    v_status := 'ignorada';
    v_erro := 'Lote ou curral de entrada não informado';
  ELSIF NEW.curral_saida_id IS NOT NULL AND NEW.curral_saida_id = NEW.curral_entrada_id THEN
    v_status := 'ignorada';
    v_erro := 'Curral de saída igual ao de entrada';
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.currais c WHERE c.id = NEW.curral_entrada_id AND c.fazenda_id = NEW.fazenda_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.lotes l WHERE l.id = v_lote_id AND l.fazenda_id = NEW.fazenda_id
  ) THEN
    v_status := 'recusada';
    v_erro := 'Lote ou curral de entrada não pertence à fazenda do registro';
  ELSIF NEW.curral_saida_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.currais c WHERE c.id = NEW.curral_saida_id AND c.lote_id = v_lote_id
  ) THEN
    -- Registro defasado (offline): o lote ja saiu do curral de saida informado.
    v_status := 'recusada';
    v_erro := 'O lote não está mais no curral de saída informado';
  ELSE
    SELECT c.lote_id INTO v_destino_lote FROM public.currais c WHERE c.id = NEW.curral_entrada_id;
    IF v_destino_lote IS NOT NULL AND v_destino_lote <> v_lote_id THEN
      v_status := 'recusada';
      v_erro := 'O curral de entrada já está ocupado por outro lote';
    ELSE
      SELECT COALESCE(f.timezone, 'America/Cuiaba') INTO v_tz FROM public.fazendas f WHERE f.id = NEW.fazenda_id;
      v_tz := COALESCE(v_tz, 'America/Cuiaba');
      v_hoje := (now() AT TIME ZONE v_tz)::date;
      v_dia := LEAST((NEW.data AT TIME ZONE v_tz)::date, v_hoje);

      v_resultado := public._ocupar_curral(NEW.curral_entrada_id, v_lote_id, v_dia, NULL, LEAST(NEW.data, now()));
      IF COALESCE((v_resultado->>'success')::boolean, false) THEN
        v_status := 'aplicada';
        v_erro := NULL;
      ELSE
        v_status := 'recusada';
        v_erro := v_resultado->>'error';
      END IF;
    END IF;
  END IF;

  UPDATE public.registros_curral
     SET lote_id = COALESCE(lote_id, v_lote_id),
         movimentacao_status = v_status,
         movimentacao_erro = v_erro
   WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_registros_curral_mover_lote ON public.registros_curral;
CREATE TRIGGER trg_registros_curral_mover_lote
  AFTER INSERT ON public.registros_curral
  FOR EACH ROW EXECUTE FUNCTION public.processar_movimentacao_curral();
