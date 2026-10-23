-- ============================================================================
-- Maternidade: prévia de exclusão chamável pelo painel (corrige 403 / 42501)
-- ============================================================================
-- Achado no teste pelo painel (23/10/2026, usuário controller): previa_exclusao_maternidade devolvia
-- 42501 "permission denied for function individuo_usos_do_parto" (faltava GRANT) e, mesmo com GRANT, as
-- consultas rodariam sob a RLS do usuário, podendo esconder usos do animal e liberar uma exclusão indevida.
--
-- Ação: a lógica da prévia passa para previa_exclusao_maternidade_interna (SECURITY DEFINER, sem acesso
-- direto); previa_exclusao_maternidade vira um wrapper SECURITY DEFINER que exige caller_has_fazenda_access
-- e só então chama a interna. individuo_usos_do_parto vira SECURITY DEFINER e fica sem acesso direto.
-- excluir_registro_maternidade (já SECURITY DEFINER) segue chamando o wrapper.
-- Impacto no PWA: nenhum. Rollback:
-- supabase/rollbacks/20261023110000_maternidade_previa_exclusao_security_definer_rollback.sql
-- ============================================================================

ALTER FUNCTION public.individuo_usos_do_parto(uuid, uuid, uuid)
  SECURITY DEFINER SET search_path TO 'public';

ALTER FUNCTION public.previa_exclusao_maternidade(uuid, uuid)
  RENAME TO previa_exclusao_maternidade_interna;

ALTER FUNCTION public.previa_exclusao_maternidade_interna(uuid, uuid)
  SECURITY DEFINER SET search_path TO 'public';

CREATE OR REPLACE FUNCTION public.previa_exclusao_maternidade(p_id uuid, p_fazenda_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.caller_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;
  RETURN public.previa_exclusao_maternidade_interna(p_id, p_fazenda_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.individuo_usos_do_parto(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.previa_exclusao_maternidade_interna(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.previa_exclusao_maternidade(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.previa_exclusao_maternidade(uuid, uuid) TO authenticated;
