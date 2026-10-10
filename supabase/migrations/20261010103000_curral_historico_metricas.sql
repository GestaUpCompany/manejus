-- Historico de ocupacao de curral, Fase 2: hora, cabecas e peso de entrada e saida + view
--
-- lote_curral_historico so tinha datas (data_inicial/data_final) e o feed target do dia 1.
-- Para o historico ocupacional de curral ter o mesmo nivel de informacao do de pasto
-- (lote_pasto_historico), ganha: data_hora_entrada/saida, cabecas e peso medio do lote na
-- entrada e na saida. Sem taxa de lotacao (UA/ha), meta nem desvio: currais nao tem area
-- util nem meta cadastradas.
--
-- Aditivo e retrocompativel: colunas anulaveis, nenhum leitor atual muda (PWA e painel leem
-- data_inicial/data_final). Linhas antigas recebem so as horas (derivadas das datas); cabecas
-- e peso ficam nulos porque o historico de saldo nao existe.
--
-- Conteudo:
-- 1. Colunas novas + backfill das horas
-- 2. Trigger BEFORE trg_lch_metricas: preenche entrada/saida (hora, cabecas, peso) automaticamente
-- 3. View v_historico_ocupacao_curral (mesmas colunas de v_historico_ocupacao_pasto no que se aplica)
--
-- Rollback: supabase/rollbacks/20261010103000_curral_historico_metricas_rollback.sql

-- ============================================================================
-- 1. Colunas + backfill
-- ============================================================================

ALTER TABLE public.lote_curral_historico
  ADD COLUMN IF NOT EXISTS data_hora_entrada timestamptz,
  ADD COLUMN IF NOT EXISTS data_hora_saida timestamptz,
  ADD COLUMN IF NOT EXISTS cabecas_entrada integer,
  ADD COLUMN IF NOT EXISTS peso_vivo_medio_entrada_kg numeric,
  ADD COLUMN IF NOT EXISTS cabecas_saida integer,
  ADD COLUMN IF NOT EXISTS peso_vivo_medio_saida_kg numeric;

COMMENT ON COLUMN public.lote_curral_historico.data_hora_entrada IS
  'Momento em que o lote entrou no curral (hora do registro de troca; linhas antigas: inicio do dia de data_inicial no fuso da fazenda)';
COMMENT ON COLUMN public.lote_curral_historico.data_hora_saida IS
  'Momento em que o lote saiu do curral (linhas antigas: inicio do dia seguinte a data_final no fuso da fazenda); nulo enquanto aberta';

-- Backfill das horas a partir das datas (o trigger da secao 2 ainda nao existe aqui).
UPDATE public.lote_curral_historico h
   SET data_hora_entrada = (h.data_inicial::timestamp AT TIME ZONE COALESCE(f.timezone, 'America/Cuiaba')),
       data_hora_saida = CASE
         WHEN h.data_final IS NOT NULL
           THEN ((h.data_final + 1)::timestamp AT TIME ZONE COALESCE(f.timezone, 'America/Cuiaba'))
         ELSE NULL
       END
  FROM public.fazendas f
 WHERE f.id = h.fazenda_id
   AND h.data_hora_entrada IS NULL;

CREATE INDEX IF NOT EXISTS idx_lote_curral_historico_entrada
  ON public.lote_curral_historico (data_hora_entrada DESC);

-- ============================================================================
-- 2. Trigger BEFORE: entrada e saida preenchidas automaticamente
-- ============================================================================
-- Todo escritor de ocupacao (trigger de currais, RPCs de troca, registros de curral do PWA)
-- ganha hora/cabecas/peso sem precisar saber disso. So preenche o que estiver nulo, entao
-- quem sabe a hora exata (registro do peao) pode sobrescrever depois.

CREATE OR REPLACE FUNCTION public.trg_lch_metricas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_tz text;
  v_hoje date;
BEGIN
  SELECT COALESCE(f.timezone, 'America/Cuiaba') INTO v_tz
    FROM public.fazendas f
   WHERE f.id = NEW.fazenda_id;
  v_tz := COALESCE(v_tz, 'America/Cuiaba');
  v_hoje := (now() AT TIME ZONE v_tz)::date;

  IF TG_OP = 'INSERT' THEN
    IF NEW.data_hora_entrada IS NULL THEN
      NEW.data_hora_entrada := CASE
        WHEN NEW.data_inicial = v_hoje THEN now()
        ELSE (NEW.data_inicial::timestamp AT TIME ZONE v_tz)
      END;
    END IF;
    IF NEW.cabecas_entrada IS NULL THEN
      NEW.cabecas_entrada := public.calcular_cabecas_lote(NEW.lote_id);
    END IF;
    IF NEW.peso_vivo_medio_entrada_kg IS NULL THEN
      NEW.peso_vivo_medio_entrada_kg := public.calcular_peso_medio_lote(NEW.lote_id);
    END IF;
    IF NEW.data_final IS NOT NULL AND NEW.data_hora_saida IS NULL THEN
      NEW.data_hora_saida := ((NEW.data_final + 1)::timestamp AT TIME ZONE v_tz);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.data_final IS NULL AND NEW.data_final IS NOT NULL THEN
      -- Encerramento: registra o saldo do lote no momento da saida.
      IF NEW.data_hora_saida IS NULL THEN
        NEW.data_hora_saida := now();
      END IF;
      IF NEW.cabecas_saida IS NULL THEN
        NEW.cabecas_saida := public.calcular_cabecas_lote(NEW.lote_id);
      END IF;
      IF NEW.peso_vivo_medio_saida_kg IS NULL THEN
        NEW.peso_vivo_medio_saida_kg := public.calcular_peso_medio_lote(NEW.lote_id);
      END IF;
    ELSIF OLD.data_final IS NOT NULL AND NEW.data_final IS NULL THEN
      -- Reabertura: a saida deixa de valer.
      NEW.data_hora_saida := NULL;
      NEW.cabecas_saida := NULL;
      NEW.peso_vivo_medio_saida_kg := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lch_metricas ON public.lote_curral_historico;
CREATE TRIGGER trg_lch_metricas
  BEFORE INSERT OR UPDATE ON public.lote_curral_historico
  FOR EACH ROW EXECUTE FUNCTION public.trg_lch_metricas();

-- ============================================================================
-- 3. View do historico de ocupacao por curral
-- ============================================================================
-- Mesmas colunas de v_historico_ocupacao_pasto no que faz sentido para curral; meta, desvio
-- e taxa de lotacao saem nulos (currais nao tem area util nem meta), o que mantem o contrato
-- de colunas para a tela do painel. periodo_ocupacao_* so existe com a ocupacao encerrada.

CREATE OR REPLACE VIEW public.v_historico_ocupacao_curral
WITH (security_invoker = true) AS
SELECT
  h.id AS historico_id,
  h.lote_id,
  l.nome AS lote_nome,
  h.curral_id,
  c.nome AS curral_nome,
  c.linha_id,
  h.data_hora_entrada,
  h.data_hora_saida,
  h.cabecas_entrada,
  h.peso_vivo_medio_entrada_kg,
  h.cabecas_saida,
  h.peso_vivo_medio_saida_kg,
  NULL::integer AS meta_intervalo_ocupacao_dias,
  NULL::numeric AS desvio_tempo_ocupacao_percent,
  NULL::numeric AS taxa_lotacao_ua_ha,
  CASE WHEN h.data_hora_saida IS NOT NULL
       THEN round((EXTRACT(EPOCH FROM (h.data_hora_saida - h.data_hora_entrada)) / 86400.0)::numeric, 2)
  END AS periodo_ocupacao_dias,
  CASE WHEN h.data_hora_saida IS NOT NULL
       THEN round((EXTRACT(EPOCH FROM (h.data_hora_saida - h.data_hora_entrada)) / 3600.0)::numeric, 2)
  END AS periodo_ocupacao_horas
FROM public.lote_curral_historico h
JOIN public.lotes l ON l.id = h.lote_id
JOIN public.currais c ON c.id = h.curral_id
ORDER BY h.data_hora_entrada DESC;

REVOKE ALL ON public.v_historico_ocupacao_curral FROM PUBLIC, anon;
GRANT SELECT ON public.v_historico_ocupacao_curral TO authenticated;
