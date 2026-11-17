-- Rollback da migration 20261117100000_suplementacao_pasto_da_ocupacao
drop trigger if exists trg_suplementacao_pasto_da_ocupacao on registros_suplementacao;
drop function if exists fn_suplementacao_pasto_da_ocupacao();
