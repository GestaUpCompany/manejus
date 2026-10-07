-- Pendências de devolução do almoxarifado independentes do controle de estoque.
--
-- Antes: a RPC calculava o "devolvido" só por movimentacoes_almoxarifado, e o
-- trigger só cria movimentação para itens com controla_estoque = true. Para os
-- demais itens (a maioria do catálogo) a devolução era registrada mas a
-- pendência nunca fechava.
--
-- Agora: itens controlados continuam abatendo por movimentações aprovadas (que
-- respeitam revisão/aprovação manual); itens NÃO controlados abatem pelas
-- quantidades das próprias devoluções em registros_almoxarifado (vinculadas por
-- retiradaId/retiradaItemIndex ou agregadas por pessoa+item), sem criar
-- movimentação de estoque.
--
-- A RPC também passa a exigir vínculo ativo com a fazenda (era SECURITY DEFINER
-- sem checagem e retornava dados de qualquer fazenda).

CREATE OR REPLACE FUNCTION public.get_itens_pendentes_devolucao(p_fazenda_id uuid, p_quem_pegou text DEFAULT NULL)
RETURNS TABLE(item_id uuid, item_nome text, unidade text, retirada_id uuid, retirada_item_index integer,
              quantidade_pendente numeric, prazo_devolucao text, quem_pegou text) AS $$
BEGIN
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Sem acesso à fazenda' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT r.id AS rid, (x.idx - 1)::integer AS ridx, ia.id AS iid, ia.nome AS inome, ia.unidade AS iun,
           ia.controla_estoque AS ctrl,
           CASE WHEN COALESCE(x.value->>'quantidade','') ~ '^\d+([.,]\d+)?$'
                THEN REPLACE(x.value->>'quantidade', ',', '.')::numeric ELSE 0 END AS qty,
           x.value->>'prazoDevolucao' AS prazo, r.quem_pegou AS qp, r.data
    FROM public.registros_almoxarifado r
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.itens, '[]'::jsonb)) WITH ORDINALITY x(value, idx)
    JOIN public.itens_almoxarifado ia ON ia.id::text = x.value->>'itemId'
    WHERE r.fazenda_id = p_fazenda_id AND COALESCE(r.tipo, 'retirada') = 'retirada' AND r.deleted_at IS NULL
      AND x.value->>'necessitaDevolucao' = 'S' AND (p_quem_pegou IS NULL OR r.quem_pegou = p_quem_pegou)
  ),
  -- Devoluções de itens NÃO controlados: lidas dos registros (sem movimentação)
  dev_nc AS (
    SELECT x.value->>'itemId' AS iid_txt, d.quem_pegou AS qp,
           NULLIF(x.value->>'retiradaId', '') AS rid_txt,
           CASE WHEN COALESCE(x.value->>'retiradaItemIndex','') ~ '^\d+$' THEN (x.value->>'retiradaItemIndex')::integer END AS ridx,
           CASE WHEN COALESCE(x.value->>'quantidade','') ~ '^\d+([.,]\d+)?$'
                THEN REPLACE(x.value->>'quantidade', ',', '.')::numeric ELSE 0 END AS q
    FROM public.registros_almoxarifado d
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(d.itens, '[]'::jsonb)) x(value)
    JOIN public.itens_almoxarifado ia ON ia.id::text = x.value->>'itemId' AND NOT ia.controla_estoque
    WHERE d.fazenda_id = p_fazenda_id AND d.tipo = 'devolucao' AND d.deleted_at IS NULL
      AND (p_quem_pegou IS NULL OR d.quem_pegou = p_quem_pegou)
  ),
  linked AS (
    SELECT b.*,
           GREATEST(0, b.qty
             - CASE WHEN b.ctrl THEN COALESCE((SELECT SUM(m.quantidade_aprovada) FROM public.movimentacoes_almoxarifado m
                        WHERE m.retirada_id = b.rid AND m.retirada_item_index = b.ridx
                          AND m.tipo_movimentacao = 'devolucao' AND m.deleted_at IS NULL), 0)
                    ELSE COALESCE((SELECT SUM(n.q) FROM dev_nc n
                        WHERE n.rid_txt = b.rid::text AND n.ridx = b.ridx), 0) END) AS out_i
    FROM base b
  ),
  unl AS (
    SELECT m.item_id AS iid, rd.quem_pegou AS qp, SUM(m.quantidade_aprovada) AS u
    FROM public.movimentacoes_almoxarifado m
    JOIN public.registros_almoxarifado rd ON rd.id = m.registro_origem_id
    WHERE m.fazenda_id = p_fazenda_id AND m.tipo_movimentacao = 'devolucao' AND m.retirada_id IS NULL AND m.deleted_at IS NULL
      AND (p_quem_pegou IS NULL OR rd.quem_pegou = p_quem_pegou)
    GROUP BY m.item_id, rd.quem_pegou
    UNION ALL
    SELECT n.iid_txt::uuid, n.qp, SUM(n.q)
    FROM dev_nc n
    WHERE n.rid_txt IS NULL OR n.ridx IS NULL
    GROUP BY n.iid_txt, n.qp
  ),
  unl_total AS (
    SELECT u.iid, u.qp, SUM(u.u) AS u FROM unl u GROUP BY u.iid, u.qp
  ),
  alloc AS (
    SELECT l.*, COALESCE(ut.u, 0) AS u,
           SUM(l.out_i) OVER (PARTITION BY l.iid, l.qp ORDER BY l.data, l.rid, l.ridx) AS cum
    FROM linked l LEFT JOIN unl_total ut ON ut.iid = l.iid AND ut.qp = l.qp
  )
  SELECT a.iid, a.inome, a.iun, a.rid, a.ridx,
         (GREATEST(0, a.cum - a.u) - GREATEST(0, a.cum - a.out_i - a.u)) AS pend,
         a.prazo, a.qp
  FROM alloc a
  WHERE (GREATEST(0, a.cum - a.u) - GREATEST(0, a.cum - a.out_i - a.u)) > 0
  ORDER BY a.data, a.inome;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_itens_pendentes_devolucao(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_itens_pendentes_devolucao(uuid, text) TO authenticated;
