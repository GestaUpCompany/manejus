-- Habilita RLS nas 3 tabelas de backup que estavam expostas a anon/authenticated via PostgREST.
-- Sem policy: so postgres/service_role acessam, igual as demais tabelas backup_*.
-- Nenhum codigo do Painel/PWA le essas tabelas.

DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'backup_saida_itens_duplicados_20261022',
    'backup_medicamentos_20261103',
    'backup_movimentacoes_farmacia_20261103'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END
$do$;
