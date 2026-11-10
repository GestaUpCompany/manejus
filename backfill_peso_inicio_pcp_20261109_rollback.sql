-- Rollback do backfill de peso_inicio_kg_cab de 09/11/2026.
-- Volta a NULL (o valor original de todas as linhas) SOMENTE onde o valor ainda e o gravado pelo backfill
-- (nao desfaz edicoes feitas depois por alguem). Usa a tabela public.backup_pcp_peso_inicio_20261109.
-- O proximo cron recalcula os pesos a partir do estado revertido.

DO $rollback$
DECLARE
  v_n integer;
BEGIN
  IF to_regclass('public.backup_pcp_peso_inicio_20261109') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: tabela de backup nao existe';
  END IF;

  UPDATE plano_categoria_personalizacao p
  SET peso_inicio_kg_cab = b.peso_inicio_antigo
  FROM public.backup_pcp_peso_inicio_20261109 b
  WHERE p.id = b.pcp_id
    AND p.peso_inicio_kg_cab IS NOT DISTINCT FROM b.peso_inicio_novo;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RAISE NOTICE 'Rollback: % linhas revertidas (esperado 34 se ninguem editou depois)', v_n;
END
$rollback$;

-- Conferencia: linhas que NAO foram revertidas (alguem editou depois do backfill)
-- select b.pcp_id, b.descr, p.peso_inicio_kg_cab atual, b.peso_inicio_novo
-- from public.backup_pcp_peso_inicio_20261109 b join plano_categoria_personalizacao p on p.id=b.pcp_id
-- where p.peso_inicio_kg_cab is distinct from b.peso_inicio_antigo;
