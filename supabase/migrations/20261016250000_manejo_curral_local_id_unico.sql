-- Manejo de curral: o PWA envia com upsert onConflict=local_id (como as demais cadernetas), e o PostgREST só aceita um
-- índice único exato na coluna, não um índice parcial por (fazenda_id, local_id). Troca pelos índices simples em local_id
-- (padrão de registros_morte e atividade_funcionarios). Seguro: as tabelas são novas e local_id é um uuid gerado no aparelho.
-- Rollback: supabase/rollbacks/20261016250000_manejo_curral_local_id_unico_rollback.sql

DROP INDEX IF EXISTS public.uq_sessoes_manejo_curral_local;
DROP INDEX IF EXISTS public.uq_registros_manejo_curral_local;

CREATE UNIQUE INDEX sessoes_manejo_curral_local_id_key ON public.sessoes_manejo_curral (local_id);
CREATE UNIQUE INDEX registros_manejo_curral_local_id_key ON public.registros_manejo_curral (local_id);
