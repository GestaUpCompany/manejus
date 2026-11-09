-- RPC de exclusão (soft-delete) de lote.
-- Motivo: o UPDATE direto em lotes (SET deleted_at) é recusado pela RLS com 42501, porque a policy
-- de SELECT (lotes_select_fazenda) esconde linhas com deleted_at preenchido e o Postgres confere a nova
-- linha contra ela. A RPC confere o acesso à fazenda do lote e faz o soft-delete como SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.excluir_lote(p_lote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fazenda_id uuid;
BEGIN
  SELECT fazenda_id INTO v_fazenda_id
  FROM public.lotes
  WHERE id = p_lote_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado ou já excluído' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.caller_has_fazenda_access(v_fazenda_id) THEN
    RAISE EXCEPTION 'Sem acesso à fazenda deste lote' USING ERRCODE = '42501';
  END IF;

  UPDATE public.lotes
     SET deleted_at = now(),
         ativo = false
   WHERE id = p_lote_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.excluir_lote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_lote(uuid) TO authenticated, service_role;
