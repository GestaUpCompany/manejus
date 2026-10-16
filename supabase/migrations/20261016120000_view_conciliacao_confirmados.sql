-- Ajusta vw_lote_categoria_identificacao (20261016110000): a divergência compara só os identificados CONFIRMADOS
-- no lote com o agregado. Animais de localização incerta podem já ter saído do lote por movimentação por contagem,
-- então não entram na comparação. Adiciona a coluna `confirmados` ao final (identificados - incertos).
-- Rollback: reaplicar a definição de 20261016110000.
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
       (COALESCE(d.identificados, 0) - COALESCE(d.incertos, 0)) > COALESCE(lc.quant_atual, 0) AS divergencia,
       COALESCE(d.identificados, 0) - COALESCE(d.incertos, 0) AS confirmados
FROM public.lote_categorias lc
JOIN public.lotes l ON l.id = lc.lote_id
LEFT JOIN ident d ON d.lote_id = lc.lote_id AND d.categoria = lower(btrim(lc.categoria))
WHERE lc.ativo = true AND l.ativo = true;
