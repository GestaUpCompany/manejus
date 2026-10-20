-- ROLLBACK de 20261020120000_fix_gatilho_filho_lotes_protocolo_iatf.sql
-- NÃO fica em supabase/migrations/ de propósito.
-- Voltar à versão com a expressão única reintroduz o erro 42703 nas tarefas; só faz sentido junto com o rollback
-- de 20261020110000 (que derruba a função). Nada a desfazer isoladamente.
SELECT 1;
