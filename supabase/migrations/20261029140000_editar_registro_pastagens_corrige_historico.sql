-- Edição de data em registros_pastagens passa a reajustar o histórico de ocupação.
--
-- Contexto: editar_registro_pastagens (20261029120000) só alterava o registro; o histórico
-- (lote_pasto_historico, lote_modulo_historico, lote_curral_historico) continuava com a data errada.
-- Os carimbos do histórico vêm da data do registro assim:
--   pasto -> pasto : saída do pasto anterior e entrada no novo = registros_pastagens.data
--   curral -> pasto: entrada no pasto (e módulo) = LEAST(data, created_at). A saída do curral usa now()
--                    no momento do lançamento, não a data do registro, então não é tocada aqui.
--   pasto -> curral: saída do pasto (e módulo) e entrada no curral = LEAST(data, created_at);
--                    a ocupação anterior do curral/lote termina em (dia - 1) com saída no mesmo carimbo.
-- Curral -> curral grava em registros_curral e fica fora desta RPC.
--
-- O que a correção faz, na mesma transação do UPDATE do registro:
--   * move os carimbos acima para a nova data (e data_inicial/data_final de curral);
--   * recalcula cabeças e peso na nova data (calc_cabecas_peso_lote_em), mantendo o valor antigo se não houver base;
--   * recalcula o desvio de tempo de ocupação das linhas afetadas;
--   * recalcula os textos tempo_ocupacao / tempo_vedacao do próprio registro.
-- Recusa, com mensagem clara, quando: a data é futura; o histórico do movimento não é encontrado de forma única;
-- a nova data cai fora da janela entre o movimento anterior e o seguinte do lote; ou conflita com outra
-- ocupação de curral. Não cascateia: o usuário corrige primeiro o movimento vizinho.
-- Movimentos recusados/ignorados pelo banco (movimentacao_status) não têm histórico: só a data muda.
--
-- As travas de proteção do histórico continuam valendo para todo o resto: o bypass só existe dentro desta
-- transação (app.correcao_historico_movimento = 'on', definido pela RPC) e ainda bloqueia mudança de identidade
-- (id, lote, pasto/módulo, created_at).
--
-- Fora do escopo (ficam como estão): textos tempo_* de OUTROS registros que dependem deste movimento;
-- cabeças/peso de ocupações de outros lotes tocadas no curral; curral -> curral.
--
-- Rollback: supabase/rollbacks/20261029140000_editar_registro_pastagens_corrige_historico_rollback.sql

-- ---------------------------------------------------------------------------
-- 1. Helpers internos
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._desvio_ocupacao_pastagens(p_entrada timestamptz, p_saida timestamptz, p_meta integer)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_meta IS NOT NULL AND p_meta > 0 THEN
      ROUND(((EXTRACT(EPOCH FROM (p_saida - p_entrada)) / 86400.0 - p_meta) / p_meta * 100)::numeric, 2)
  END;
$function$;

-- Mesmo formato de calcularDiferencaTempo do PWA: "Menos de 1 hora", "N horas", "1 dia/N horas", "D dias/N horas".
CREATE OR REPLACE FUNCTION public._formatar_tempo_pastagens(p_inicio timestamptz, p_fim timestamptz)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_seg numeric := EXTRACT(EPOCH FROM (p_fim - p_inicio));
  v_dias integer;
  v_horas integer;
BEGIN
  IF p_inicio IS NULL OR p_fim IS NULL OR v_seg < 0 THEN
    RETURN 'Primeiro uso';
  END IF;
  v_dias := floor(v_seg / 86400);
  v_horas := floor(v_seg / 3600);
  IF v_horas = 0 THEN
    RETURN 'Menos de 1 hora';
  ELSIF v_dias = 0 THEN
    RETURN v_horas || ' horas';
  ELSIF v_dias = 1 THEN
    RETURN '1 dia/' || v_horas || ' horas';
  END IF;
  RETURN v_dias || ' dias/' || v_horas || ' horas';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._desvio_ocupacao_pastagens(timestamptz, timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._formatar_tempo_pastagens(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Travas do histórico: bypass restrito à correção de movimento
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.proteger_lote_pasto_historico_update()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Correção de data de movimento (editar_registro_pastagens): libera data/cabeças/peso de entrada,
  -- mas a identidade da linha continua protegida.
  IF COALESCE(current_setting('app.correcao_historico_movimento', true), '') = 'on' THEN
    IF OLD.id IS DISTINCT FROM NEW.id OR
       OLD.lote_id IS DISTINCT FROM NEW.lote_id OR
       OLD.pasto_id IS DISTINCT FROM NEW.pasto_id OR
       OLD.modulo_id IS DISTINCT FROM NEW.modulo_id OR
       OLD.created_at IS DISTINCT FROM NEW.created_at
    THEN
      RAISE EXCEPTION 'A correção de movimento não pode alterar a identidade do histórico de pasto';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF (
    OLD.id IS DISTINCT FROM NEW.id OR
    OLD.lote_id IS DISTINCT FROM NEW.lote_id OR
    OLD.pasto_id IS DISTINCT FROM NEW.pasto_id OR
    OLD.data_hora_entrada IS DISTINCT FROM NEW.data_hora_entrada OR
    OLD.cabecas_entrada IS DISTINCT FROM NEW.cabecas_entrada OR
    OLD.peso_vivo_medio_entrada_kg IS DISTINCT FROM NEW.peso_vivo_medio_entrada_kg OR
    OLD.modulo_id IS DISTINCT FROM NEW.modulo_id OR
    OLD.created_at IS DISTINCT FROM NEW.created_at
  ) THEN
    RAISE EXCEPTION 'Não é permitido alterar campos de entrada do histórico. Apenas data_hora_saida, cabecas_saida, peso_vivo_medio_saida_kg, desvio_tempo_ocupacao_percent, taxa_lotacao_ua_ha e meta_intervalo_ocupacao_dias podem ser atualizados.';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.proteger_lote_modulo_historico_update()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF COALESCE(current_setting('app.correcao_historico_movimento', true), '') = 'on' THEN
    IF OLD.id IS DISTINCT FROM NEW.id OR
       OLD.lote_id IS DISTINCT FROM NEW.lote_id OR
       OLD.modulo_id IS DISTINCT FROM NEW.modulo_id OR
       OLD.created_at IS DISTINCT FROM NEW.created_at
    THEN
      RAISE EXCEPTION 'A correção de movimento não pode alterar a identidade do histórico de módulo';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF (
    OLD.id IS DISTINCT FROM NEW.id OR
    OLD.lote_id IS DISTINCT FROM NEW.lote_id OR
    OLD.modulo_id IS DISTINCT FROM NEW.modulo_id OR
    OLD.data_hora_entrada IS DISTINCT FROM NEW.data_hora_entrada OR
    OLD.cabecas_entrada IS DISTINCT FROM NEW.cabecas_entrada OR
    OLD.peso_vivo_medio_entrada_kg IS DISTINCT FROM NEW.peso_vivo_medio_entrada_kg OR
    OLD.created_at IS DISTINCT FROM NEW.created_at
  ) THEN
    RAISE EXCEPTION 'Não é permitido alterar campos de entrada do histórico de módulo. Apenas data_hora_saida, cabecas_saida, peso_vivo_medio_saida_kg, desvio_tempo_ocupacao_percent, taxa_lotacao_ua_ha e meta_intervalo_ocupacao_dias podem ser atualizados.';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Correção do histórico de um movimento
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._corrigir_historico_movimento_pastagem(
  p_reg public.registros_pastagens,
  p_nova_data timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tz text;
  v_fmt constant text := 'DD/MM/YYYY HH24:MI';
  v_try timestamptz;
  v_old_ts timestamptz;
  v_old_dia date;
  v_novo_dia date;
  v_tipo text;
  v_lote uuid := p_reg.lote_id;
  v_pasto_ent uuid;
  v_pasto_sai uuid;
  v_n integer;
  v_e public.lote_pasto_historico%ROWTYPE;
  v_p public.lote_pasto_historico%ROWTYPE;
  v_c public.lote_curral_historico%ROWTYPE;
  v_mi public.lote_modulo_historico%ROWTYPE;
  v_mo public.lote_modulo_historico%ROWTYPE;
  v_cab integer;
  v_cab_hoje integer;
  v_hoje date;
  v_peso numeric;
  v_inicio timestamptz;
  v_antes timestamptz;
  v_tempo_ocup text;
  v_tempo_ved text;
BEGIN
  IF p_nova_data > now() THEN
    RAISE EXCEPTION 'A data do registro não pode ser futura';
  END IF;

  -- Movimento recusado/ignorado pelo banco não gerou histórico: só a data do registro muda.
  IF p_reg.movimentacao_status IN ('recusada', 'ignorada') THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT COALESCE(f.timezone, 'America/Cuiaba') INTO v_tz FROM public.fazendas f WHERE f.id = p_reg.fazenda_id;
  v_tz := COALESCE(v_tz, 'America/Cuiaba');

  v_pasto_ent := COALESCE(p_reg.pasto_entrada_id, (
    SELECT p.id FROM public.pastos p
     WHERE p.fazenda_id = p_reg.fazenda_id AND p.nome = p_reg.pasto_entrada LIMIT 1));
  v_pasto_sai := COALESCE(p_reg.pasto_saida_id, (
    SELECT p.id FROM public.pastos p
     WHERE p.fazenda_id = p_reg.fazenda_id AND p.nome = p_reg.pasto_saida LIMIT 1));

  v_tipo := CASE
    WHEN p_reg.curral_saida_id IS NULL AND p_reg.curral_entrada_id IS NULL AND v_pasto_ent IS NOT NULL THEN 'pasto_pasto'
    WHEN p_reg.curral_saida_id IS NOT NULL AND p_reg.curral_entrada_id IS NULL AND v_pasto_ent IS NOT NULL THEN 'curral_pasto'
    WHEN p_reg.curral_saida_id IS NULL AND p_reg.curral_entrada_id IS NOT NULL AND v_pasto_sai IS NOT NULL THEN 'pasto_curral'
    ELSE NULL
  END;

  -- Sem origem/destino reconhecíveis (ex.: lote não identificado): o trigger de INSERT também não gravou histórico.
  IF v_tipo IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  IF v_lote IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.lotes l WHERE l.id = v_lote AND l.fazenda_id = p_reg.fazenda_id
  ) THEN
    RAISE EXCEPTION 'O lote do registro não pertence à fazenda';
  END IF;

  -- Localiza o carimbo original do movimento no histórico. pasto->pasto grava a data do registro;
  -- os movimentos mistos gravam LEAST(data, created_at); a data já pode ter sido corrigida antes,
  -- por isso as duas hipóteses são tentadas.
  FOREACH v_try IN ARRAY ARRAY[p_reg.data, LEAST(p_reg.data, p_reg.created_at)] LOOP
    IF v_tipo IN ('pasto_pasto', 'curral_pasto') THEN
      SELECT count(*) INTO v_n
        FROM public.lote_pasto_historico h
        JOIN public.lotes l ON l.id = h.lote_id
       WHERE l.fazenda_id = p_reg.fazenda_id
         AND h.pasto_id = v_pasto_ent
         AND (v_lote IS NULL OR h.lote_id = v_lote)
         AND abs(extract(epoch FROM (h.data_hora_entrada - v_try))) < 1;
    ELSE
      SELECT count(*) INTO v_n
        FROM public.lote_pasto_historico h
        JOIN public.lotes l ON l.id = h.lote_id
       WHERE l.fazenda_id = p_reg.fazenda_id
         AND h.pasto_id = v_pasto_sai
         AND (v_lote IS NULL OR h.lote_id = v_lote)
         AND abs(extract(epoch FROM (h.data_hora_saida - v_try))) < 1;
    END IF;
    IF v_n = 1 THEN
      v_old_ts := v_try;
      EXIT;
    END IF;
  END LOOP;

  IF v_old_ts IS NULL THEN
    RAISE EXCEPTION 'Não foi possível localizar a ocupação deste movimento no histórico; a data não pode ser corrigida automaticamente';
  END IF;

  v_old_dia := (v_old_ts AT TIME ZONE v_tz)::date;
  v_novo_dia := (p_nova_data AT TIME ZONE v_tz)::date;

  IF v_tipo IN ('pasto_pasto', 'curral_pasto') THEN
    SELECT h.* INTO v_e
      FROM public.lote_pasto_historico h
      JOIN public.lotes l ON l.id = h.lote_id
     WHERE l.fazenda_id = p_reg.fazenda_id
       AND h.pasto_id = v_pasto_ent
       AND (v_lote IS NULL OR h.lote_id = v_lote)
       AND abs(extract(epoch FROM (h.data_hora_entrada - v_old_ts))) < 1;
    v_lote := v_e.lote_id;

    IF v_tipo = 'pasto_pasto' THEN
      SELECT h.* INTO v_p
        FROM public.lote_pasto_historico h
       WHERE h.lote_id = v_lote
         AND h.id <> v_e.id
         AND abs(extract(epoch FROM (h.data_hora_saida - v_old_ts))) < 1
       ORDER BY h.data_hora_entrada DESC
       LIMIT 1;
    END IF;

    SELECT m.* INTO v_mi
      FROM public.lote_modulo_historico m
     WHERE m.lote_id = v_lote
       AND abs(extract(epoch FROM (m.data_hora_entrada - v_old_ts))) < 1
     ORDER BY m.created_at DESC
     LIMIT 1;
  ELSE
    SELECT h.* INTO v_p
      FROM public.lote_pasto_historico h
      JOIN public.lotes l ON l.id = h.lote_id
     WHERE l.fazenda_id = p_reg.fazenda_id
       AND h.pasto_id = v_pasto_sai
       AND (v_lote IS NULL OR h.lote_id = v_lote)
       AND abs(extract(epoch FROM (h.data_hora_saida - v_old_ts))) < 1;
    v_lote := v_p.lote_id;

    SELECT h.* INTO v_c
      FROM public.lote_curral_historico h
     WHERE h.fazenda_id = p_reg.fazenda_id
       AND h.curral_id = p_reg.curral_entrada_id
       AND h.lote_id = v_lote
       AND abs(extract(epoch FROM (h.data_hora_entrada - v_old_ts))) < 1
     ORDER BY h.created_at DESC
     LIMIT 1;
    IF v_c.id IS NULL THEN
      RAISE EXCEPTION 'Não foi possível localizar a ocupação do curral de entrada no histórico; a data não pode ser corrigida automaticamente';
    END IF;
  END IF;

  IF v_tipo IN ('pasto_pasto', 'pasto_curral') THEN
    SELECT m.* INTO v_mo
      FROM public.lote_modulo_historico m
     WHERE m.lote_id = v_lote
       AND abs(extract(epoch FROM (m.data_hora_saida - v_old_ts))) < 1
     ORDER BY m.created_at DESC
     LIMIT 1;
  END IF;

  -- curral -> pasto: a entrada do lote no curral de saída é o limite inferior (a saída do curral não é tocada).
  IF v_tipo = 'curral_pasto' THEN
    SELECT max(h.data_hora_entrada) INTO v_inicio
      FROM public.lote_curral_historico h
     WHERE h.fazenda_id = p_reg.fazenda_id
       AND h.curral_id = p_reg.curral_saida_id
       AND h.lote_id = v_lote
       AND h.data_hora_entrada <= v_old_ts;
    IF v_inicio IS NOT NULL AND p_nova_data <= v_inicio THEN
      RAISE EXCEPTION 'A nova data (%) é anterior ou igual à entrada do lote no curral de saída (%). Corrija primeiro o movimento anterior',
        to_char(p_nova_data AT TIME ZONE v_tz, v_fmt), to_char(v_inicio AT TIME ZONE v_tz, v_fmt);
    END IF;
  END IF;

  -- Janela permitida: depois do movimento anterior do lote e antes do seguinte.
  IF v_e.id IS NOT NULL AND v_e.data_hora_saida IS NOT NULL AND p_nova_data >= v_e.data_hora_saida THEN
    RAISE EXCEPTION 'A nova data (%) é posterior à saída do lote deste pasto (%). Corrija primeiro o movimento seguinte',
      to_char(p_nova_data AT TIME ZONE v_tz, v_fmt), to_char(v_e.data_hora_saida AT TIME ZONE v_tz, v_fmt);
  END IF;
  IF v_p.id IS NOT NULL AND p_nova_data <= v_p.data_hora_entrada THEN
    RAISE EXCEPTION 'A nova data (%) é anterior ou igual à entrada do lote no pasto de saída (%). Corrija primeiro o movimento anterior',
      to_char(p_nova_data AT TIME ZONE v_tz, v_fmt), to_char(v_p.data_hora_entrada AT TIME ZONE v_tz, v_fmt);
  END IF;
  IF v_mo.id IS NOT NULL AND p_nova_data <= v_mo.data_hora_entrada THEN
    RAISE EXCEPTION 'A nova data (%) é anterior ou igual à entrada do lote no módulo de saída (%). Corrija primeiro o movimento anterior',
      to_char(p_nova_data AT TIME ZONE v_tz, v_fmt), to_char(v_mo.data_hora_entrada AT TIME ZONE v_tz, v_fmt);
  END IF;
  IF v_mi.id IS NOT NULL AND v_mi.data_hora_saida IS NOT NULL AND p_nova_data >= v_mi.data_hora_saida THEN
    RAISE EXCEPTION 'A nova data (%) é posterior à saída do lote deste módulo (%). Corrija primeiro o movimento seguinte',
      to_char(p_nova_data AT TIME ZONE v_tz, v_fmt), to_char(v_mi.data_hora_saida AT TIME ZONE v_tz, v_fmt);
  END IF;
  IF v_c.id IS NOT NULL AND v_c.data_hora_saida IS NOT NULL AND p_nova_data >= v_c.data_hora_saida THEN
    RAISE EXCEPTION 'A nova data (%) é posterior à saída do lote deste curral (%). Corrija primeiro o movimento seguinte',
      to_char(p_nova_data AT TIME ZONE v_tz, v_fmt), to_char(v_c.data_hora_saida AT TIME ZONE v_tz, v_fmt);
  END IF;

  -- Cabeças e peso do lote na nova data. Só recalcula quando a reconstrução histórica reproduz o saldo atual
  -- do lote (hoje); se divergir, o razão de movimentações do lote está incompleto e é mais seguro manter
  -- os valores gravados.
  v_hoje := (now() AT TIME ZONE v_tz)::date;
  SELECT t.n_cabecas INTO v_cab_hoje FROM public.calc_cabecas_peso_lote_em(v_lote, v_hoje) t;
  IF v_cab_hoje IS NOT DISTINCT FROM public.calcular_cabecas_lote(v_lote) THEN
    SELECT t.n_cabecas, t.peso_vivo_kg INTO v_cab, v_peso
      FROM public.calc_cabecas_peso_lote_em(v_lote, v_novo_dia) t;
    v_cab := NULLIF(v_cab, 0);
  END IF;

  PERFORM set_config('app.correcao_historico_movimento', 'on', true);

  -- Entrada no pasto
  IF v_e.id IS NOT NULL THEN
    UPDATE public.lote_pasto_historico
       SET data_hora_entrada = p_nova_data,
           data_inicial = CASE WHEN data_inicial = v_old_dia THEN v_novo_dia ELSE data_inicial END,
           cabecas_entrada = COALESCE(v_cab, cabecas_entrada),
           peso_vivo_medio_entrada_kg = COALESCE(v_peso, peso_vivo_medio_entrada_kg),
           desvio_tempo_ocupacao_percent = CASE
             WHEN data_hora_saida IS NOT NULL
               THEN public._desvio_ocupacao_pastagens(p_nova_data, data_hora_saida, meta_intervalo_ocupacao_dias)
             ELSE desvio_tempo_ocupacao_percent END,
           updated_at = now()
     WHERE id = v_e.id;
  END IF;

  -- Saída do pasto de origem
  IF v_p.id IS NOT NULL AND v_tipo IN ('pasto_pasto', 'pasto_curral') THEN
    UPDATE public.lote_pasto_historico
       SET data_hora_saida = p_nova_data,
           cabecas_saida = COALESCE(v_cab, cabecas_saida),
           peso_vivo_medio_saida_kg = COALESCE(v_peso, peso_vivo_medio_saida_kg),
           desvio_tempo_ocupacao_percent = public._desvio_ocupacao_pastagens(data_hora_entrada, p_nova_data, meta_intervalo_ocupacao_dias),
           updated_at = now()
     WHERE id = v_p.id;
  END IF;

  -- Módulo
  IF v_mi.id IS NOT NULL THEN
    UPDATE public.lote_modulo_historico
       SET data_hora_entrada = p_nova_data,
           cabecas_entrada = COALESCE(v_cab, cabecas_entrada),
           peso_vivo_medio_entrada_kg = COALESCE(v_peso, peso_vivo_medio_entrada_kg),
           desvio_tempo_ocupacao_percent = CASE
             WHEN data_hora_saida IS NOT NULL
               THEN public._desvio_ocupacao_pastagens(p_nova_data, data_hora_saida, meta_intervalo_ocupacao_dias)
             ELSE desvio_tempo_ocupacao_percent END,
           updated_at = now()
     WHERE id = v_mi.id;
  END IF;
  IF v_mo.id IS NOT NULL THEN
    UPDATE public.lote_modulo_historico
       SET data_hora_saida = p_nova_data,
           cabecas_saida = COALESCE(v_cab, cabecas_saida),
           peso_vivo_medio_saida_kg = COALESCE(v_peso, peso_vivo_medio_saida_kg),
           desvio_tempo_ocupacao_percent = public._desvio_ocupacao_pastagens(data_hora_entrada, p_nova_data, meta_intervalo_ocupacao_dias),
           updated_at = now()
     WHERE id = v_mo.id;
  END IF;

  -- Curral de entrada (pasto -> curral). A ordem importa por causa das exclusões de sobreposição por dia:
  -- data mais cedo = encurta a ocupação anterior antes de antecipar a nova; mais tarde = o inverso.
  IF v_tipo = 'pasto_curral' THEN
    BEGIN
      IF p_nova_data < v_old_ts THEN
        UPDATE public.lote_curral_historico
           SET data_hora_saida = p_nova_data,
               data_final = v_novo_dia - 1,
               updated_at = now()
         WHERE fazenda_id = p_reg.fazenda_id
           AND id <> v_c.id
           AND (curral_id = v_c.curral_id OR lote_id = v_lote)
           AND abs(extract(epoch FROM (data_hora_saida - v_old_ts))) < 1;
      END IF;

      UPDATE public.lote_curral_historico
         SET data_hora_entrada = p_nova_data,
             data_inicial = v_novo_dia,
             cabecas_entrada = COALESCE(v_cab, cabecas_entrada),
             peso_vivo_medio_entrada_kg = COALESCE(v_peso, peso_vivo_medio_entrada_kg),
             updated_at = now()
       WHERE id = v_c.id;

      IF p_nova_data >= v_old_ts THEN
        UPDATE public.lote_curral_historico
           SET data_hora_saida = p_nova_data,
               data_final = v_novo_dia - 1,
               updated_at = now()
         WHERE fazenda_id = p_reg.fazenda_id
           AND id <> v_c.id
           AND (curral_id = v_c.curral_id OR lote_id = v_lote)
           AND abs(extract(epoch FROM (data_hora_saida - v_old_ts))) < 1;
      END IF;
    EXCEPTION WHEN exclusion_violation OR check_violation THEN
      RAISE EXCEPTION 'A nova data entra em conflito com outra ocupação do curral ou do lote; ajuste primeiro as ocupações vizinhas';
    END;
  END IF;

  PERFORM set_config('app.correcao_historico_movimento', 'off', true);

  -- Textos de tempo do próprio registro, relativos à nova data.
  -- (curral -> pasto: v_inicio já guarda a entrada no curral de saída)
  IF v_tipo IN ('pasto_pasto', 'pasto_curral') AND v_p.id IS NOT NULL THEN
    v_inicio := v_p.data_hora_entrada;
  END IF;
  IF v_inicio IS NOT NULL THEN
    v_tempo_ocup := public._formatar_tempo_pastagens(v_inicio, p_nova_data);
  END IF;

  IF v_tipo IN ('pasto_pasto', 'curral_pasto') THEN
    SELECT max(h.data_hora_saida) INTO v_antes
      FROM public.lote_pasto_historico h
      JOIN public.lotes l ON l.id = h.lote_id
     WHERE l.fazenda_id = p_reg.fazenda_id
       AND h.pasto_id = v_pasto_ent
       AND h.id <> v_e.id
       AND h.data_hora_saida < p_nova_data;
    v_tempo_ved := CASE WHEN v_antes IS NULL THEN 'Primeiro uso'
                        ELSE public._formatar_tempo_pastagens(v_antes, p_nova_data) END;
  END IF;

  RETURN jsonb_build_object('tempo_ocupacao', v_tempo_ocup, 'tempo_vedacao', v_tempo_ved);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._corrigir_historico_movimento_pastagem(public.registros_pastagens, timestamptz) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC de edição: agora corrige o histórico quando a data muda
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.editar_registro_pastagens(
  p_id uuid,
  p_fazenda_id uuid,
  p_usuario_id uuid,
  p_usuario_email text,
  p_campos jsonb
)
RETURNS public.registros_pastagens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old public.registros_pastagens%ROWTYPE;
  v_new public.registros_pastagens%ROWTYPE;
  v_filtered jsonb := '{}'::jsonb;
  v_hist jsonb := '{}'::jsonb;
  v_campo text;
  v_campos_permitidos text[] := ARRAY['data','avaliacao_saida','escore_gado','escore_fezes','numero_pessoas_manejo'];
  v_auth_id uuid; v_auth_email text; v_auth_nome text;
  v_is_controller boolean;
BEGIN
  SELECT u.id, u.email, u.nome INTO v_auth_id, v_auth_email, v_auth_nome
    FROM public.usuarios u WHERE u.auth_id = auth.uid();
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  PERFORM set_config('app.current_user_id', v_auth_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(v_auth_email, ''), true);
  PERFORM set_config('app.current_user_nome', COALESCE(v_auth_nome, ''), true);

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_fazenda uf
    WHERE uf.usuario_id = v_auth_id AND uf.fazenda_id = p_fazenda_id
      AND uf.papel IN ('admin', 'controller') AND uf.ativo = true
  ) INTO v_is_controller;

  IF NOT v_is_controller THEN
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem editar registros de pastagens';
  END IF;

  SELECT * INTO v_old FROM public.registros_pastagens
    WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado ou já excluído';
  END IF;

  -- Avaliação do pasto de saída só existe quando a saída foi de pasto (não de curral)
  IF p_campos ? 'avaliacao_saida' AND p_campos->'avaliacao_saida' <> 'null'::jsonb THEN
    IF v_old.pasto_saida IS NULL THEN
      RAISE EXCEPTION 'Este registro não tem avaliação de pasto de saída (a saída foi de curral)';
    END IF;
    IF (p_campos->>'avaliacao_saida')::int NOT BETWEEN 1 AND 5 THEN
      RAISE EXCEPTION 'Avaliação do pasto de saída deve estar entre 1 e 5';
    END IF;
  END IF;

  FOR v_campo IN SELECT jsonb_object_keys(p_campos) LOOP
    IF v_campo = ANY(v_campos_permitidos) THEN
      v_filtered := v_filtered || jsonb_build_object(v_campo, p_campos->v_campo);
    END IF;
  END LOOP;

  v_new := jsonb_populate_record(v_old, v_filtered);

  -- Data nova: reajusta o histórico de ocupação (ou recusa com mensagem clara)
  IF v_new.data IS DISTINCT FROM v_old.data THEN
    v_hist := public._corrigir_historico_movimento_pastagem(v_old, v_new.data);
  END IF;

  UPDATE public.registros_pastagens
  SET data = v_new.data,
      avaliacao_saida = v_new.avaliacao_saida,
      escore_gado = v_new.escore_gado,
      escore_fezes = v_new.escore_fezes,
      numero_pessoas_manejo = v_new.numero_pessoas_manejo,
      tempo_ocupacao = COALESCE(v_hist->>'tempo_ocupacao', tempo_ocupacao),
      tempo_vedacao = COALESCE(v_hist->>'tempo_vedacao', tempo_vedacao),
      updated_at = now()
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
  RETURNING * INTO v_new;

  RETURN v_new;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.editar_registro_pastagens(uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_registro_pastagens(uuid, uuid, uuid, text, jsonb) TO authenticated, service_role;
