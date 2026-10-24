-- Rollback de 20261024100000_lote_pasto_edicao_fecha_modulo.sql
-- Restaura as versoes anteriores de trg_lotes_pasto_historico (20260828150000) e
-- trg_sync_lote_modulo_historico (20260625190440).

CREATE OR REPLACE FUNCTION public.trg_lotes_pasto_historico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  -- Evita duplicar o historico gerado pelo PWA (disparado dentro de outro trigger)
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.pasto_id IS DISTINCT FROM OLD.pasto_id)) THEN
    -- Fechar registro aberto anterior, se houver (lote saindo de um pasto)
    IF TG_OP = 'UPDATE' THEN
      UPDATE public.lote_pasto_historico
      SET
        data_final = now()::date,
        data_hora_saida = now(),
        updated_at = now()
      WHERE lote_id = NEW.id
        AND data_hora_saida IS NULL;
    END IF;

    -- Abrir novo registro se o lote esta indo para um pasto
    IF NEW.pasto_id IS NOT NULL THEN
      INSERT INTO public.lote_pasto_historico (
        lote_id,
        pasto_id,
        modulo_id,
        data_inicial,
        data_hora_entrada
      )
      SELECT
        NEW.id,
        NEW.pasto_id,
        p.modulo_id,
        now()::date,
        now()
      FROM public.pastos p
      WHERE p.id = NEW.pasto_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

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

  v_cabecas := COALESCE(
    NEW.cabecas_entrada,
    (SELECT SUM(lc.quant_atual) FROM public.lote_categorias lc WHERE lc.lote_id = NEW.lote_id AND lc.quant_atual > 0)
  );

  v_peso := COALESCE(
    NEW.peso_vivo_medio_entrada_kg,
    public.calcular_peso_medio_lote(NEW.lote_id)
  );

  UPDATE public.lote_modulo_historico
  SET
    data_hora_saida          = NEW.data_hora_entrada,
    cabecas_saida            = v_cabecas,
    peso_vivo_medio_saida_kg = v_peso,
    taxa_lotacao_ua_ha       = public.calcular_taxa_lotacao_modulo(v_modulo_id)
  WHERE lote_id = NEW.lote_id
    AND modulo_id = v_modulo_id
    AND data_hora_saida IS NULL;

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
