-- ==================== Dedupe em salvar_geometrias_mapa ====================
-- Reimportar o mesmo KML (ou arquivos sobrepostos) não deve duplicar
-- geometrias genéricas. Antes de inserir, checa se já existe geometria
-- topologicamente igual (ST_Equals, com && para usar o GiST) na mesma
-- fazenda e mesma tabela de destino. Duplicata não é erro: retorna
-- duplicada=true com ok=true para a UI remover a linha sem gravar de novo.
-- O EXISTS dentro do loop também pega duplicatas dentro do próprio lote.
-- Mudança de assinatura (nova coluna) exige DROP + CREATE.

DROP FUNCTION IF EXISTS public.salvar_geometrias_mapa(uuid, jsonb);

CREATE FUNCTION public.salvar_geometrias_mapa(
  p_fazenda_id uuid,
  p_itens jsonb
)
RETURNS TABLE(idx integer, ok boolean, duplicada boolean, erro text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_item jsonb;
  v_idx integer;
  v_tipo text;
  v_geom geometry;
  v_existe boolean;
BEGIN
  IF NOT public.caller_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Usuário sem acesso à fazenda informada.';
  END IF;

  FOR v_idx, v_item IN
    SELECT (ord - 1)::int, value FROM jsonb_array_elements(p_itens) WITH ORDINALITY AS t(value, ord)
  LOOP
    BEGIN
      v_tipo := v_item->>'tipo';
      v_geom := ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(v_item->>'geojson'), 4326));

      IF NOT ST_IsValid(v_geom) THEN
        v_geom := ST_Force2D(ST_MakeValid(v_geom));
        IF v_geom IS NULL OR NOT ST_IsValid(v_geom) THEN
          RAISE EXCEPTION 'Geometria inválida e não pôde ser corrigida.';
        END IF;
      END IF;

      -- Multi* e coleções: fica com a primeira geometria simples
      IF ST_NumGeometries(v_geom) > 1 THEN
        v_geom := ST_GeometryN(v_geom, 1);
      END IF;

      IF v_tipo = 'area' THEN
        IF ST_GeometryType(v_geom) <> 'ST_Polygon' THEN
          RAISE EXCEPTION 'Tipo de geometria % incompatível com area.', ST_GeometryType(v_geom);
        END IF;
        SELECT EXISTS (
          SELECT 1 FROM public.mapa_areas a
          WHERE a.fazenda_id = p_fazenda_id AND a.ativo
            AND a.geometria && v_geom AND ST_Equals(a.geometria, v_geom)
        ) INTO v_existe;
        IF NOT v_existe THEN
          INSERT INTO public.mapa_areas (fazenda_id, nome, tipo, geometria)
          VALUES (
            p_fazenda_id,
            COALESCE(NULLIF(trim(v_item->>'nome'), ''), '(sem nome)'),
            COALESCE(NULLIF(trim(v_item->>'categoria'), ''), 'area'),
            v_geom::geometry(Polygon, 4326)
          );
        END IF;
      ELSIF v_tipo = 'estrada' THEN
        IF ST_GeometryType(v_geom) <> 'ST_LineString' THEN
          RAISE EXCEPTION 'Tipo de geometria % incompatível com estrada.', ST_GeometryType(v_geom);
        END IF;
        SELECT EXISTS (
          SELECT 1 FROM public.mapa_estradas e
          WHERE e.fazenda_id = p_fazenda_id AND e.ativo
            AND e.geometria && v_geom AND ST_Equals(e.geometria, v_geom)
        ) INTO v_existe;
        IF NOT v_existe THEN
          INSERT INTO public.mapa_estradas (fazenda_id, nome, geometria)
          VALUES (
            p_fazenda_id,
            COALESCE(NULLIF(trim(v_item->>'nome'), ''), '(sem nome)'),
            v_geom::geometry(LineString, 4326)
          );
        END IF;
      ELSIF v_tipo = 'ponto' THEN
        IF ST_GeometryType(v_geom) <> 'ST_Point' THEN
          RAISE EXCEPTION 'Tipo de geometria % incompatível com ponto.', ST_GeometryType(v_geom);
        END IF;
        SELECT EXISTS (
          SELECT 1 FROM public.mapa_pontos p
          WHERE p.fazenda_id = p_fazenda_id AND p.ativo
            AND p.geometria && v_geom AND ST_Equals(p.geometria, v_geom)
        ) INTO v_existe;
        IF NOT v_existe THEN
          INSERT INTO public.mapa_pontos (fazenda_id, tipo, nome, geometria)
          VALUES (
            p_fazenda_id,
            COALESCE(NULLIF(trim(v_item->>'categoria'), ''), 'outro'),
            COALESCE(NULLIF(trim(v_item->>'nome'), ''), '(sem nome)'),
            v_geom::geometry(Point, 4326)
          );
        END IF;
      ELSE
        RAISE EXCEPTION 'Tipo desconhecido: %', v_tipo;
      END IF;

      idx := v_idx; ok := true; duplicada := v_existe; erro := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      idx := v_idx; ok := false; duplicada := false; erro := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.salvar_geometrias_mapa(uuid, jsonb) TO authenticated;
