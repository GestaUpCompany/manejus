-- Rollback de 20261112280000_audit_log_indices_enxutos.sql
CREATE INDEX IF NOT EXISTS idx_audit_log_fazenda_id ON public.audit_log (fazenda_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_tabela ON public.audit_log (tabela);
CREATE INDEX IF NOT EXISTS idx_audit_log_fazenda ON public.audit_log (fazenda_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_dispositivo ON public.audit_log (dispositivo_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_acao ON public.audit_log (acao);
CREATE INDEX IF NOT EXISTS idx_audit_log_source_app ON public.audit_log (source_app) WHERE source_app IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_is_soft_delete ON public.audit_log (is_soft_delete) WHERE is_soft_delete = true;
DROP INDEX IF EXISTS public.idx_audit_log_fazenda_criado_em;
DROP INDEX IF EXISTS public.idx_audit_log_tabela_criado_em;
