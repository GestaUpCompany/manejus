-- Variante do relatorio de Clima para o Infografico Mensal: recebe fazenda_id direto, valida o acesso do
-- usuario autenticado e reutiliza get_dados_relatorio_clima (SECURITY DEFINER, por token) via token temporario.
-- Mesmo padrao de rodeio, cantina e almoxarifado. Aditiva: so cria a funcao nova. Rollback em supabase/rollbacks/.

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_clima_fazenda(
  p_fazenda_id uuid,
  p_data_inicio date DEFAULT NULL::date,
  p_data_fim date DEFAULT NULL::date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token uuid;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Acesso negado à fazenda';
  END IF;
  INSERT INTO public.relatorios_publicos (fazenda_id, tipo, titulo)
  VALUES (p_fazenda_id, 'clima', 'Relatório temporário')
  RETURNING id INTO v_token;
  v_result := public.get_dados_relatorio_clima(v_token, p_data_inicio, p_data_fim);
  DELETE FROM public.relatorios_publicos WHERE id = v_token;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dados_relatorio_clima_fazenda(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_clima_fazenda(uuid, date, date) TO authenticated;
