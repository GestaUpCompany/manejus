-- ============================================================================
-- Sanidade S1: histórico sanitário unificado por animal (somente leitura)
-- ============================================================================
-- Une, por animal: aplicações sanitárias (com carência), enfermaria (medicamentos do JSON) e maternidade (medicamentos da mãe).
-- Sem backfill e sem alterar nenhuma tabela. security_invoker: a RLS das tabelas de origem vale para quem consulta.
-- Colunas: individuo_id, fazenda_id, data (date, fuso Cuiabá), origem ('aplicacao','enfermaria','maternidade'), origem_id,
--   tipo, medicamento_nome, principio_ativo, dose, diagnostico, liberacao_abate_em, proxima_aplicacao_em.
-- Rollback: supabase/rollbacks/20261016280000_view_historico_sanitario_individuo_rollback.sql
-- ============================================================================

CREATE OR REPLACE VIEW public.v_historico_sanitario_individuo
WITH (security_invoker = true) AS
SELECT a.individuo_id, a.fazenda_id, a.data, 'aplicacao'::text AS origem, a.id AS origem_id, a.tipo,
       a.medicamento_nome, a.principio_ativo, a.dose_aplicada AS dose, a.diagnostico,
       a.liberacao_abate_em, a.proxima_aplicacao_em
FROM public.aplicacoes_sanitarias a
WHERE a.deleted_at IS NULL AND a.individuo_id IS NOT NULL
UNION ALL
SELECT e.individuo_id, e.fazenda_id, (e.data AT TIME ZONE 'America/Cuiaba')::date, 'enfermaria', e.id,
       COALESCE(NULLIF(btrim(e.tipo_registro), ''), 'Tratamento'),
       COALESCE(m->>'nomeComercial', 'Sem medicamento'), m->>'principioAtivo', m->>'doseAplicada',
       CASE WHEN jsonb_typeof(e.diagnosticos) = 'array'
            THEN (SELECT string_agg(d, ', ') FROM jsonb_array_elements_text(e.diagnosticos) d) END,
       NULL::date, NULL::date
FROM public.registros_enfermaria e
LEFT JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(e.medicamentos) = 'array' AND jsonb_array_length(e.medicamentos) > 0 THEN e.medicamentos ELSE '[null]'::jsonb END
) m ON true
WHERE e.deleted_at IS NULL AND e.individuo_id IS NOT NULL
UNION ALL
SELECT r.individuo_id_mae, r.fazenda_id, (r.data AT TIME ZONE 'America/Cuiaba')::date, 'maternidade', r.id, 'Parto',
       COALESCE(m->>'nomeComercial', m->>'nome', 'Medicamento'), m->>'principioAtivo', m->>'doseAplicada',
       NULL, NULL::date, NULL::date
FROM public.registros_maternidade r
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.medicamentos) = 'array' THEN r.medicamentos ELSE '[]'::jsonb END) m
WHERE r.deleted_at IS NULL AND r.individuo_id_mae IS NOT NULL;

REVOKE ALL ON public.v_historico_sanitario_individuo FROM anon;
GRANT SELECT ON public.v_historico_sanitario_individuo TO authenticated;
