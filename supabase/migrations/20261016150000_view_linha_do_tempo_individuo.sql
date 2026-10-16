-- ============================================================================
-- Indivíduos / Fase 1.5: linha do tempo do animal
-- ============================================================================
-- View somente leitura que une, por animal, tudo o que já é registrado em tabelas separadas:
--   cadastro | pesagem | movimentacao (do próprio animal) | movimentacao_grupo (via evento_individuos)
--   | parto_mae | nascimento | parto_adotiva | morte | reprodutivo (cobertura, IA, diagnóstico, aborto)
-- Colunas: individuo_id, fazenda_id, data, tipo, titulo, detalhe, origem_tabela, origem_id.
-- Não duplica dado: cada linha aponta para o registro de origem. security_invoker (respeita a RLS de quem consulta);
-- anon sem acesso. Registros estornados/excluídos (deleted_at) não aparecem.
-- Rollback: supabase/rollbacks/20261016150000_view_linha_do_tempo_individuo_rollback.sql
-- ============================================================================

CREATE OR REPLACE VIEW public.vw_individuo_linha_do_tempo
WITH (security_invoker = true) AS
SELECT i.id AS individuo_id, i.fazenda_id, i.created_at AS data, 'cadastro'::text AS tipo,
       'Cadastro no sistema'::text AS titulo,
       NULLIF(concat_ws(' · ', i.origem, i.categoria), '') AS detalhe,
       'individuos'::text AS origem_tabela, i.id AS origem_id
FROM public.individuos i
WHERE i.deleted_at IS NULL

UNION ALL
SELECT p.individuo_id, p.fazenda_id, p.data, 'pesagem',
       'Pesagem' || COALESCE(': ' || trim(to_char(p.peso_kg, 'FM999999990.##')) || ' kg', ''),
       NULLIF(concat_ws(' · ', p.tipo_manejo, p.lote), ''),
       'registros_pesagem', p.id
FROM public.registros_pesagem p
WHERE p.deleted_at IS NULL AND p.individuo_id IS NOT NULL

UNION ALL
SELECT m.individuo_id, m.fazenda_id, m.data, 'movimentacao',
       concat_ws(' · ', m.motivo_movimentacao::text, m.subtipo),
       NULLIF(concat_ws(' · ', m.categoria, m.causa_observacao), ''),
       'registros_movimentacao', m.id
FROM public.registros_movimentacao m
WHERE m.deleted_at IS NULL AND m.individuo_id IS NOT NULL

UNION ALL
SELECT e.individuo_id, e.fazenda_id, m.data, 'movimentacao_grupo',
       'Movimentação em grupo (' || m.numero_cabecas || ' cab.)',
       concat_ws(' ', COALESCE(lo.nome, '?'), '→', COALESCE(ld.nome, '?'), '· ' || m.categoria),
       'registros_movimentacao', m.id
FROM public.evento_individuos e
JOIN public.registros_movimentacao m ON m.id = e.evento_id AND m.deleted_at IS NULL
LEFT JOIN public.lotes lo ON lo.id = m.lote_origem_id
LEFT JOIN public.lotes ld ON ld.id = m.lote_destino_id

UNION ALL
SELECT r.individuo_id_mae, r.fazenda_id, r.data, 'parto_mae', 'Parto',
       NULLIF(concat_ws(' · ', r.sexo, CASE WHEN r.peso_cria_kg IS NOT NULL THEN trim(to_char(r.peso_cria_kg, 'FM999990.##')) || ' kg' END), ''),
       'registros_maternidade', r.id
FROM public.registros_maternidade r
WHERE r.deleted_at IS NULL AND r.individuo_id_mae IS NOT NULL

UNION ALL
SELECT r.individuo_id_cria, r.fazenda_id, r.data, 'nascimento', 'Nascimento',
       NULLIF(concat_ws(' · ', r.sexo, CASE WHEN r.peso_cria_kg IS NOT NULL THEN trim(to_char(r.peso_cria_kg, 'FM999990.##')) || ' kg' END), ''),
       'registros_maternidade', r.id
FROM public.registros_maternidade r
WHERE r.deleted_at IS NULL AND r.individuo_id_cria IS NOT NULL

UNION ALL
SELECT r.individuo_id_mae_adotiva, r.fazenda_id, r.data, 'parto_adotiva', 'Mãe adotiva de uma cria', NULL::text,
       'registros_maternidade', r.id
FROM public.registros_maternidade r
WHERE r.deleted_at IS NULL AND r.individuo_id_mae_adotiva IS NOT NULL

UNION ALL
SELECT mo.individuo_id, mo.fazenda_id, mo.data, 'morte', 'Morte',
       NULLIF(concat_ws(' · ', mo.causa_morte, mo.lote), ''),
       'registros_morte', mo.id
FROM public.registros_morte mo
WHERE mo.deleted_at IS NULL AND mo.individuo_id IS NOT NULL

UNION ALL
SELECT ev.individuo_id, ev.fazenda_id, (ev.data::timestamp AT TIME ZONE 'America/Cuiaba'), 'reprodutivo',
       ev.tipo || COALESCE(': ' || ev.resultado, ''),
       NULLIF(concat_ws(' · ', ev.touro_nome, ev.observacao), ''),
       'eventos_reprodutivos', ev.id
FROM public.eventos_reprodutivos ev
WHERE ev.deleted_at IS NULL;

REVOKE ALL ON public.vw_individuo_linha_do_tempo FROM anon;
GRANT SELECT ON public.vw_individuo_linha_do_tempo TO authenticated;
