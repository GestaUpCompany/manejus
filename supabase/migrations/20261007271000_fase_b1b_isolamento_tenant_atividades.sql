-- ============================================================================
-- Fase B / Lote 1, passo 2 (S3): isolamento de tenant nas tabelas de atividades
-- ============================================================================
-- Achado: as 8 tabelas abaixo tinham policies `true` para `public`. `anon` lia tudo (e escrevia em 5
-- delas: sessões, imprevistos, templates, template_funcionarios, imprevisto_categorias); qualquer logado
-- lia/alterava atividades de qualquer fazenda.
--
-- Pré-requisito cumprido: o relatório público de atividades passou a usar a RPC
-- get_dados_relatorio_atividades (passo 1, deploy do Painel validado), então nada mais lê estas tabelas
-- como `anon`.
--
-- Padrão (igual aos lotes anteriores): is_admin_user() OR caller_has_fazenda_access(<fazenda do objeto>),
-- `to authenticated`, mesmo predicado em USING e WITH CHECK, uma policy ALL por tabela. Tabelas sem
-- fazenda_id sobem até a fazenda por helpers STABLE SECURITY DEFINER (evita join dentro da policy):
--   atividade_funcionarios.atividade_id -> atividades.fazenda_id
--   atividade_sessoes / atividade_imprevistos .atividade_funcionario_id -> atividade_funcionarios -> atividades
--   atividade_template_funcionarios.template_id -> atividade_templates.fazenda_id
-- Hardening: REVOKE ALL FROM anon; REVOKE TRUNCATE, REFERENCES, TRIGGER FROM authenticated.
-- Os gatilhos e RPCs que tocam estas tabelas são SECURITY DEFINER e não são afetados.
-- Rollback: supabase/rollbacks/20261007271000_fase_b1b_isolamento_tenant_atividades_rollback.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helpers (fazenda do objeto)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fazenda_da_atividade(p_atividade_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT a.fazenda_id FROM public.atividades a WHERE a.id = p_atividade_id;
$$;

CREATE OR REPLACE FUNCTION public.fazenda_do_atividade_funcionario(p_af_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT a.fazenda_id
  FROM public.atividade_funcionarios af
  JOIN public.atividades a ON a.id = af.atividade_id
  WHERE af.id = p_af_id;
$$;

CREATE OR REPLACE FUNCTION public.fazenda_do_atividade_template(p_template_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT t.fazenda_id FROM public.atividade_templates t WHERE t.id = p_template_id;
$$;

REVOKE EXECUTE ON FUNCTION public.fazenda_da_atividade(uuid), public.fazenda_do_atividade_funcionario(uuid),
  public.fazenda_do_atividade_template(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fazenda_da_atividade(uuid), public.fazenda_do_atividade_funcionario(uuid),
  public.fazenda_do_atividade_template(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Remove TODAS as policies antigas das 8 tabelas
-- ----------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('atividades','atividade_funcionarios','atividade_sessoes','atividade_imprevistos',
                        'atividade_templates','atividade_template_funcionarios',
                        'atividade_imprevisto_categorias','prioridades_atividades')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Novas policies
-- ----------------------------------------------------------------------------
CREATE POLICY atividades_tenant ON public.atividades FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

CREATE POLICY prioridades_atividades_tenant ON public.prioridades_atividades FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

CREATE POLICY atividade_imprevisto_categorias_tenant ON public.atividade_imprevisto_categorias FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

CREATE POLICY atividade_templates_tenant ON public.atividade_templates FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

CREATE POLICY atividade_funcionarios_tenant ON public.atividade_funcionarios FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(public.fazenda_da_atividade(atividade_id)))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(public.fazenda_da_atividade(atividade_id)));

CREATE POLICY atividade_sessoes_tenant ON public.atividade_sessoes FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(public.fazenda_do_atividade_funcionario(atividade_funcionario_id)))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(public.fazenda_do_atividade_funcionario(atividade_funcionario_id)));

CREATE POLICY atividade_imprevistos_tenant ON public.atividade_imprevistos FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(public.fazenda_do_atividade_funcionario(atividade_funcionario_id)))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(public.fazenda_do_atividade_funcionario(atividade_funcionario_id)));

CREATE POLICY atividade_template_funcionarios_tenant ON public.atividade_template_funcionarios FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(public.fazenda_do_atividade_template(template_id)))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(public.fazenda_do_atividade_template(template_id)));

-- ----------------------------------------------------------------------------
-- 4. Privilégios
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.atividades, public.atividade_funcionarios, public.atividade_sessoes,
  public.atividade_imprevistos, public.atividade_templates, public.atividade_template_funcionarios,
  public.atividade_imprevisto_categorias, public.prioridades_atividades FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.atividades, public.atividade_funcionarios,
  public.atividade_sessoes, public.atividade_imprevistos, public.atividade_templates,
  public.atividade_template_funcionarios, public.atividade_imprevisto_categorias,
  public.prioridades_atividades FROM authenticated;
