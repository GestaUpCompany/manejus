DROP FUNCTION IF EXISTS public.previa_exclusao_maternidade(uuid, uuid);
ALTER FUNCTION public.previa_exclusao_maternidade_interna(uuid, uuid) RENAME TO previa_exclusao_maternidade;
ALTER FUNCTION public.previa_exclusao_maternidade(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.individuo_usos_do_parto(uuid, uuid, uuid) SECURITY INVOKER;
GRANT EXECUTE ON FUNCTION public.previa_exclusao_maternidade(uuid, uuid) TO authenticated;
