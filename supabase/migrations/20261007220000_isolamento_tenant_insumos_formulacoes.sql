-- ============================================================================
-- Isolamento de tenant: insumos, formulacoes, formulacao_insumos, formulacoes_historico
-- ============================================================================
-- Problema (BACKLOG S3): insumos e formulacoes tinham policies com qual/check = true
-- para authenticated nas quatro operações. Qualquer usuário logado lia, alterava
-- e apagava estoque, custo e receitas de qualquer fazenda. formulacao_insumos (as
-- receitas, sem fazenda_id) tinha o mesmo problema, e formulacoes_historico usava
-- (select fazenda_id ... limit 1), válido só para a primeira fazenda do usuário.
--
-- Padrão (mesmo de lotes/pastos, migration 20261006180000) + admin global, como em
-- fazendas:  is_admin_user() OR caller_has_fazenda_access(fazenda_id)
--   - caller_has_fazenda_access cobre usuários do painel (usuario_fazenda) e peões
--     do PWA (auth.jwt()->>'email' -> peoes -> fazendas.acesso_id).
--
-- Não afetados: triggers/RPCs SECURITY DEFINER (cascata de estoque, recalcular_*,
-- relatórios por token) e Edge Functions com service role.
--
-- Hardening: anon deixa de ter qualquer privilégio nestas tabelas (nunca teve
-- policy, logo nunca teve acesso efetivo) e anon/authenticated perdem TRUNCATE,
-- REFERENCES e TRIGGER (TRUNCATE ignora RLS; o PostgREST não o expõe, mas o
-- privilégio não tem uso legítimo para essas roles).
-- Reversível: recriar as policies antigas e GRANT dos privilégios removidos.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- insumos
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated delete insumos" ON public.insumos;
DROP POLICY IF EXISTS "Authenticated insert insumos" ON public.insumos;
DROP POLICY IF EXISTS "Authenticated select insumos" ON public.insumos;
DROP POLICY IF EXISTS "Authenticated update insumos" ON public.insumos;

CREATE POLICY "insumos_select_fazenda" ON public.insumos
  FOR SELECT TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

CREATE POLICY "insumos_insert_fazenda" ON public.insumos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

CREATE POLICY "insumos_update_fazenda" ON public.insumos
  FOR UPDATE TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

CREATE POLICY "insumos_delete_fazenda" ON public.insumos
  FOR DELETE TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

-- ----------------------------------------------------------------------------
-- formulacoes
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated delete dietas" ON public.formulacoes;
DROP POLICY IF EXISTS "Authenticated insert dietas" ON public.formulacoes;
DROP POLICY IF EXISTS "Authenticated select dietas" ON public.formulacoes;
DROP POLICY IF EXISTS "Authenticated update dietas" ON public.formulacoes;

CREATE POLICY "formulacoes_select_fazenda" ON public.formulacoes
  FOR SELECT TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

CREATE POLICY "formulacoes_insert_fazenda" ON public.formulacoes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

CREATE POLICY "formulacoes_update_fazenda" ON public.formulacoes
  FOR UPDATE TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

CREATE POLICY "formulacoes_delete_fazenda" ON public.formulacoes
  FOR DELETE TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

-- ----------------------------------------------------------------------------
-- formulacao_insumos (sem fazenda_id: escopo pela fórmula-pai)
-- INSERT/UPDATE exigem ainda que o insumo seja da MESMA fazenda da fórmula,
-- para impedir receita misturando tenants.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "formulacao_insumos_delete_authenticated" ON public.formulacao_insumos;
DROP POLICY IF EXISTS "formulacao_insumos_insert_authenticated" ON public.formulacao_insumos;
DROP POLICY IF EXISTS "formulacao_insumos_select_authenticated" ON public.formulacao_insumos;
DROP POLICY IF EXISTS "formulacao_insumos_update_authenticated" ON public.formulacao_insumos;

CREATE POLICY "formulacao_insumos_select_fazenda" ON public.formulacao_insumos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.formulacoes f
    WHERE f.id = formulacao_insumos.formulacao_id
      AND (public.is_admin_user() OR public.caller_has_fazenda_access(f.fazenda_id))
  ));

CREATE POLICY "formulacao_insumos_insert_fazenda" ON public.formulacao_insumos
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.formulacoes f
    JOIN public.insumos i ON i.id = formulacao_insumos.insumo_id AND i.fazenda_id = f.fazenda_id
    WHERE f.id = formulacao_insumos.formulacao_id
      AND (public.is_admin_user() OR public.caller_has_fazenda_access(f.fazenda_id))
  ));

CREATE POLICY "formulacao_insumos_update_fazenda" ON public.formulacao_insumos
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.formulacoes f
    WHERE f.id = formulacao_insumos.formulacao_id
      AND (public.is_admin_user() OR public.caller_has_fazenda_access(f.fazenda_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.formulacoes f
    JOIN public.insumos i ON i.id = formulacao_insumos.insumo_id AND i.fazenda_id = f.fazenda_id
    WHERE f.id = formulacao_insumos.formulacao_id
      AND (public.is_admin_user() OR public.caller_has_fazenda_access(f.fazenda_id))
  ));

CREATE POLICY "formulacao_insumos_delete_fazenda" ON public.formulacao_insumos
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.formulacoes f
    WHERE f.id = formulacao_insumos.formulacao_id
      AND (public.is_admin_user() OR public.caller_has_fazenda_access(f.fazenda_id))
  ));

-- ----------------------------------------------------------------------------
-- formulacoes_historico (somente leitura; o snapshot é gravado por trigger DEFINER)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "formulacoes_historico_select_fazenda" ON public.formulacoes_historico;

CREATE POLICY "formulacoes_historico_select_fazenda" ON public.formulacoes_historico
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.formulacoes f
    WHERE f.id = formulacoes_historico.formulacao_id
      AND (public.is_admin_user() OR public.caller_has_fazenda_access(f.fazenda_id))
  ));

-- ----------------------------------------------------------------------------
-- Hardening de privilégios
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.insumos, public.formulacoes, public.formulacao_insumos, public.formulacoes_historico
  FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON public.insumos, public.formulacoes, public.formulacao_insumos, public.formulacoes_historico
  FROM authenticated;
