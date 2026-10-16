-- Rollback de 20261016230000_manejo_curral_tabelas. Só dropa tabelas novas; aborta se já houver dados.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sessoes_manejo_curral)
     OR EXISTS (SELECT 1 FROM public.registros_manejo_curral)
     OR EXISTS (SELECT 1 FROM public.pendencias_designacao_lote) THEN
    RAISE EXCEPTION 'Há dados de manejo de curral; faça backup e esvazie antes de reverter';
  END IF;
END $$;

DROP TABLE public.pendencias_designacao_lote;
DROP TABLE public.registros_manejo_curral;
DROP TABLE public.sessoes_manejo_curral;
