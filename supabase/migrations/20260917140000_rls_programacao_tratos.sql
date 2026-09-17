-- Restringe RLS das tabelas de programação de tratos por fazenda
--
-- programacao_tratos, programacao_tratos_percentuais e
-- programacao_tratos_currais usavam policies permissivas (USING/WITH CHECK
-- true): qualquer autenticado podia ler, alterar e apagar a programação de
-- tratos de qualquer fazenda. Substitui pelo mesmo padrão já aplicado em
-- registros_oferta_trato (migration 20260917100000).
--
-- As tabelas filhas não possuem fazenda_id; o helper
-- user_has_programacao_access resolve a fazenda via programacao_id. É
-- SECURITY DEFINER como user_has_fazenda_access: retorna true apenas quando o
-- chamador tem vínculo ativo com a fazenda da programação, sem expor dados de
-- outras fazendas.
--
-- Leitores/escritores afetados: painel web (controller configura e lança) e
-- PWA (peão apenas lê a programação na tela de trato). Ambos possuem vínculo
-- em usuario_fazenda.

CREATE OR REPLACE FUNCTION public.user_has_programacao_access(p_programacao_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.programacao_tratos pt
    WHERE pt.id = p_programacao_id
      AND public.user_has_fazenda_access(pt.fazenda_id)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.user_has_programacao_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_programacao_access(uuid) TO authenticated;

-- ==================== programacao_tratos ====================
DROP POLICY IF EXISTS rls_programacao_tratos_select ON public.programacao_tratos;
DROP POLICY IF EXISTS rls_programacao_tratos_insert ON public.programacao_tratos;
DROP POLICY IF EXISTS rls_programacao_tratos_update ON public.programacao_tratos;
DROP POLICY IF EXISTS rls_programacao_tratos_delete ON public.programacao_tratos;

CREATE POLICY rls_programacao_tratos_select ON public.programacao_tratos
  FOR SELECT TO authenticated
  USING (public.user_has_fazenda_access(fazenda_id));

CREATE POLICY rls_programacao_tratos_insert ON public.programacao_tratos
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_fazenda_access(fazenda_id));

CREATE POLICY rls_programacao_tratos_update ON public.programacao_tratos
  FOR UPDATE TO authenticated
  USING (public.user_has_fazenda_access(fazenda_id))
  WITH CHECK (public.user_has_fazenda_access(fazenda_id));

CREATE POLICY rls_programacao_tratos_delete ON public.programacao_tratos
  FOR DELETE TO authenticated
  USING (public.user_has_fazenda_access(fazenda_id));

-- ==================== programacao_tratos_percentuais ====================
DROP POLICY IF EXISTS rls_programacao_tratos_percentuais_select ON public.programacao_tratos_percentuais;
DROP POLICY IF EXISTS rls_programacao_tratos_percentuais_insert ON public.programacao_tratos_percentuais;
DROP POLICY IF EXISTS rls_programacao_tratos_percentuais_update ON public.programacao_tratos_percentuais;
DROP POLICY IF EXISTS rls_programacao_tratos_percentuais_delete ON public.programacao_tratos_percentuais;

CREATE POLICY rls_programacao_tratos_percentuais_select ON public.programacao_tratos_percentuais
  FOR SELECT TO authenticated
  USING (public.user_has_programacao_access(programacao_id));

CREATE POLICY rls_programacao_tratos_percentuais_insert ON public.programacao_tratos_percentuais
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_programacao_access(programacao_id));

CREATE POLICY rls_programacao_tratos_percentuais_update ON public.programacao_tratos_percentuais
  FOR UPDATE TO authenticated
  USING (public.user_has_programacao_access(programacao_id))
  WITH CHECK (public.user_has_programacao_access(programacao_id));

CREATE POLICY rls_programacao_tratos_percentuais_delete ON public.programacao_tratos_percentuais
  FOR DELETE TO authenticated
  USING (public.user_has_programacao_access(programacao_id));

-- ==================== programacao_tratos_currais ====================
DROP POLICY IF EXISTS rls_programacao_tratos_currais_select ON public.programacao_tratos_currais;
DROP POLICY IF EXISTS rls_programacao_tratos_currais_insert ON public.programacao_tratos_currais;
DROP POLICY IF EXISTS rls_programacao_tratos_currais_update ON public.programacao_tratos_currais;
DROP POLICY IF EXISTS rls_programacao_tratos_currais_delete ON public.programacao_tratos_currais;

CREATE POLICY rls_programacao_tratos_currais_select ON public.programacao_tratos_currais
  FOR SELECT TO authenticated
  USING (public.user_has_programacao_access(programacao_id));

CREATE POLICY rls_programacao_tratos_currais_insert ON public.programacao_tratos_currais
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_programacao_access(programacao_id));

CREATE POLICY rls_programacao_tratos_currais_update ON public.programacao_tratos_currais
  FOR UPDATE TO authenticated
  USING (public.user_has_programacao_access(programacao_id))
  WITH CHECK (public.user_has_programacao_access(programacao_id));

CREATE POLICY rls_programacao_tratos_currais_delete ON public.programacao_tratos_currais
  FOR DELETE TO authenticated
  USING (public.user_has_programacao_access(programacao_id));
