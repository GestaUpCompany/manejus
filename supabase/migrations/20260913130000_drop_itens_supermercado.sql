-- Drop itens_supermercado table
-- Substituida por itens_cantina (com classificacao e unidade de medida).
-- Backfill ja foi aplicado e validado: 23 itens migrados para itens_cantina.

DROP TABLE IF EXISTS public.itens_supermercado CASCADE;
