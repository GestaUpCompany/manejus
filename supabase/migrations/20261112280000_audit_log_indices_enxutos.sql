-- audit_log: indices enxutos (menos amplificacao de escrita, consultas da tela Auditoria indexadas).
--
-- Dropa (idx_scan <= 1 em pg_stat_user_indexes em 12/11/2026, ou duplicado/legado):
--   idx_audit_log_fazenda       (duplicado de idx_audit_log_fazenda_id, 0 scans)
--   idx_audit_log_dispositivo   (coluna legada, 0 scans)
--   idx_audit_log_acao          (coluna legada, 1 scan)
--   idx_audit_log_source_app    (parcial, 0 scans)
--   idx_audit_log_is_soft_delete(parcial, 0 scans)
-- Substitui por compostos que cobrem os filtros + ordem da RPC get_audit_log:
--   (fazenda_id, criado_em DESC)  no lugar de idx_audit_log_fazenda_id
--   (tabela, criado_em DESC)      no lugar de idx_audit_log_tabela
-- Mantem criado_em, usuario_id, operacao e transaction_id (3309 scans: batchSize).
-- A tabela tem ~107 mil linhas: a criacao dos indices leva segundos (bloqueia escrita brevemente).

CREATE INDEX IF NOT EXISTS idx_audit_log_fazenda_criado_em ON public.audit_log (fazenda_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_tabela_criado_em ON public.audit_log (tabela, criado_em DESC);

DROP INDEX IF EXISTS public.idx_audit_log_fazenda_id;
DROP INDEX IF EXISTS public.idx_audit_log_tabela;
DROP INDEX IF EXISTS public.idx_audit_log_fazenda;
DROP INDEX IF EXISTS public.idx_audit_log_dispositivo;
DROP INDEX IF EXISTS public.idx_audit_log_acao;
DROP INDEX IF EXISTS public.idx_audit_log_source_app;
DROP INDEX IF EXISTS public.idx_audit_log_is_soft_delete;
