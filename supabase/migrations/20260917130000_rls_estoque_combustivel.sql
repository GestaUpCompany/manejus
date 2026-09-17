-- Restringe RLS do estoque de combustivel por fazenda
--
-- As policies originais (migration 20260915120000_create_estoque_combustivel)
-- usavam USING/WITH CHECK (true): qualquer usuario autenticado podia ler,
-- alterar e apagar tanques e movimentacoes de qualquer fazenda. Substitui por
-- policies escopadas via public.user_has_fazenda_access, a mesma funcao que
-- protege registros_oferta_trato e demais tabelas novas. Cobre painel web
-- (controllers) e PWA (peoes possuem usuarios + usuario_fazenda).
-- A trigger baixa_automatica_abastecimento e SECURITY DEFINER e continua
-- inserindo a baixa sem passar por RLS.

-- ==================== tanques_combustivel ====================
DROP POLICY IF EXISTS "Authenticated select tanques_combustivel" ON public.tanques_combustivel;
DROP POLICY IF EXISTS "Authenticated insert tanques_combustivel" ON public.tanques_combustivel;
DROP POLICY IF EXISTS "Authenticated update tanques_combustivel" ON public.tanques_combustivel;
DROP POLICY IF EXISTS "Authenticated delete tanques_combustivel" ON public.tanques_combustivel;

CREATE POLICY rls_tanques_combustivel_select ON public.tanques_combustivel
  FOR SELECT TO authenticated
  USING (public.user_has_fazenda_access(fazenda_id));

CREATE POLICY rls_tanques_combustivel_insert ON public.tanques_combustivel
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_fazenda_access(fazenda_id));

CREATE POLICY rls_tanques_combustivel_update ON public.tanques_combustivel
  FOR UPDATE TO authenticated
  USING (public.user_has_fazenda_access(fazenda_id))
  WITH CHECK (public.user_has_fazenda_access(fazenda_id));

CREATE POLICY rls_tanques_combustivel_delete ON public.tanques_combustivel
  FOR DELETE TO authenticated
  USING (public.user_has_fazenda_access(fazenda_id));

-- ==================== movimentacoes_combustivel ====================
DROP POLICY IF EXISTS "Authenticated select movimentacoes_combustivel" ON public.movimentacoes_combustivel;
DROP POLICY IF EXISTS "Authenticated insert movimentacoes_combustivel" ON public.movimentacoes_combustivel;
DROP POLICY IF EXISTS "Authenticated update movimentacoes_combustivel" ON public.movimentacoes_combustivel;
DROP POLICY IF EXISTS "Authenticated delete movimentacoes_combustivel" ON public.movimentacoes_combustivel;

CREATE POLICY rls_movimentacoes_combustivel_select ON public.movimentacoes_combustivel
  FOR SELECT TO authenticated
  USING (public.user_has_fazenda_access(fazenda_id));

CREATE POLICY rls_movimentacoes_combustivel_insert ON public.movimentacoes_combustivel
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_fazenda_access(fazenda_id));

CREATE POLICY rls_movimentacoes_combustivel_update ON public.movimentacoes_combustivel
  FOR UPDATE TO authenticated
  USING (public.user_has_fazenda_access(fazenda_id))
  WITH CHECK (public.user_has_fazenda_access(fazenda_id));

CREATE POLICY rls_movimentacoes_combustivel_delete ON public.movimentacoes_combustivel
  FOR DELETE TO authenticated
  USING (public.user_has_fazenda_access(fazenda_id));
