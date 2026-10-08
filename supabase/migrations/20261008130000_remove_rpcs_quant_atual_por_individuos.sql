-- ============================================================================
-- Indivíduos / Fase 3d: remover RPCs de quant_atual que contam indivíduos
-- ============================================================================
-- update_quant_atual_with_data(uuid, varchar, varchar, varchar) e update_quant_atual(uuid, varchar)
-- calculam lote_categorias.quant_atual como a CONTAGEM DE INDIVÍDUOS cadastrados no lote. Mas o
-- contador do lote vem das movimentações (calculate_quant_atual) e nem todo animal tem indivíduo.
-- As duas já falham hoje com 42P10 (ON CONFLICT sem o predicado do índice único parcial
-- unique_lote_categoria_ativa); se alguém "consertasse" o ON CONFLICT, passariam a sobrescrever o
-- contador de cabeças do lote com a contagem de indivíduos.
--
-- Verificado antes de remover: nenhuma função do schema public as referencia (varredura de prosrc),
-- não há Edge Function que as use, o código do PWA não as chama (só aparecem em types/supabase.ts,
-- gerado) e o painel deixou de chamá-las no commit c3d66ea (o trigger update_quant_atual_movimentacao
-- mantém o contador).
--
-- O inventário da Fase 5 do PWA (docs/INVENTARIO_RPCS_FASE5.md) já listava update_quant_atual como
-- "sem nenhum chamador"; remoção decidida pelo responsável em 08/10/2026.
--
-- Impacto no PWA: nenhum em runtime. Ao regenerar types/supabase.ts as entradas somem.
-- Rollback: supabase/rollbacks/20261008130000_remove_rpcs_quant_atual_por_individuos_rollback.sql
-- ============================================================================

DROP FUNCTION IF EXISTS public.update_quant_atual_with_data(uuid, character varying, character varying, character varying);
DROP FUNCTION IF EXISTS public.update_quant_atual(uuid, character varying);
