-- ROLLBACK do Lote 1 / passo 1 (migration 20261007270000_fase_b1a_rpc_relatorio_publico_atividades.sql)
-- NÃO fica em supabase/migrations/. Só remover se o Painel não estiver usando a RPC.
DROP FUNCTION IF EXISTS public.get_dados_relatorio_atividades(uuid, date, date, date, date);
