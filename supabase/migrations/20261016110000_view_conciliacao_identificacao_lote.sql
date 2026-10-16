-- ============================================================================
-- Indivíduos / Fase 1.3: conciliação identificados × agregado, por lote e categoria
-- ============================================================================
-- O indivíduo é um SUBCONJUNTO do agregado: identificados <= quant_atual por lote/categoria; o resto é "não
-- identificado". Divergência (identificados > quant_atual) é sinalizada, nunca bloqueia a operação.
--   * vw_lote_categoria_identificacao: uma linha por lote_categoria ativa (lotes ativos), com
--     quant_atual, identificados (Vivo, categoria canônica = a do lote), incertos (localização incerta),
--     nao_identificados e divergencia. Somente leitura; não altera nenhum cálculo existente.
--   * vw_individuos_sem_categoria_resolvida: animais Vivos cujo lote/categoria não casa com nenhuma categoria
--     ativa do lote (categoria sem alias, como 'Tropa', ou categoria que o lote não tem). Fila de pendências.
--     Animais sem lote não entram aqui: ainda não foram alocados.
-- security_invoker: as views respeitam a RLS de quem consulta. anon sem acesso.
-- Rollback: supabase/rollbacks/20261016110000_view_conciliacao_identificacao_lote_rollback.sql
-- ============================================================================

CREATE OR REPLACE VIEW public.vw_lote_categoria_identificacao
WITH (security_invoker = true) AS
WITH ident AS (
  SELECT i.lote_atual AS lote_id,
         public.categoria_canonica(i.categoria) AS categoria,
         count(*)::integer AS identificados,
         count(*) FILTER (WHERE i.localizacao_incerta_desde IS NOT NULL)::integer AS incertos
  FROM public.individuos i
  WHERE i.deleted_at IS NULL AND i.status = 'Vivo' AND i.lote_atual IS NOT NULL
  GROUP BY 1, 2
)
SELECT lc.id AS lote_categoria_id,
       l.fazenda_id,
       lc.lote_id,
       l.nome AS lote_nome,
       lc.categoria,
       COALESCE(lc.quant_atual, 0) AS quant_atual,
       COALESCE(d.identificados, 0) AS identificados,
       COALESCE(d.incertos, 0) AS incertos,
       GREATEST(COALESCE(lc.quant_atual, 0) - COALESCE(d.identificados, 0), 0) AS nao_identificados,
       COALESCE(d.identificados, 0) > COALESCE(lc.quant_atual, 0) AS divergencia
FROM public.lote_categorias lc
JOIN public.lotes l ON l.id = lc.lote_id
LEFT JOIN ident d ON d.lote_id = lc.lote_id AND d.categoria = lower(btrim(lc.categoria))
WHERE lc.ativo = true AND l.ativo = true;

CREATE OR REPLACE VIEW public.vw_individuos_sem_categoria_resolvida
WITH (security_invoker = true) AS
SELECT i.id AS individuo_id,
       i.fazenda_id,
       i.lote_atual AS lote_id,
       i.categoria,
       public.categoria_canonica(i.categoria) AS categoria_canonica,
       CASE WHEN public.categoria_canonica(i.categoria) IS NULL THEN 'categoria sem equivalente no domínio'
            ELSE 'o lote não tem essa categoria ativa' END AS motivo
FROM public.individuos i
WHERE i.deleted_at IS NULL AND i.status = 'Vivo' AND i.lote_atual IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.lote_categorias lc
    WHERE lc.lote_id = i.lote_atual AND lc.ativo = true
      AND lower(btrim(lc.categoria)) = public.categoria_canonica(i.categoria)
  );

REVOKE ALL ON public.vw_lote_categoria_identificacao, public.vw_individuos_sem_categoria_resolvida FROM anon;
GRANT SELECT ON public.vw_lote_categoria_identificacao, public.vw_individuos_sem_categoria_resolvida TO authenticated;
