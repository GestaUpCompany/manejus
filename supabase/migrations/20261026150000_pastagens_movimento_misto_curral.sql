-- Movimento misto pasto <-> curral na caderneta Pastagens (somente aditivo).
-- Pasto->pasto e curral->curral seguem pelos triggers existentes, intocados.
-- Movimento misto grava curral_*_id e passa pelo trigger novo abaixo. Os triggers
-- de exclusividade (20260730172316) exigem liberar a origem antes de ocupar o destino;
-- por isso cada ramo libera primeiro e ocupa depois, dentro de um sub-bloco com EXCEPTION
-- (rollback parcial se algo falhar). O registro nunca derruba o INSERT: grava movimentacao_status.

ALTER TABLE public.registros_pastagens
  ADD COLUMN IF NOT EXISTS curral_saida text,
  ADD COLUMN IF NOT EXISTS curral_saida_id uuid REFERENCES public.currais(id),
  ADD COLUMN IF NOT EXISTS curral_entrada text,
  ADD COLUMN IF NOT EXISTS curral_entrada_id uuid REFERENCES public.currais(id),
  ADD COLUMN IF NOT EXISTS movimentacao_status text,
  ADD COLUMN IF NOT EXISTS movimentacao_erro text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'registros_pastagens_movimentacao_status_check'
  ) THEN
    ALTER TABLE public.registros_pastagens
      ADD CONSTRAINT registros_pastagens_movimentacao_status_check
      CHECK (movimentacao_status IN ('aplicada', 'recusada', 'ignorada'));
  END IF;
END $$;

-- Trigger existente passa a cuidar só de movimento sem curral (comportamento inalterado).
DROP TRIGGER IF EXISTS trg_registros_pastagens_mover_lote ON public.registros_pastagens;
CREATE TRIGGER trg_registros_pastagens_mover_lote
  AFTER INSERT ON public.registros_pastagens
  FOR EACH ROW
  WHEN (NEW.curral_saida_id IS NULL AND NEW.curral_entrada_id IS NULL)
  EXECUTE FUNCTION public.processar_movimentacao_pastagem();

-- Fecha pasto e módulo abertos do lote (mesmos cálculos de saída do trigger de pasto).
CREATE OR REPLACE FUNCTION public._misto_fechar_ocupacao_pasto(p_lote_id uuid, p_data timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cabecas integer := public.calcular_cabecas_lote(p_lote_id);
  v_peso numeric := public.calcular_peso_medio_lote(p_lote_id);
BEGIN
  UPDATE public.lote_pasto_historico
  SET data_hora_saida = p_data,
      cabecas_saida = v_cabecas,
      peso_vivo_medio_saida_kg = v_peso,
      desvio_tempo_ocupacao_percent = CASE
        WHEN meta_intervalo_ocupacao_dias > 0 THEN
          ROUND(((EXTRACT(EPOCH FROM (p_data - data_hora_entrada)) / 86400.0 - meta_intervalo_ocupacao_dias)
          / meta_intervalo_ocupacao_dias * 100)::numeric, 2)
      END,
      updated_at = now()
  WHERE lote_id = p_lote_id AND data_hora_saida IS NULL;

  UPDATE public.lote_modulo_historico
  SET data_hora_saida = p_data,
      cabecas_saida = v_cabecas,
      peso_vivo_medio_saida_kg = v_peso,
      desvio_tempo_ocupacao_percent = CASE
        WHEN meta_intervalo_ocupacao_dias > 0 THEN
          ROUND(((EXTRACT(EPOCH FROM (p_data - data_hora_entrada)) / 86400.0 - meta_intervalo_ocupacao_dias)
          / meta_intervalo_ocupacao_dias * 100)::numeric, 2)
      END,
      updated_at = now()
  WHERE lote_id = p_lote_id AND data_hora_saida IS NULL;
END;
$$;

-- Abre pasto (e módulo, se houver) para o lote. Mesmos passos 2-5 do trigger de pasto.
CREATE OR REPLACE FUNCTION public._misto_ocupar_pasto(p_fazenda_id uuid, p_lote_id uuid, p_pasto_id uuid, p_data timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_modulo_id uuid;
  v_meta_pasto integer;
  v_meta_modulo integer;
  v_cabecas integer := public.calcular_cabecas_lote(p_lote_id);
  v_peso numeric := public.calcular_peso_medio_lote(p_lote_id);
BEGIN
  SELECT modulo_id, meta_intervalo_ocupacao_dias INTO v_modulo_id, v_meta_pasto
    FROM public.pastos WHERE id = p_pasto_id;
  SELECT meta_intervalo_ocupacao_dias INTO v_meta_modulo
    FROM public.modulos_pastos WHERE id = v_modulo_id;

  UPDATE public.lotes
  SET pasto_id = p_pasto_id, modulo_id = v_modulo_id, updated_at = now()
  WHERE id = p_lote_id;

  UPDATE public.individuos
  SET pasto_atual = p_pasto_id, updated_at = now()
  WHERE fazenda_id = p_fazenda_id AND lote_atual = p_lote_id;

  INSERT INTO public.lote_pasto_historico (
    lote_id, pasto_id, data_hora_entrada, data_hora_saida,
    cabecas_entrada, peso_vivo_medio_entrada_kg,
    modulo_id, meta_intervalo_ocupacao_dias, created_at, updated_at
  ) VALUES (
    p_lote_id, p_pasto_id, p_data, NULL,
    v_cabecas, v_peso, v_modulo_id, v_meta_pasto, now(), now()
  );

  IF v_modulo_id IS NOT NULL THEN
    INSERT INTO public.lote_modulo_historico (
      lote_id, modulo_id, data_hora_entrada,
      cabecas_entrada, peso_vivo_medio_entrada_kg,
      meta_intervalo_ocupacao_dias, created_at, updated_at
    ) VALUES (
      p_lote_id, v_modulo_id, p_data,
      v_cabecas, v_peso, v_meta_modulo, now(), now()
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._misto_fechar_ocupacao_pasto(uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._misto_ocupar_pasto(uuid, uuid, uuid, timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.processar_movimentacao_pastagem_misto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lote_id uuid;
  v_pasto_saida_id uuid;
  v_pasto_entrada_id uuid;
  v_status text;
  v_erro text;
  v_resultado jsonb;
  v_tz text;
  v_hoje date;
  v_dia date;
  v_instante timestamptz;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_pasto_saida_id := COALESCE(NEW.pasto_saida_id, (
    SELECT p.id FROM public.pastos p
     WHERE p.fazenda_id = NEW.fazenda_id AND p.nome = NEW.pasto_saida LIMIT 1));
  v_pasto_entrada_id := COALESCE(NEW.pasto_entrada_id, (
    SELECT p.id FROM public.pastos p
     WHERE p.fazenda_id = NEW.fazenda_id AND p.nome = NEW.pasto_entrada LIMIT 1));

  -- Lote: o informado; senão, o do curral de saída ou o do pasto de saída.
  v_lote_id := NEW.lote_id;
  IF v_lote_id IS NULL AND NEW.curral_saida_id IS NOT NULL THEN
    SELECT c.lote_id INTO v_lote_id FROM public.currais c
     WHERE c.id = NEW.curral_saida_id AND c.fazenda_id = NEW.fazenda_id;
  END IF;
  IF v_lote_id IS NULL AND v_pasto_saida_id IS NOT NULL THEN
    SELECT l.id INTO v_lote_id FROM public.lotes l
     WHERE l.pasto_id = v_pasto_saida_id AND l.fazenda_id = NEW.fazenda_id LIMIT 1;
  END IF;

  v_instante := LEAST(NEW.data, now());

  IF NEW.curral_saida_id IS NOT NULL AND NEW.curral_entrada_id IS NOT NULL THEN
    v_status := 'ignorada';
    v_erro := 'Movimento entre dois currais usa a aba Currais';

  ELSIF v_lote_id IS NULL THEN
    v_status := 'ignorada';
    v_erro := 'Lote não identificado';

  -- Curral -> Pasto
  ELSIF NEW.curral_saida_id IS NOT NULL AND v_pasto_entrada_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.currais c
       WHERE c.id = NEW.curral_saida_id AND c.fazenda_id = NEW.fazenda_id AND c.lote_id = v_lote_id
    ) THEN
      -- Registro defasado (offline): o lote já saiu do curral informado.
      v_status := 'recusada';
      v_erro := 'O lote não está mais no curral de saída informado';
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.pastos p WHERE p.id = v_pasto_entrada_id AND p.fazenda_id = NEW.fazenda_id
    ) THEN
      v_status := 'recusada';
      v_erro := 'Pasto de entrada não pertence à fazenda do registro';
    ELSE
      BEGIN
        UPDATE public.currais SET lote_id = NULL WHERE id = NEW.curral_saida_id;
        PERFORM public._misto_ocupar_pasto(NEW.fazenda_id, v_lote_id, v_pasto_entrada_id, v_instante);
        v_status := 'aplicada';
        v_erro := NULL;
      EXCEPTION WHEN OTHERS THEN
        v_status := 'recusada';
        v_erro := SQLERRM;
      END;
    END IF;

  -- Pasto -> Curral
  ELSIF v_pasto_saida_id IS NOT NULL AND NEW.curral_entrada_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.lotes l
       WHERE l.id = v_lote_id AND l.fazenda_id = NEW.fazenda_id AND l.pasto_id = v_pasto_saida_id
    ) THEN
      v_status := 'recusada';
      v_erro := 'O lote não está mais no pasto de saída informado';
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.currais c WHERE c.id = NEW.curral_entrada_id AND c.fazenda_id = NEW.fazenda_id
    ) THEN
      v_status := 'recusada';
      v_erro := 'Curral de entrada não pertence à fazenda do registro';
    ELSE
      SELECT COALESCE(f.timezone, 'America/Cuiaba') INTO v_tz
        FROM public.fazendas f WHERE f.id = NEW.fazenda_id;
      v_tz := COALESCE(v_tz, 'America/Cuiaba');
      v_hoje := (now() AT TIME ZONE v_tz)::date;
      v_dia := LEAST((NEW.data AT TIME ZONE v_tz)::date, v_hoje);

      BEGIN
        PERFORM public._misto_fechar_ocupacao_pasto(v_lote_id, v_instante);
        UPDATE public.individuos SET pasto_atual = NULL, updated_at = now()
         WHERE fazenda_id = NEW.fazenda_id AND lote_atual = v_lote_id;
        UPDATE public.lotes SET pasto_id = NULL, modulo_id = NULL, updated_at = now()
         WHERE id = v_lote_id;

        v_resultado := public._ocupar_curral(NEW.curral_entrada_id, v_lote_id, v_dia, NULL, v_instante);
        IF NOT COALESCE((v_resultado->>'success')::boolean, false) THEN
          RAISE EXCEPTION '%', COALESCE(v_resultado->>'error', 'Curral de entrada indisponível');
        END IF;
        v_status := 'aplicada';
        v_erro := NULL;
      EXCEPTION WHEN OTHERS THEN
        v_status := 'recusada';
        v_erro := SQLERRM;
      END;
    END IF;

  ELSE
    v_status := 'ignorada';
    v_erro := 'Movimento sem origem e destino válidos';
  END IF;

  UPDATE public.registros_pastagens
     SET lote_id = COALESCE(lote_id, v_lote_id),
         movimentacao_status = v_status,
         movimentacao_erro = v_erro
   WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_registros_pastagens_movimento_misto ON public.registros_pastagens;
CREATE TRIGGER trg_registros_pastagens_movimento_misto
  AFTER INSERT ON public.registros_pastagens
  FOR EACH ROW
  WHEN (NEW.curral_saida_id IS NOT NULL OR NEW.curral_entrada_id IS NOT NULL)
  EXECUTE FUNCTION public.processar_movimentacao_pastagem_misto();
