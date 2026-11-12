-- Rollback de 20261112100000_infografico_anual_consumo_morte_rebanho.sql
-- 1) Mortes anual: reaplicar o bloco get_infografico_anual_morte de 20261111150000_infografico_anual_fase1.sql
--    ANTES de remover as funções de categoria e de rebanho abaixo (a versão nova depende delas).
-- 2) Consumo anual: não reverter (a versão anterior falha com lote sem pendência).
SELECT cron.unschedule('registrar_rebanho_mensal') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'registrar_rebanho_mensal');
DROP FUNCTION IF EXISTS public.registrar_rebanho_mensal();
DROP FUNCTION IF EXISTS public._rebanho_estimado(uuid, date);
-- Atenção: apaga os retratos mensais já gravados. Fazer backup (backup.rebanho_mensal_<data>) antes, se houver meses registrados.
DROP TABLE IF EXISTS public.rebanho_mensal;
DROP FUNCTION IF EXISTS public._categoria_rotulo(text);
DROP FUNCTION IF EXISTS public._categoria_chave_preco(text);
DROP FUNCTION IF EXISTS public._categoria_norm(text);
