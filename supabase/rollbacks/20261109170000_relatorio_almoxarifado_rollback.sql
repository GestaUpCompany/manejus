-- Rollback: remove as RPCs do relatorio de almoxarifado. Links publicos ja criados com tipo 'almoxarifado'
-- deixam de carregar dados (a RPC some); apague-os em relatorios_publicos se nao forem mais necessarios.

DROP FUNCTION IF EXISTS public.get_dados_relatorio_almoxarifado_fazenda(uuid, date, date);
DROP FUNCTION IF EXISTS public.get_dados_relatorio_almoxarifado(uuid, date, date);
