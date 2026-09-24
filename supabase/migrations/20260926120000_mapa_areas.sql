-- ==================== mapa_areas ====================
-- Polígonos do mapa que não são pastos cadastrados (lavoura, reserva legal,
-- APP, benfeitorias, servidões). Preenchida pela importação KML/KMZ quando a
-- pasta é marcada como "salvar sem associação", ou por desenho manual futuro.
-- Mesmo padrão de mapa_estradas/mapa_pontos: tenant por fazenda_id,
-- geometria Polygon 4326, soft-delete via ativo.

CREATE TABLE IF NOT EXISTS public.mapa_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'area',  -- pasta do KML ("Lavoura", "Reserva Legal") ou categoria livre
  geometria extensions.geometry(Polygon, 4326) NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mapa_areas_geometria_gist ON public.mapa_areas USING GIST (geometria);
CREATE INDEX IF NOT EXISTS mapa_areas_fazenda_id_idx ON public.mapa_areas (fazenda_id);

DROP TRIGGER IF EXISTS mapa_areas_set_updated_at ON public.mapa_areas;
CREATE TRIGGER mapa_areas_set_updated_at
  BEFORE UPDATE ON public.mapa_areas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==================== RLS ====================
ALTER TABLE public.mapa_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mapa_areas_select_fazenda" ON public.mapa_areas;
CREATE POLICY "mapa_areas_select_fazenda" ON public.mapa_areas
  FOR SELECT TO authenticated
  USING (
    fazenda_id IN (
      SELECT uf.fazenda_id
      FROM public.usuario_fazenda uf
      JOIN public.usuarios u ON u.id = uf.usuario_id
      WHERE u.auth_id = auth.uid() AND uf.ativo = true
    )
  );

DROP POLICY IF EXISTS "mapa_areas_insert_fazenda" ON public.mapa_areas;
CREATE POLICY "mapa_areas_insert_fazenda" ON public.mapa_areas
  FOR INSERT TO authenticated
  WITH CHECK (
    fazenda_id IN (
      SELECT uf.fazenda_id
      FROM public.usuario_fazenda uf
      JOIN public.usuarios u ON u.id = uf.usuario_id
      WHERE u.auth_id = auth.uid() AND uf.ativo = true
    )
  );

DROP POLICY IF EXISTS "mapa_areas_update_fazenda" ON public.mapa_areas;
CREATE POLICY "mapa_areas_update_fazenda" ON public.mapa_areas
  FOR UPDATE TO authenticated
  USING (
    fazenda_id IN (
      SELECT uf.fazenda_id
      FROM public.usuario_fazenda uf
      JOIN public.usuarios u ON u.id = uf.usuario_id
      WHERE u.auth_id = auth.uid() AND uf.ativo = true
    )
  )
  WITH CHECK (
    fazenda_id IN (
      SELECT uf.fazenda_id
      FROM public.usuario_fazenda uf
      JOIN public.usuarios u ON u.id = uf.usuario_id
      WHERE u.auth_id = auth.uid() AND uf.ativo = true
    )
  );

DROP POLICY IF EXISTS "mapa_areas_delete_fazenda" ON public.mapa_areas;
CREATE POLICY "mapa_areas_delete_fazenda" ON public.mapa_areas
  FOR DELETE TO authenticated
  USING (
    fazenda_id IN (
      SELECT uf.fazenda_id
      FROM public.usuario_fazenda uf
      JOIN public.usuarios u ON u.id = uf.usuario_id
      WHERE u.auth_id = auth.uid() AND uf.ativo = true
    )
  );

-- ==================== salvar_geometrias_mapa ====================
-- Insere em lote geometrias importadas sem associação a cadastro:
-- item {nome, tipo, categoria, geojson} onde tipo ∈ 'area' | 'estrada' | 'ponto'
-- roteia para mapa_areas / mapa_estradas / mapa_pontos. Cada item roda em
-- subtransação própria: uma falha não aborta o lote. Retorna ok/erro por idx.
CREATE OR REPLACE FUNCTION public.salvar_geometrias_mapa(
  p_fazenda_id uuid,
  p_itens jsonb
)
RETURNS TABLE(idx integer, ok boolean, erro text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_item jsonb;
  v_idx integer;
  v_tipo text;
  v_geom geometry;
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
        INSERT INTO public.mapa_areas (fazenda_id, nome, tipo, geometria)
        VALUES (
          p_fazenda_id,
          COALESCE(NULLIF(trim(v_item->>'nome'), ''), '(sem nome)'),
          COALESCE(NULLIF(trim(v_item->>'categoria'), ''), 'area'),
          v_geom::geometry(Polygon, 4326)
        );
      ELSIF v_tipo = 'estrada' THEN
        IF ST_GeometryType(v_geom) <> 'ST_LineString' THEN
          RAISE EXCEPTION 'Tipo de geometria % incompatível com estrada.', ST_GeometryType(v_geom);
        END IF;
        INSERT INTO public.mapa_estradas (fazenda_id, nome, geometria)
        VALUES (
          p_fazenda_id,
          COALESCE(NULLIF(trim(v_item->>'nome'), ''), '(sem nome)'),
          v_geom::geometry(LineString, 4326)
        );
      ELSIF v_tipo = 'ponto' THEN
        IF ST_GeometryType(v_geom) <> 'ST_Point' THEN
          RAISE EXCEPTION 'Tipo de geometria % incompatível com ponto.', ST_GeometryType(v_geom);
        END IF;
        INSERT INTO public.mapa_pontos (fazenda_id, tipo, nome, geometria)
        VALUES (
          p_fazenda_id,
          COALESCE(NULLIF(trim(v_item->>'categoria'), ''), 'outro'),
          COALESCE(NULLIF(trim(v_item->>'nome'), ''), '(sem nome)'),
          v_geom::geometry(Point, 4326)
        );
      ELSE
        RAISE EXCEPTION 'Tipo desconhecido: %', v_tipo;
      END IF;

      idx := v_idx; ok := true; erro := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      idx := v_idx; ok := false; erro := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

-- ==================== remover_area ====================
-- Remove área do mapa (delete físico, mesmo padrão de remover_estrada).
CREATE OR REPLACE FUNCTION public.remover_area(p_area_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.caller_has_fazenda_access(
    (SELECT a.fazenda_id FROM public.mapa_areas a WHERE a.id = p_area_id)
  ) THEN
    RAISE EXCEPTION 'Usuário sem acesso a esta área.';
  END IF;

  DELETE FROM public.mapa_areas WHERE id = p_area_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Área não encontrada: %', p_area_id;
  END IF;
  RETURN true;
END;
$$;
