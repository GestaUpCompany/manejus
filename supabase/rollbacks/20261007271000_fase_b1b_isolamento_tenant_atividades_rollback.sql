-- ROLLBACK do Lote 1 / passo 2 (migration 20261007271000_fase_b1b_isolamento_tenant_atividades.sql)
-- NÃO fica em supabase/migrations/ de propósito. ATENÇÃO: reabre as 8 tabelas para anon.
DROP POLICY IF EXISTS atividades_tenant ON public.atividades;
DROP POLICY IF EXISTS prioridades_atividades_tenant ON public.prioridades_atividades;
DROP POLICY IF EXISTS atividade_imprevisto_categorias_tenant ON public.atividade_imprevisto_categorias;
DROP POLICY IF EXISTS atividade_templates_tenant ON public.atividade_templates;
DROP POLICY IF EXISTS atividade_funcionarios_tenant ON public.atividade_funcionarios;
DROP POLICY IF EXISTS atividade_sessoes_tenant ON public.atividade_sessoes;
DROP POLICY IF EXISTS atividade_imprevistos_tenant ON public.atividade_imprevistos;
DROP POLICY IF EXISTS atividade_template_funcionarios_tenant ON public.atividade_template_funcionarios;

-- atividades
CREATE POLICY atividades_select ON public.atividades FOR SELECT TO public USING (true);
CREATE POLICY atividades_insert ON public.atividades FOR INSERT TO public WITH CHECK (true);
CREATE POLICY atividades_update ON public.atividades FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY atividades_delete ON public.atividades FOR DELETE TO public USING (true);
-- atividade_funcionarios
CREATE POLICY atv_func_select ON public.atividade_funcionarios FOR SELECT TO public USING (true);
CREATE POLICY atv_func_insert ON public.atividade_funcionarios FOR INSERT TO public WITH CHECK (true);
CREATE POLICY atv_func_update ON public.atividade_funcionarios FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY atv_func_delete ON public.atividade_funcionarios FOR DELETE TO public USING (true);
-- atividade_sessoes
CREATE POLICY atv_sessoes_select ON public.atividade_sessoes FOR SELECT TO public USING (true);
CREATE POLICY atv_sessoes_insert ON public.atividade_sessoes FOR INSERT TO public WITH CHECK (true);
CREATE POLICY atv_sessoes_update ON public.atividade_sessoes FOR UPDATE TO public USING (true);
CREATE POLICY atv_sessoes_delete ON public.atividade_sessoes FOR DELETE TO public USING (true);
-- atividade_imprevistos
CREATE POLICY atv_imprev_select ON public.atividade_imprevistos FOR SELECT TO public USING (true);
CREATE POLICY atv_imprev_insert ON public.atividade_imprevistos FOR INSERT TO public WITH CHECK (true);
CREATE POLICY atv_imprev_update ON public.atividade_imprevistos FOR UPDATE TO public USING (true);
CREATE POLICY atv_imprev_delete ON public.atividade_imprevistos FOR DELETE TO public USING (true);
-- atividade_templates
CREATE POLICY atividade_templates_select ON public.atividade_templates FOR SELECT TO public USING (public.user_has_fazenda_access(fazenda_id));
CREATE POLICY atividade_templates_insert ON public.atividade_templates FOR INSERT TO public WITH CHECK (true);
CREATE POLICY atividade_templates_update ON public.atividade_templates FOR UPDATE TO public USING (true);
CREATE POLICY atividade_templates_delete ON public.atividade_templates FOR DELETE TO public USING (true);
-- atividade_template_funcionarios (sem policy de UPDATE originalmente)
CREATE POLICY atv_template_func_select ON public.atividade_template_funcionarios FOR SELECT TO public USING (true);
CREATE POLICY atv_template_func_insert ON public.atividade_template_funcionarios FOR INSERT TO public WITH CHECK (true);
CREATE POLICY atv_template_func_delete ON public.atividade_template_funcionarios FOR DELETE TO public USING (true);
-- atividade_imprevisto_categorias
CREATE POLICY atv_imprev_categ_select ON public.atividade_imprevisto_categorias FOR SELECT TO public USING (public.user_has_fazenda_access(fazenda_id));
CREATE POLICY atv_imprev_categ_insert ON public.atividade_imprevisto_categorias FOR INSERT TO public WITH CHECK (true);
CREATE POLICY atv_imprev_categ_update ON public.atividade_imprevisto_categorias FOR UPDATE TO public USING (true);
CREATE POLICY atv_imprev_categ_delete ON public.atividade_imprevisto_categorias FOR DELETE TO public USING (true);
-- prioridades_atividades
CREATE POLICY prioridades_select ON public.prioridades_atividades FOR SELECT TO public USING (true);
CREATE POLICY prioridades_insert ON public.prioridades_atividades FOR INSERT TO public WITH CHECK (true);
CREATE POLICY prioridades_update ON public.prioridades_atividades FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY prioridades_delete ON public.prioridades_atividades FOR DELETE TO public USING (true);

-- Privilégios originais de anon
GRANT SELECT, TRUNCATE, REFERENCES, TRIGGER ON public.atividades, public.atividade_funcionarios, public.prioridades_atividades TO anon;
GRANT ALL ON public.atividade_sessoes, public.atividade_imprevistos, public.atividade_templates,
  public.atividade_template_funcionarios, public.atividade_imprevisto_categorias TO anon;
GRANT TRUNCATE, REFERENCES, TRIGGER ON public.atividades, public.atividade_funcionarios, public.atividade_sessoes,
  public.atividade_imprevistos, public.atividade_templates, public.atividade_template_funcionarios,
  public.atividade_imprevisto_categorias, public.prioridades_atividades TO authenticated;

DROP FUNCTION IF EXISTS public.fazenda_da_atividade(uuid);
DROP FUNCTION IF EXISTS public.fazenda_do_atividade_funcionario(uuid);
DROP FUNCTION IF EXISTS public.fazenda_do_atividade_template(uuid);
