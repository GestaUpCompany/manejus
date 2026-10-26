-- Relatorio unificado de combustivel (tipo 'combustivel'): Abastecimento + Estoque no mesmo periodo.
-- Compoe as RPCs existentes (get_dados_relatorio_abastecimento e get_dados_relatorio_estoque_combustivel)
-- sem alterar a logica delas: cria linhas temporarias em relatorios_publicos com os tipos antigos,
-- chama cada RPC e apaga as temporarias. Tudo na mesma transacao da funcao: se algo falhar, nada fica.
-- Aditiva: so cria funcoes novas. Rollback em supabase/rollbacks/.

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_combustivel(
  p_token uuid,
  p_data_inicio date DEFAULT NULL::date,
  p_data_fim date DEFAULT NULL::date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fazenda_id uuid;
  v_ativo boolean;
  v_expira timestamptz;
  v_tok_ab uuid;
  v_tok_es uuid;
  v_ab jsonb;
  v_es jsonb;
BEGIN
  SELECT fazenda_id, ativo, expira_em INTO v_fazenda_id, v_ativo, v_expira
  FROM relatorios_publicos
  WHERE id = p_token AND tipo = 'combustivel';

  IF NOT FOUND OR v_ativo = false OR (v_expira IS NOT NULL AND v_expira < now()) THEN
    RAISE EXCEPTION 'Token invalido ou expirado';
  END IF;

  INSERT INTO public.relatorios_publicos (fazenda_id, tipo, titulo)
  VALUES (v_fazenda_id, 'abastecimento', 'Relatório temporário')
  RETURNING id INTO v_tok_ab;

  INSERT INTO public.relatorios_publicos (fazenda_id, tipo, titulo)
  VALUES (v_fazenda_id, 'estoque_combustivel', 'Relatório temporário')
  RETURNING id INTO v_tok_es;

  v_ab := public.get_dados_relatorio_abastecimento(v_tok_ab, p_data_inicio, p_data_fim);
  v_es := public.get_dados_relatorio_estoque_combustivel(v_tok_es, p_data_inicio, p_data_fim);

  DELETE FROM public.relatorios_publicos WHERE id IN (v_tok_ab, v_tok_es);

  RETURN jsonb_build_object(
    'fazenda_id', v_fazenda_id,
    'dados', jsonb_build_object(
      'gerado_em', now(),
      'data_inicio', p_data_inicio,
      'data_fim', p_data_fim,
      'abastecimento', v_ab->'dados',
      'estoque', v_es->'dados'
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_combustivel(uuid, date, date) TO anon, authenticated;

-- Variante para o Infografico Mensal (usuario autenticado, sem token publico), no mesmo padrao de
-- get_dados_relatorio_estoque_combustivel_fazenda.
CREATE OR REPLACE FUNCTION public.get_dados_relatorio_combustivel_fazenda(
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
  VALUES (p_fazenda_id, 'combustivel', 'Relatório temporário')
  RETURNING id INTO v_token;
  v_result := public.get_dados_relatorio_combustivel(v_token, p_data_inicio, p_data_fim);
  DELETE FROM public.relatorios_publicos WHERE id = v_token;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dados_relatorio_combustivel_fazenda(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_combustivel_fazenda(uuid, date, date) TO authenticated;
