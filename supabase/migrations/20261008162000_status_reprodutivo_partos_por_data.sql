-- ============================================================================
-- Indivíduos / Fase 4a (acompanhamento): partos gemelares contam como um parto em v_status_reprodutivo
-- ============================================================================
-- Achado no teste com a BR-042 (19 registros de maternidade): duas crias no mesmo dia viravam dois partos e o
-- intervalo_entre_partos_dias dava 0. Agora o último parto e o anterior são DATAS distintas.
-- Só a CTE `partos` muda; as colunas da view são as mesmas. Sem impacto em dados, PWA ou painel.
-- Rollback: supabase/rollbacks/20261008162000_status_reprodutivo_partos_por_data_rollback.sql
-- ============================================================================

CREATE OR REPLACE VIEW public.v_status_reprodutivo
WITH (security_invoker = true) AS
WITH hoje AS (
  SELECT (now() AT TIME ZONE 'America/Cuiaba')::date AS d
),
partos AS (
  -- Partos da mãe biológica por DATA distinta: gêmeos (duas crias no mesmo dia) são um só parto, senão o
  -- intervalo entre partos daria 0. Aborto registrado na maternidade não conta como parto.
  SELECT x.individuo_id, x.data,
         row_number() OVER (PARTITION BY x.individuo_id ORDER BY x.data DESC) AS rn
  FROM (
    SELECT DISTINCT r.individuo_id_mae AS individuo_id,
           (r.data AT TIME ZONE 'America/Cuiaba')::date AS data
    FROM public.registros_maternidade r
    WHERE r.deleted_at IS NULL
      AND r.individuo_id_mae IS NOT NULL
      AND NOT (COALESCE(r.tipo_parto, '[]'::jsonb) ? 'Aborto')
  ) x
),
femeas AS (
  SELECT i.id AS individuo_id, i.fazenda_id, i.id_brinco, i.id_chip, i.id_manejo, i.categoria, i.lote_atual,
         (SELECT p.data FROM partos p WHERE p.individuo_id = i.id AND p.rn = 1) AS ultimo_parto,
         (SELECT p.data FROM partos p WHERE p.individuo_id = i.id AND p.rn = 2) AS parto_anterior,
         (SELECT max(e.data) FROM public.eventos_reprodutivos e
           WHERE e.individuo_id = i.id AND e.tipo = 'Aborto' AND e.deleted_at IS NULL) AS ultimo_aborto
  FROM public.individuos i
  WHERE i.deleted_at IS NULL AND i.sexo = 'Fêmea' AND i.status = 'Vivo'
),
base AS (
  -- GREATEST ignora NULL: o marco é o mais recente entre o último parto e o último aborto
  SELECT f.*, GREATEST(f.ultimo_parto, f.ultimo_aborto) AS marco FROM femeas f
),
calc AS (
  SELECT b.*,
         cob.id AS cob_id, cob.data AS cob_data, cob.tipo AS cob_tipo, cob.estacao_id AS cob_estacao_id,
         COALESCE(cob.touro_nome, t.id_brinco, t.id_manejo) AS cob_touro,
         dg.data AS dg_data, dg.resultado AS dg_resultado, dg.idade_gestacao_dias AS dg_idade
  FROM base b
  LEFT JOIN LATERAL (
    SELECT e.* FROM public.eventos_reprodutivos e
    WHERE e.individuo_id = b.individuo_id AND e.deleted_at IS NULL
      AND e.tipo IN ('Cobertura', 'Inseminação') AND (b.marco IS NULL OR e.data > b.marco)
    ORDER BY e.data DESC, e.created_at DESC LIMIT 1
  ) cob ON true
  LEFT JOIN public.individuos t ON t.id = cob.touro_id
  LEFT JOIN LATERAL (
    SELECT e.* FROM public.eventos_reprodutivos e
    WHERE e.individuo_id = b.individuo_id AND e.deleted_at IS NULL
      AND e.tipo = 'Diagnóstico de gestação' AND (b.marco IS NULL OR e.data > b.marco)
    ORDER BY e.data DESC, e.created_at DESC LIMIT 1
  ) dg ON true
),
s AS (
  SELECT c.*,
         CASE
           -- diagnóstico é o fato mais recente (ou não há cobertura depois dele)
           WHEN c.dg_data IS NOT NULL AND (c.cob_data IS NULL OR c.dg_data >= c.cob_data) THEN
             CASE c.dg_resultado
               WHEN 'Prenha' THEN 'Prenha'
               WHEN 'Vazia' THEN 'Vazia'
               ELSE CASE WHEN c.cob_data IS NOT NULL THEN 'Coberta' ELSE 'Sem registro' END
             END
           WHEN c.cob_data IS NOT NULL THEN 'Coberta'
           WHEN c.marco IS NOT NULL THEN CASE WHEN c.ultimo_aborto IS NOT DISTINCT FROM c.marco THEN 'Vazia' ELSE 'Parida' END
           ELSE 'Sem registro'
         END AS status_reprodutivo
  FROM calc c
)
SELECT
  s.individuo_id, s.fazenda_id, s.id_brinco, s.id_chip, s.id_manejo, s.categoria, s.lote_atual,
  s.status_reprodutivo,
  s.ultimo_parto,
  s.parto_anterior,
  (s.ultimo_parto - s.parto_anterior) AS intervalo_entre_partos_dias,
  (h.d - s.ultimo_parto) AS dias_desde_ultimo_parto,
  s.ultimo_aborto,
  s.cob_id AS ultima_cobertura_id,
  s.cob_data AS ultima_cobertura_data,
  s.cob_tipo AS ultima_cobertura_tipo,
  s.cob_touro AS ultima_cobertura_touro,
  s.cob_estacao_id AS ultima_cobertura_estacao_id,
  (h.d - s.cob_data) AS dias_desde_cobertura,
  s.dg_data AS ultimo_diagnostico_data,
  s.dg_resultado AS ultimo_diagnostico_resultado,
  CASE s.status_reprodutivo
    WHEN 'Prenha' THEN COALESCE(s.cob_data + public.gestacao_dias_padrao(), s.dg_data - s.dg_idade + public.gestacao_dias_padrao())
    WHEN 'Coberta' THEN s.cob_data + public.gestacao_dias_padrao()
  END AS previsao_parto,
  (s.status_reprodutivo = 'Prenha') AS previsao_confirmada
FROM s CROSS JOIN hoje h;
