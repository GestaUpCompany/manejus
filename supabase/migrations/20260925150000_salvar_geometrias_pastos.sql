-- ==================== salvar_geometrias_pastos ====================
-- Versão em lote de salvar_geometria_pasto para a tela de revisão de
-- importação KML/KMZ: recebe um array JSONB de {pasto_id, geojson} e
-- aplica cada item em subtransação própria, retornando ok/erro por item
-- (uma falha não aborta o lote). Mesma lógica de validação da versão
-- unitária (acesso, SRID 4326, Force2D, MakeValid, Polygon simples).
CREATE OR REPLACE FUNCTION public.salvar_geometrias_pastos(p_itens jsonb)
RETURNS TABLE(pasto_id uuid, ok boolean, erro text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_item jsonb;
  v_pasto_id uuid;
  v_geom geometry;
  v_valid boolean;
BEGIN
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    BEGIN
      v_pasto_id := (v_item->>'pasto_id')::uuid;

      IF NOT public.caller_has_fazenda_access(
        (SELECT p.fazenda_id FROM public.pastos p WHERE p.id = v_pasto_id)
      ) THEN
        RAISE EXCEPTION 'Usuário sem acesso a este pasto.';
      END IF;

      -- Converter GeoJSON para geometry
      v_geom := ST_GeomFromGeoJSON(v_item->>'geojson');

      -- Garantir SRID 4326
      v_geom := ST_SetSRID(v_geom, 4326);

      -- Remover dimensão Z (KMLs do Google Earth trazem altitude)
      v_geom := ST_Force2D(v_geom);

      -- Validar geometria
      v_valid := ST_IsValid(v_geom);
      IF NOT v_valid THEN
        -- Tentar corrigir com ST_MakeValid e forçar 2D novamente
        v_geom := ST_Force2D(ST_MakeValid(v_geom));
        IF v_geom IS NULL OR NOT ST_IsValid(v_geom) THEN
          RAISE EXCEPTION 'Geometria inválida e não pôde ser corrigida com ST_MakeValid.';
        END IF;
      END IF;

      -- ST_MakeValid pode retornar MultiPolygon; garantir Polygon simples
      IF ST_GeometryType(v_geom) = 'ST_MultiPolygon' THEN
        v_geom := ST_GeometryN(v_geom, 1);
      END IF;

      -- Salvar no pasto
      UPDATE public.pastos
      SET geometria = v_geom::geometry(Polygon, 4326),
          updated_at = now()
      WHERE id = v_pasto_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Pasto não encontrado: %', v_pasto_id;
      END IF;

      pasto_id := v_pasto_id;
      ok := true;
      erro := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      pasto_id := v_pasto_id;
      ok := false;
      erro := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
  RETURN;
END;
$$;
