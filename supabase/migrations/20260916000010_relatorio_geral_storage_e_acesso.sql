INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'relatorios-gerais',
  'relatorios-gerais',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "relatorios-gerais-select" ON storage.objects;
CREATE POLICY "relatorios-gerais-select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'relatorios-gerais'
  AND (
    (storage.foldername(name))[1] = 'system'
    OR CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN public.user_has_fazenda_access(((storage.foldername(name))[1])::uuid)
      ELSE false
    END
  )
);

DROP POLICY IF EXISTS "relatorios-gerais-insert" ON storage.objects;
CREATE POLICY "relatorios-gerais-insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'relatorios-gerais'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN public.user_has_fazenda_access(((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);

DROP POLICY IF EXISTS "relatorios-gerais-update" ON storage.objects;
CREATE POLICY "relatorios-gerais-update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'relatorios-gerais'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN public.user_has_fazenda_access(((storage.foldername(name))[1])::uuid)
    ELSE false
  END
)
WITH CHECK (
  bucket_id = 'relatorios-gerais'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN public.user_has_fazenda_access(((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);

DROP POLICY IF EXISTS "relatorios-gerais-delete" ON storage.objects;
CREATE POLICY "relatorios-gerais-delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'relatorios-gerais'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN public.user_has_fazenda_access(((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_abastecimento_fazenda(
  p_fazenda_id uuid,
  p_data_inicio date,
  p_data_fim date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_token uuid;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Acesso negado à fazenda';
  END IF;
  INSERT INTO public.relatorios_publicos (fazenda_id, tipo, titulo)
  VALUES (p_fazenda_id, 'abastecimento', 'Relatório temporário')
  RETURNING id INTO v_token;
  v_result := public.get_dados_relatorio_abastecimento(v_token, p_data_inicio, p_data_fim);
  DELETE FROM public.relatorios_publicos WHERE id = v_token;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_consumo_fazenda(
  p_fazenda_id uuid,
  p_data_inicio date,
  p_data_fim date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_token uuid;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Acesso negado à fazenda';
  END IF;
  INSERT INTO public.relatorios_publicos (fazenda_id, tipo, titulo)
  VALUES (p_fazenda_id, 'consumo', 'Relatório temporário')
  RETURNING id INTO v_token;
  v_result := public.get_dados_relatorio_consumo(v_token, p_data_inicio, p_data_fim);
  DELETE FROM public.relatorios_publicos WHERE id = v_token;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_morte_fazenda(
  p_fazenda_id uuid,
  p_data_inicio date,
  p_data_fim date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_token uuid;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Acesso negado à fazenda';
  END IF;
  INSERT INTO public.relatorios_publicos (fazenda_id, tipo, titulo)
  VALUES (p_fazenda_id, 'morte', 'Relatório temporário')
  RETURNING id INTO v_token;
  v_result := public.get_dados_relatorio_morte(v_token, p_data_inicio, p_data_fim);
  DELETE FROM public.relatorios_publicos WHERE id = v_token;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_bebedouros_permitidos_relatorio_fazenda(
  p_fazenda_id uuid
) RETURNS TABLE (bebedouro_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_token uuid;
BEGIN
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Acesso negado à fazenda';
  END IF;
  INSERT INTO public.relatorios_publicos (fazenda_id, tipo, titulo)
  VALUES (p_fazenda_id, 'bebedouros', 'Relatório temporário')
  RETURNING id INTO v_token;
  RETURN QUERY SELECT permitido.bebedouro_id
  FROM public.get_bebedouros_permitidos_relatorio(v_token) permitido;
  DELETE FROM public.relatorios_publicos WHERE id = v_token;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dados_relatorio_abastecimento_fazenda(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_dados_relatorio_consumo_fazenda(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_dados_relatorio_morte_fazenda(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_bebedouros_permitidos_relatorio_fazenda(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_abastecimento_fazenda(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_consumo_fazenda(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_morte_fazenda(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bebedouros_permitidos_relatorio_fazenda(uuid) TO authenticated;
