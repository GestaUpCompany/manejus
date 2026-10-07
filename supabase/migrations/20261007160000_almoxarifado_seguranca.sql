-- Endurecimento de segurança do almoxarifado (auditoria 2026-10-07).
--
-- 1) Funções internas SECURITY DEFINER (saldo/reprocessamento/recálculo) eram
--    executáveis por PUBLIC/anon via RPC. Só os triggers (que rodam como dono)
--    as usam, então perdem o EXECUTE de todos os papéis de API.
--    get_itens_pendentes_devolucao continua com GRANT a authenticated e agora
--    valida vínculo com a fazenda (migration 20261007150000).
-- 2) registros_almoxarifado tinha uma policy ALL para qualquer vínculo da fazenda
--    (inclusive peão): apagar/reescrever registros antigos reescreve o estoque via
--    trigger. SELECT/INSERT/UPDATE seguem para o vínculo ativo (o sync do PWA faz
--    upsert); DELETE passa a ser só admin/controller.
-- 3) anon perde todos os privilégios da tabela e TRUNCATE sai também de
--    authenticated (TRUNCATE não passa por RLS).

REVOKE EXECUTE ON FUNCTION public.saldo_devolvivel_agregado(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.saldo_devolvivel_vinculo(uuid, uuid, uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reprocessar_devolucoes_almoxarifado(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalcular_estoque_almoxarifado(uuid, uuid) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Users can manage farm registros_almoxarifado records" ON public.registros_almoxarifado;
DROP POLICY IF EXISTS registros_almox_insert ON public.registros_almoxarifado;
DROP POLICY IF EXISTS registros_almox_update ON public.registros_almoxarifado;
DROP POLICY IF EXISTS registros_almox_delete ON public.registros_almoxarifado;

CREATE POLICY registros_almox_insert ON public.registros_almoxarifado FOR INSERT TO authenticated
  WITH CHECK (public.user_has_fazenda_access(fazenda_id));

CREATE POLICY registros_almox_update ON public.registros_almoxarifado FOR UPDATE TO authenticated
  USING (public.user_has_fazenda_access(fazenda_id))
  WITH CHECK (public.user_has_fazenda_access(fazenda_id));

CREATE POLICY registros_almox_delete ON public.registros_almoxarifado FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.usuario_fazenda uf
    JOIN public.usuarios u ON u.id = uf.usuario_id
    WHERE (uf.usuario_id = auth.uid() OR u.auth_id = auth.uid())
      AND uf.fazenda_id = registros_almoxarifado.fazenda_id
      AND uf.papel IN ('admin', 'controller')
      AND uf.ativo = true
  ));

REVOKE ALL ON public.registros_almoxarifado FROM anon;
REVOKE TRUNCATE ON public.registros_almoxarifado FROM authenticated;
REVOKE TRUNCATE ON public.itens_almoxarifado, public.movimentacoes_almoxarifado FROM anon, authenticated;
REVOKE TRUNCATE ON public.itens_almoxarifado_pwa FROM anon, authenticated;
