-- Rollback: remove a variante por fazenda do relatorio de Clima. O relatorio publico (por token) nao muda;
-- o Infografico Mensal deixa de conseguir carregar a secao de Clima.

DROP FUNCTION IF EXISTS public.get_dados_relatorio_clima_fazenda(uuid, date, date);
