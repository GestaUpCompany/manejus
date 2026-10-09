-- ROLLBACK de 20261008160000_reproducao_eventos_estacoes_e_status.sql
-- NÃO fica em supabase/migrations/ de propósito.
-- ATENÇÃO: apaga TODOS os eventos reprodutivos e estações de monta já lançados (as duas tabelas são novas
-- e só existem por esta migration). Nenhuma tabela anterior foi alterada, então nada mais precisa voltar.
DROP VIEW IF EXISTS public.v_status_reprodutivo;
DROP TABLE IF EXISTS public.eventos_reprodutivos;
DROP TABLE IF EXISTS public.estacoes_monta;
DROP FUNCTION IF EXISTS public.trg_eventos_reprodutivos_validar();
DROP FUNCTION IF EXISTS public.gestacao_dias_padrao();
