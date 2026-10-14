-- Rollback de 20261014100000_consumo_confinamento_dia.sql
DROP TRIGGER IF EXISTS trg_consumo_confinamento_oferta ON public.registros_oferta_trato;
DROP TRIGGER IF EXISTS trg_consumo_confinamento_leitura ON public.registros_leitura_cocho;
DROP FUNCTION IF EXISTS public.trg_consumo_confinamento_oferta();
DROP FUNCTION IF EXISTS public.trg_consumo_confinamento_leitura();
DROP FUNCTION IF EXISTS public.fn_recalc_consumo_por_oferta(uuid, uuid, uuid, timestamptz);
DROP FUNCTION IF EXISTS public.fn_recalc_consumo_por_leitura(uuid, uuid, uuid, timestamptz);
DROP FUNCTION IF EXISTS public.recalc_consumo_confinamento_periodo(uuid, date, date);
DROP FUNCTION IF EXISTS public.recalc_consumo_confinamento_dia(uuid, uuid, date);
DROP FUNCTION IF EXISTS public.calc_cabecas_peso_lote_em(uuid, date);
DROP FUNCTION IF EXISTS public.fn_lote_do_curral_em(uuid, date);
DROP TABLE IF EXISTS public.consumo_confinamento_dia;
