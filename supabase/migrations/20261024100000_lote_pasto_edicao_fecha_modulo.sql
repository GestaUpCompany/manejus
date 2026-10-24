-- Edicao de lotes.pasto_id no Painel (tela de Lotes) passa a manter tambem lote_modulo_historico.
--
-- Problema: desde 0667da1 a tela so depende de trg_lotes_pasto_historico, que fecha e abre
-- lote_pasto_historico, mas nao mexe em lote_modulo_historico. Resultado: lote que sai de um
-- pasto de modulo (para outro modulo, para pasto sem modulo ou para curral) deixava o historico
-- de modulo aberto. Alem disso, trg_sync_lote_modulo_historico fechava e reabria o modulo mesmo
-- quando o pasto novo era do mesmo modulo, zerando a contagem de ocupacao.
--
-- Correcao:
--   1. trg_lotes_pasto_historico passa a fechar o modulo que o lote deixou e, se o pasto novo
--      tem modulo sem entrada aberta nele, abre a entrada. Mesma semantica da RPC antiga
--      sincronizar_historico_pasto_lote_edit (que continua existindo, sem uso).
--   2. As datas de pasto usam o fuso da fazenda (antes era now()::date, em UTC).
--   3. trg_sync_lote_modulo_historico respeita a flag app.skip_sync_lote_modulo (ja setada pela
--      RPC antiga, mas ignorada pelo trigger). O fluxo do PWA nao seta a flag: nada muda para ele.
--
-- Caminho do PWA (trg_registros_pastagens_mover_lote) e intocado: o trigger de pasto continua
-- ignorando execucao aninhada (pg_trigger_depth() > 1).
--
-- Rollback: supabase/rollbacks/20261024100000_lote_pasto_edicao_fecha_modulo_rollback.sql

-- ============================================================================
-- 1. trg_lotes_pasto_historico: pasto + modulo na edicao de lotes.pasto_id
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_lotes_pasto_historico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_tz text;
  v_hoje date;
  v_cabecas integer;
  v_peso numeric;
  v_modulo_novo_id uuid;
  v_meta_modulo integer;
BEGIN
  -- Evita duplicar o historico gerado pelo PWA (disparado dentro de outro trigger)
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NOT (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.pasto_id IS DISTINCT FROM OLD.pasto_id)) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(f.timezone, 'America/Cuiaba') INTO v_tz
    FROM public.fazendas f
   WHERE f.id = NEW.fazenda_id;
  v_hoje := (now() AT TIME ZONE COALESCE(v_tz, 'America/Cuiaba'))::date;

  v_cabecas := public.calcular_cabecas_lote(NEW.id);
  v_peso := public.calcular_peso_medio_lote(NEW.id);

  SELECT p.modulo_id INTO v_modulo_novo_id
    FROM public.pastos p
   WHERE p.id = NEW.pasto_id;

  IF TG_OP = 'UPDATE' THEN
    -- Fechar pasto aberto (lote saindo de um pasto)
    UPDATE public.lote_pasto_historico
       SET data_final = v_hoje,
           data_hora_saida = now(),
           cabecas_saida = v_cabecas,
           peso_vivo_medio_saida_kg = v_peso,
           updated_at = now()
     WHERE lote_id = NEW.id
       AND data_hora_saida IS NULL;

    -- Fechar modulo aberto que o lote deixou (outro modulo, sem modulo ou sem pasto)
    UPDATE public.lote_modulo_historico
       SET data_hora_saida = now(),
           cabecas_saida = v_cabecas,
           peso_vivo_medio_saida_kg = v_peso,
           updated_at = now()
     WHERE lote_id = NEW.id
       AND data_hora_saida IS NULL
       AND modulo_id IS DISTINCT FROM v_modulo_novo_id;
  END IF;

  IF NEW.pasto_id IS NOT NULL THEN
    -- Evita que trg_sync_lote_modulo_historico feche e reabra o modulo a cada troca de pasto
    PERFORM set_config('app.skip_sync_lote_modulo', 'true', true);

    INSERT INTO public.lote_pasto_historico (
      lote_id, pasto_id, modulo_id, data_inicial, data_hora_entrada,
      cabecas_entrada, peso_vivo_medio_entrada_kg, meta_intervalo_ocupacao_dias,
      created_at, updated_at
    )
    SELECT
      NEW.id, p.id, p.modulo_id, v_hoje, now(),
      v_cabecas, v_peso, p.meta_intervalo_ocupacao_dias,
      now(), now()
    FROM public.pastos p
    WHERE p.id = NEW.pasto_id;

    -- Modulo: so abre entrada se o lote ainda nao esta aberto nele (mesmo modulo nao reinicia)
    IF v_modulo_novo_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.lote_modulo_historico h
          WHERE h.lote_id = NEW.id
            AND h.modulo_id = v_modulo_novo_id
            AND h.data_hora_saida IS NULL
       ) THEN
      SELECT m.meta_intervalo_ocupacao_dias INTO v_meta_modulo
        FROM public.modulos_pastos m
       WHERE m.id = v_modulo_novo_id;

      INSERT INTO public.lote_modulo_historico (
        lote_id, modulo_id, data_hora_entrada,
        cabecas_entrada, peso_vivo_medio_entrada_kg,
        meta_intervalo_ocupacao_dias,
        created_at, updated_at
      )
      VALUES (
        NEW.id, v_modulo_novo_id, now(),
        v_cabecas, v_peso,
        v_meta_modulo,
        now(), now()
      );
    END IF;

    PERFORM set_config('app.skip_sync_lote_modulo', 'false', true);
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 2. trg_sync_lote_modulo_historico: respeita a flag de sincronizacao manual
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_sync_lote_modulo_historico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_modulo_id uuid;
  v_meta_dias integer;
  v_cabecas    integer;
  v_peso       numeric;
BEGIN
  -- Insercao feita por quem ja cuida do modulo (ex.: trg_lotes_pasto_historico): nada a fazer aqui
  IF current_setting('app.skip_sync_lote_modulo', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Buscar módulo ao qual o pasto pertence (se existir)
  SELECT rp.modulo_id, m.meta_intervalo_ocupacao_dias
  INTO v_modulo_id, v_meta_dias
  FROM public.rotacao_pastos rp
  JOIN public.modulos_pastos m ON m.id = rp.modulo_id
  WHERE rp.pasto_id = NEW.pasto_id
    AND rp.ativo = true
  LIMIT 1;

  IF v_modulo_id IS NULL THEN
    RETURN NEW; -- Pasto não pertence a módulo, nada a fazer
  END IF;

  -- Usar cabecas/peso do próprio registro de entrada se disponíveis,
  -- senão buscar de lote_categorias (mais atual)
  v_cabecas := COALESCE(
    NEW.cabecas_entrada,
    (SELECT SUM(lc.quant_atual) FROM public.lote_categorias lc WHERE lc.lote_id = NEW.lote_id AND lc.quant_atual > 0)
  );

  v_peso := COALESCE(
    NEW.peso_vivo_medio_entrada_kg,
    public.calcular_peso_medio_lote(NEW.lote_id)
  );

  -- Fechar entrada anterior no módulo se existir (lote saiu e entrou de novo)
  UPDATE public.lote_modulo_historico
  SET
    data_hora_saida          = NEW.data_hora_entrada,
    cabecas_saida            = v_cabecas,
    peso_vivo_medio_saida_kg = v_peso,
    taxa_lotacao_ua_ha       = public.calcular_taxa_lotacao_modulo(v_modulo_id)
  WHERE lote_id = NEW.lote_id
    AND modulo_id = v_modulo_id
    AND data_hora_saida IS NULL;

  -- Inserir nova entrada no módulo
  INSERT INTO public.lote_modulo_historico (
    lote_id,
    modulo_id,
    data_hora_entrada,
    cabecas_entrada,
    peso_vivo_medio_entrada_kg,
    meta_intervalo_ocupacao_dias
  ) VALUES (
    NEW.lote_id,
    v_modulo_id,
    NEW.data_hora_entrada,
    v_cabecas,
    v_peso,
    COALESCE(NEW.meta_intervalo_ocupacao_dias, v_meta_dias)
  );

  RETURN NEW;
END;
$$;
