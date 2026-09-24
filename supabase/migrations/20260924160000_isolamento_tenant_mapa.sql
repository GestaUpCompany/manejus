-- Migration: isolamento de tenant no módulo de mapas
-- Problema: todas as RPCs de mapa são SECURITY DEFINER e confiam no parâmetro
-- p_fazenda_id (ou no id do objeto) sem verificar se o chamador tem acesso à
-- fazenda. Qualquer usuário autenticado podia ler e alterar geometrias de
-- qualquer fazenda. Além disso:
--   - mapa_versao tinha SELECT USING(true) para anon e authenticated
--   - mapa_estradas_vertices_pgr (topologia pgRouting) tinha RLS desabilitado
--     com grants para anon e authenticated
--
-- Correção:
--   1. Helper caller_has_fazenda_access: usuario_fazenda (usuarios.auth_id) OU
--      peão autenticado via email do JWT (mesmo padrão de current_user_has_access)
--   2. Todas as RPCs de mapa/routing passam a validar o vínculo do chamador
--   3. Policies de SELECT de mapa_versao/mapa_estradas/mapa_pontos passam a usar
--      o helper (cobre peões do PWA, que possuem usuarios + usuario_fazenda)
--   4. mapa_estradas_vertices_pgr: RLS habilitado sem policies (deny all direto)
--      e grants revogados; só as funções SECURITY DEFINER acessam
--
-- Nota: a topologia de rotas (mapa_estradas_vertices_pgr + source/target) é
-- global entre fazendas por design (farms são geograficamente distantes). O
-- check de acesso impede disparo não autorizado, mas o rebuild continua global.

-- ==================== Helper de acesso ====================
CREATE OR REPLACE FUNCTION public.caller_has_fazenda_access(p_fazenda_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT public.user_has_fazenda_access(p_fazenda_id)
     OR EXISTS (
          SELECT 1
          FROM public.peoes p
          JOIN public.fazendas f ON f.acesso_id = p.fazenda_id
          WHERE f.id = p_fazenda_id
            AND lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
            AND coalesce(p.ativo, false) = true
            AND coalesce(f.ativo, false) = true
        );
$$;

GRANT EXECUTE ON FUNCTION public.caller_has_fazenda_access(uuid) TO authenticated;

-- ==================== RPCs de leitura (LANGUAGE sql: predicado no WHERE) ====================

CREATE OR REPLACE FUNCTION public.get_pastos_com_geometria(p_fazenda_id uuid)
RETURNS TABLE (
  id uuid,
  nome text,
  setor text,
  tipo text,
  area_total_ha numeric,
  area_util_ha numeric,
  especie text,
  ativo boolean,
  metragem_cocho_m numeric,
  possui_deposito boolean,
  fonte_agua_principal text,
  modulo_nome text,
  geometria_geojson text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    p.id,
    p.nome,
    p.setor,
    p.tipo,
    p.area_total_ha,
    p.area_util_ha,
    p.especie,
    p.ativo,
    p.metragem_cocho_m,
    p.possui_deposito,
    p.fonte_agua_principal,
    mp.nome AS modulo_nome,
    ST_AsGeoJSON(p.geometria)::text AS geometria_geojson
  FROM public.pastos p
  LEFT JOIN public.modulos_pastos mp ON mp.id = p.modulo_id
  WHERE p.fazenda_id = p_fazenda_id
    AND public.caller_has_fazenda_access(p_fazenda_id)
    AND p.geometria IS NOT NULL
    AND p.deleted_at IS NULL
  ORDER BY p.nome;
$$;

CREATE OR REPLACE FUNCTION public.get_bebedouros_com_geometria(p_fazenda_id uuid)
RETURNS TABLE (
  id uuid,
  nome text,
  capacidade numeric,
  geometria_geojson text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    b.id,
    b.nome,
    b.capacidade,
    ST_AsGeoJSON(b.geometria)::text AS geometria_geojson
  FROM public.bebedouros b
  WHERE b.fazenda_id = p_fazenda_id
    AND public.caller_has_fazenda_access(p_fazenda_id)
    AND b.geometria IS NOT NULL
    AND b.ativo = true
  ORDER BY b.nome;
$$;

CREATE OR REPLACE FUNCTION public.encontrar_pasto_por_ponto(
  p_fazenda_id uuid,
  p_ponto_geojson text
)
RETURNS TABLE (
  id uuid,
  nome text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT p.id, p.nome
  FROM public.pastos p
  WHERE p.fazenda_id = p_fazenda_id
    AND public.caller_has_fazenda_access(p_fazenda_id)
    AND p.geometria IS NOT NULL
    AND p.deleted_at IS NULL
    AND ST_Contains(p.geometria, ST_SetSRID(ST_GeomFromGeoJSON(p_ponto_geojson), 4326))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_lote_por_pasto(p_pasto_id uuid)
RETURNS TABLE (
  id uuid,
  nome text,
  cabecas_atual bigint,
  raca text,
  sexo text,
  peso_medio_atual_kg numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    l.id,
    l.nome,
    COALESCE((
      SELECT SUM(lc.quant_atual)
      FROM lote_categorias lc
      WHERE lc.lote_id = l.id AND lc.ativo = true AND lc.quant_atual > 0
    ), 0) AS cabecas_atual,
    l.raca,
    l.sexo,
    CASE
      WHEN COALESCE((
        SELECT SUM(lc.quant_atual)
        FROM lote_categorias lc
        WHERE lc.lote_id = l.id AND lc.ativo = true AND lc.quant_atual > 0
      ), 0) > 0
      THEN round(
        COALESCE((
          SELECT SUM(lc.quant_atual * lc.peso_vivo_atual_kg_cab)
          FROM lote_categorias lc
          WHERE lc.lote_id = l.id AND lc.ativo = true AND lc.quant_atual > 0 AND lc.peso_vivo_atual_kg_cab IS NOT NULL
        ), 0) /
        COALESCE((
          SELECT SUM(lc.quant_atual)
          FROM lote_categorias lc
          WHERE lc.lote_id = l.id AND lc.ativo = true AND lc.quant_atual > 0 AND lc.peso_vivo_atual_kg_cab IS NOT NULL
        ), 1),
        2
      )
      ELSE NULL
    END AS peso_medio_atual_kg
  FROM lotes l
  WHERE l.pasto_id = p_pasto_id
    AND public.caller_has_fazenda_access(
      (SELECT p.fazenda_id FROM public.pastos p WHERE p.id = p_pasto_id)
    )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_lote_por_curral(p_curral_id uuid)
RETURNS TABLE (
  id uuid,
  nome text,
  cabecas_atual bigint,
  raca text,
  sexo text,
  peso_medio_atual_kg numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    l.id,
    l.nome,
    COALESCE((
      SELECT SUM(lc.quant_atual)
      FROM lote_categorias lc
      WHERE lc.lote_id = l.id AND lc.ativo = true AND lc.quant_atual > 0
    ), 0) AS cabecas_atual,
    l.raca,
    l.sexo,
    CASE
      WHEN COALESCE((
        SELECT SUM(lc.quant_atual)
        FROM lote_categorias lc
        WHERE lc.lote_id = l.id AND lc.ativo = true AND lc.quant_atual > 0
      ), 0) > 0
      THEN round(
        COALESCE((
          SELECT SUM(lc.quant_atual * lc.peso_vivo_atual_kg_cab)
          FROM lote_categorias lc
          WHERE lc.lote_id = l.id AND lc.ativo = true AND lc.quant_atual > 0 AND lc.peso_vivo_atual_kg_cab IS NOT NULL
        ), 0) /
        COALESCE((
          SELECT SUM(lc.quant_atual)
          FROM lote_categorias lc
          WHERE lc.lote_id = l.id AND lc.ativo = true AND lc.quant_atual > 0 AND lc.peso_vivo_atual_kg_cab IS NOT NULL
        ), 1),
        2
      )
      ELSE NULL
    END AS peso_medio_atual_kg
  FROM lotes l
  JOIN currais c ON c.lote_id = l.id
  WHERE c.id = p_curral_id
    AND public.caller_has_fazenda_access(c.fazenda_id)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_detalhes_pasto_mapa(p_pasto_id uuid)
RETURNS TABLE(
  pasto_id uuid,
  pasto_nome text,
  setor text,
  tipo text,
  area_total_ha numeric,
  area_util_ha numeric,
  especie text,
  metragem_cocho_m numeric,
  fonte_agua_principal text,
  modulo_nome text,
  lote_id uuid,
  lote_nome text,
  lote_cabecas bigint,
  lote_raca text,
  lote_sexo text,
  lote_peso_medio_kg numeric,
  categorias json
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    p.id, p.nome, p.setor, p.tipo, p.area_total_ha, p.area_util_ha,
    p.especie, p.metragem_cocho_m, p.fonte_agua_principal,
    mp.nome AS modulo_nome,
    l.id AS lote_id, l.nome AS lote_nome,
    COALESCE((SELECT SUM(lc.quant_atual) FROM lote_categorias lc WHERE lc.lote_id = l.id AND lc.ativo = true AND lc.quant_atual > 0), 0),
    l.raca, l.sexo,
    CASE WHEN COALESCE((SELECT SUM(lc.quant_atual) FROM lote_categorias lc WHERE lc.lote_id = l.id AND lc.ativo = true AND lc.quant_atual > 0), 0) > 0
      THEN round(COALESCE((SELECT SUM(lc.quant_atual * lc.peso_vivo_atual_kg_cab) FROM lote_categorias lc WHERE lc.lote_id = l.id AND lc.ativo = true AND lc.quant_atual > 0 AND lc.peso_vivo_atual_kg_cab IS NOT NULL), 0) / COALESCE((SELECT SUM(lc.quant_atual) FROM lote_categorias lc WHERE lc.lote_id = l.id AND lc.ativo = true AND lc.quant_atual > 0 AND lc.peso_vivo_atual_kg_cab IS NOT NULL), 1), 2)
      ELSE NULL END,
    (SELECT json_agg(json_build_object('categoria', lc.categoria, 'quant_atual', lc.quant_atual, 'peso_vivo_kg', lc.peso_vivo_atual_kg_cab, 'formulacao_nome', f.nome, 'formulacao_id', lc.formulacao_id))
     FROM lote_categorias lc LEFT JOIN formulacoes f ON f.id = lc.formulacao_id
     WHERE lc.lote_id = l.id AND lc.ativo = true AND lc.quant_atual > 0)
  FROM pastos p
  LEFT JOIN modulos_pastos mp ON mp.id = p.modulo_id
  LEFT JOIN lotes l ON l.pasto_id = p.id AND l.deleted_at IS NULL
  WHERE p.id = p_pasto_id
    AND public.caller_has_fazenda_access(p.fazenda_id)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_detalhes_curral_mapa(p_curral_id uuid)
RETURNS TABLE(
  curral_id uuid,
  curral_nome text,
  largura_m numeric,
  comprimento_m numeric,
  metros_cocho_m numeric,
  formulacao_nome text,
  lote_id uuid,
  lote_nome text,
  lote_cabecas bigint,
  lote_raca text,
  lote_sexo text,
  lote_peso_medio_kg numeric,
  categorias json
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    c.id, c.nome,
    lc_conf.largura_m, lc_conf.comprimento_m, lc_conf.metros_cocho_m,
    f.nome AS formulacao_nome,
    l.id AS lote_id, l.nome AS lote_nome,
    COALESCE((SELECT SUM(lc.quant_atual) FROM lote_categorias lc WHERE lc.lote_id = l.id AND lc.ativo = true AND lc.quant_atual > 0), 0),
    l.raca, l.sexo,
    CASE WHEN COALESCE((SELECT SUM(lc.quant_atual) FROM lote_categorias lc WHERE lc.lote_id = l.id AND lc.ativo = true AND lc.quant_atual > 0), 0) > 0
      THEN round(COALESCE((SELECT SUM(lc.quant_atual * lc.peso_vivo_atual_kg_cab) FROM lote_categorias lc WHERE lc.lote_id = l.id AND lc.ativo = true AND lc.quant_atual > 0 AND lc.peso_vivo_atual_kg_cab IS NOT NULL), 0) / COALESCE((SELECT SUM(lc.quant_atual) FROM lote_categorias lc WHERE lc.lote_id = l.id AND lc.ativo = true AND lc.quant_atual > 0 AND lc.peso_vivo_atual_kg_cab IS NOT NULL), 1), 2)
      ELSE NULL END,
    (SELECT json_agg(json_build_object('categoria', lc.categoria, 'quant_atual', lc.quant_atual, 'peso_vivo_kg', lc.peso_vivo_atual_kg_cab, 'formulacao_nome', lf.nome, 'formulacao_id', lc.formulacao_id))
     FROM lote_categorias lc LEFT JOIN formulacoes lf ON lf.id = lc.formulacao_id
     WHERE lc.lote_id = l.id AND lc.ativo = true AND lc.quant_atual > 0)
  FROM currais c
  LEFT JOIN linhas_confinamento lc_conf ON lc_conf.id = c.linha_id
  LEFT JOIN lotes l ON l.id = c.lote_id AND l.deleted_at IS NULL
  LEFT JOIN formulacoes f ON f.id = l.formulacao_id
  WHERE c.id = p_curral_id
    AND public.caller_has_fazenda_access(c.fazenda_id)
  LIMIT 1;
$$;

-- ==================== RPCs plpgsql: guarda no início do BEGIN ====================

CREATE OR REPLACE FUNCTION public.get_currais_com_geometria(p_fazenda_id uuid)
RETURNS TABLE(id uuid, nome text, lote_id uuid, geometria json)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.caller_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Usuário sem acesso à fazenda informada.';
  END IF;

  RETURN QUERY
  SELECT c.id, c.nome, c.lote_id, ST_AsGeoJSON(c.geometria)::json
  FROM public.currais c
  WHERE c.fazenda_id = p_fazenda_id
    AND c.geometria IS NOT NULL
    AND c.deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_geometria_pasto(
  p_pasto_id uuid,
  p_geometria_geojson text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_geom geometry;
  v_valid boolean;
BEGIN
  IF NOT public.caller_has_fazenda_access(
    (SELECT p.fazenda_id FROM public.pastos p WHERE p.id = p_pasto_id)
  ) THEN
    RAISE EXCEPTION 'Usuário sem acesso a este pasto.';
  END IF;

  -- Converter GeoJSON para geometry
  v_geom := ST_GeomFromGeoJSON(p_geometria_geojson);

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
  WHERE id = p_pasto_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pasto não encontrado: %', p_pasto_id;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_geometria_bebedouro(
  p_bebedouro_id uuid,
  p_geometria_geojson text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_geom geometry;
  v_valid boolean;
BEGIN
  IF NOT public.caller_has_fazenda_access(
    (SELECT b.fazenda_id FROM public.bebedouros b WHERE b.id = p_bebedouro_id)
  ) THEN
    RAISE EXCEPTION 'Usuário sem acesso a este bebedouro.';
  END IF;

  v_geom := ST_GeomFromGeoJSON(p_geometria_geojson);
  v_geom := ST_SetSRID(v_geom, 4326);
  v_geom := ST_Force2D(v_geom);

  v_valid := ST_IsValid(v_geom);
  IF NOT v_valid THEN
    v_geom := ST_Force2D(ST_MakeValid(v_geom));
    IF v_geom IS NULL OR NOT ST_IsValid(v_geom) THEN
      RAISE EXCEPTION 'Geometria inválida e não pôde ser corrigida com ST_MakeValid.';
    END IF;
  END IF;

  UPDATE public.bebedouros
  SET geometria = v_geom::geometry(Point, 4326),
      updated_at = now()
  WHERE id = p_bebedouro_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bebedouro não encontrado: %', p_bebedouro_id;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_geometria_pasto(p_pasto_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.caller_has_fazenda_access(
    (SELECT p.fazenda_id FROM public.pastos p WHERE p.id = p_pasto_id)
  ) THEN
    RAISE EXCEPTION 'Usuário sem acesso a este pasto.';
  END IF;

  UPDATE public.pastos SET geometria = NULL, updated_at = now() WHERE id = p_pasto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pasto não encontrado: %', p_pasto_id;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_geometria_bebedouro(p_bebedouro_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.caller_has_fazenda_access(
    (SELECT b.fazenda_id FROM public.bebedouros b WHERE b.id = p_bebedouro_id)
  ) THEN
    RAISE EXCEPTION 'Usuário sem acesso a este bebedouro.';
  END IF;

  UPDATE public.bebedouros SET geometria = NULL, updated_at = now() WHERE id = p_bebedouro_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bebedouro não encontrado: %', p_bebedouro_id;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_geometrias_lote(
  p_pasto_ids uuid[],
  p_remover_bebedouros boolean DEFAULT false
)
RETURNS TABLE (pastos_removidos integer, bebedouros_removidos integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_pastos_count integer;
  v_bebedouros_count integer;
  v_bebedouro_ids uuid[];
BEGIN
  -- Negar se qualquer pasto do array pertencer a fazenda sem acesso do chamador
  IF EXISTS (
    SELECT 1 FROM public.pastos pt
    WHERE pt.id = ANY(p_pasto_ids)
      AND NOT public.caller_has_fazenda_access(pt.fazenda_id)
  ) THEN
    RAISE EXCEPTION 'Usuário sem acesso a um ou mais pastos informados.';
  END IF;

  -- Remover geometrias dos pastos
  UPDATE public.pastos
  SET geometria = NULL, updated_at = now()
  WHERE id = ANY(p_pasto_ids) AND geometria IS NOT NULL;

  GET DIAGNOSTICS v_pastos_count = ROW_COUNT;

  -- Opcionalmente remover geometrias dos bebedouros associados
  IF p_remover_bebedouros THEN
    -- Coletar IDs de bebedouros associados aos pastos selecionados
    SELECT array_agg(DISTINCT pb.bebedouro_id)
    INTO v_bebedouro_ids
    FROM public.pasto_bebedouros pb
    WHERE pb.pasto_id = ANY(p_pasto_ids);

    IF v_bebedouro_ids IS NOT NULL THEN
      UPDATE public.bebedouros
      SET geometria = NULL, updated_at = now()
      WHERE id = ANY(v_bebedouro_ids) AND geometria IS NOT NULL;

      GET DIAGNOSTICS v_bebedouros_count = ROW_COUNT;
    ELSE
      v_bebedouros_count := 0;
    END IF;
  ELSE
    v_bebedouros_count := 0;
  END IF;

  RETURN QUERY SELECT v_pastos_count, v_bebedouros_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_estrada(
  p_fazenda_id uuid,
  p_nome text,
  p_geometria_geojson text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_geom geometry;
  v_valid boolean;
  v_id uuid;
BEGIN
  IF NOT public.caller_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Usuário sem acesso à fazenda informada.';
  END IF;

  v_geom := ST_GeomFromGeoJSON(p_geometria_geojson);
  v_geom := ST_SetSRID(v_geom, 4326);
  v_geom := ST_Force2D(v_geom);

  v_valid := ST_IsValid(v_geom);
  IF NOT v_valid THEN
    v_geom := ST_Force2D(ST_MakeValid(v_geom));
    IF v_geom IS NULL OR NOT ST_IsValid(v_geom) THEN
      RAISE EXCEPTION 'Geometria inválida e não pôde ser corrigida.';
    END IF;
  END IF;

  INSERT INTO public.mapa_estradas (fazenda_id, nome, geometria)
  VALUES (p_fazenda_id, p_nome, v_geom::geometry(LineString, 4326))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_estrada(
  p_estrada_id uuid,
  p_nome text DEFAULT NULL,
  p_geometria_geojson text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_geom geometry;
BEGIN
  IF NOT public.caller_has_fazenda_access(
    (SELECT e.fazenda_id FROM public.mapa_estradas e WHERE e.id = p_estrada_id)
  ) THEN
    RAISE EXCEPTION 'Usuário sem acesso a esta estrada.';
  END IF;

  IF p_geometria_geojson IS NOT NULL THEN
    v_geom := ST_GeomFromGeoJSON(p_geometria_geojson);
    v_geom := ST_SetSRID(v_geom, 4326);
    v_geom := ST_Force2D(v_geom);

    IF NOT ST_IsValid(v_geom) THEN
      v_geom := ST_Force2D(ST_MakeValid(v_geom));
      IF v_geom IS NULL OR NOT ST_IsValid(v_geom) THEN
        RAISE EXCEPTION 'Geometria inválida.';
      END IF;
    END IF;

    UPDATE public.mapa_estradas
    SET geometria = v_geom::geometry(LineString, 4326), updated_at = now()
    WHERE id = p_estrada_id;
  END IF;

  IF p_nome IS NOT NULL THEN
    UPDATE public.mapa_estradas
    SET nome = p_nome, updated_at = now()
    WHERE id = p_estrada_id;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_estrada(p_estrada_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.caller_has_fazenda_access(
    (SELECT e.fazenda_id FROM public.mapa_estradas e WHERE e.id = p_estrada_id)
  ) THEN
    RAISE EXCEPTION 'Usuário sem acesso a esta estrada.';
  END IF;

  DELETE FROM public.mapa_estradas WHERE id = p_estrada_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estrada não encontrada: %', p_estrada_id;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_ponto(
  p_fazenda_id uuid,
  p_tipo text,
  p_nome text,
  p_geometria_geojson text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_geom geometry;
  v_id uuid;
BEGIN
  IF NOT public.caller_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Usuário sem acesso à fazenda informada.';
  END IF;

  v_geom := ST_GeomFromGeoJSON(p_geometria_geojson);
  v_geom := ST_SetSRID(v_geom, 4326);
  v_geom := ST_Force2D(v_geom);

  IF NOT ST_IsValid(v_geom) THEN
    v_geom := ST_Force2D(ST_MakeValid(v_geom));
    IF v_geom IS NULL OR NOT ST_IsValid(v_geom) THEN
      RAISE EXCEPTION 'Geometria inválida.';
    END IF;
  END IF;

  INSERT INTO public.mapa_pontos (fazenda_id, tipo, nome, geometria)
  VALUES (p_fazenda_id, p_tipo, p_nome, v_geom::geometry(Geometry, 4326))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_ponto(
  p_ponto_id uuid,
  p_tipo text DEFAULT NULL,
  p_nome text DEFAULT NULL,
  p_geometria_geojson text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_geom geometry;
BEGIN
  IF NOT public.caller_has_fazenda_access(
    (SELECT mp.fazenda_id FROM public.mapa_pontos mp WHERE mp.id = p_ponto_id)
  ) THEN
    RAISE EXCEPTION 'Usuário sem acesso a este ponto.';
  END IF;

  IF p_geometria_geojson IS NOT NULL THEN
    v_geom := ST_GeomFromGeoJSON(p_geometria_geojson);
    v_geom := ST_SetSRID(v_geom, 4326);
    v_geom := ST_Force2D(v_geom);

    IF NOT ST_IsValid(v_geom) THEN
      v_geom := ST_Force2D(ST_MakeValid(v_geom));
      IF v_geom IS NULL OR NOT ST_IsValid(v_geom) THEN
        RAISE EXCEPTION 'Geometria inválida.';
      END IF;
    END IF;

    UPDATE public.mapa_pontos
    SET geometria = v_geom::geometry(Geometry, 4326), updated_at = now()
    WHERE id = p_ponto_id;
  END IF;

  IF p_tipo IS NOT NULL THEN
    UPDATE public.mapa_pontos SET tipo = p_tipo, updated_at = now() WHERE id = p_ponto_id;
  END IF;

  IF p_nome IS NOT NULL THEN
    UPDATE public.mapa_pontos SET nome = p_nome, updated_at = now() WHERE id = p_ponto_id;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_ponto(p_ponto_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.caller_has_fazenda_access(
    (SELECT mp.fazenda_id FROM public.mapa_pontos mp WHERE mp.id = p_ponto_id)
  ) THEN
    RAISE EXCEPTION 'Usuário sem acesso a este ponto.';
  END IF;

  DELETE FROM public.mapa_pontos WHERE id = p_ponto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ponto não encontrado: %', p_ponto_id;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_geometria_curral(
  p_curral_id uuid,
  p_geometria_geojson text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_geom geometry;
BEGIN
  IF NOT public.caller_has_fazenda_access(
    (SELECT c.fazenda_id FROM public.currais c WHERE c.id = p_curral_id)
  ) THEN
    RAISE EXCEPTION 'Usuário sem acesso a este curral.';
  END IF;

  v_geom := ST_GeomFromGeoJSON(p_geometria_geojson);
  v_geom := ST_SetSRID(v_geom, 4326);
  v_geom := ST_Force2D(v_geom);

  IF NOT ST_IsValid(v_geom) THEN
    v_geom := ST_Force2D(ST_MakeValid(v_geom));
    IF v_geom IS NULL OR NOT ST_IsValid(v_geom) THEN
      RAISE EXCEPTION 'Geometria inválida.';
    END IF;
  END IF;

  UPDATE public.currais
  SET geometria = v_geom::geometry(Polygon, 4326), updated_at = now()
  WHERE id = p_curral_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Curral não encontrado: %', p_curral_id;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_geometria_curral(p_curral_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.caller_has_fazenda_access(
    (SELECT c.fazenda_id FROM public.currais c WHERE c.id = p_curral_id)
  ) THEN
    RAISE EXCEPTION 'Usuário sem acesso a este curral.';
  END IF;

  UPDATE public.currais
  SET geometria = NULL, updated_at = now()
  WHERE id = p_curral_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Curral não encontrado: %', p_curral_id;
  END IF;

  RETURN true;
END;
$$;

-- ==================== RPCs de routing ====================
-- A topologia (mapa_estradas_vertices_pgr + source/target) é global entre
-- fazendas por design; o guard abaixo impede disparo por quem não tem acesso.

CREATE OR REPLACE FUNCTION public.encontrar_rota(p_fazenda_id uuid, p_origem_geojson text, p_destino_geojson text, p_tolerancia_m integer DEFAULT 50)
 RETURNS TABLE(rota json, distancia_m double precision, encontrou boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_origem geometry;
  v_destino geometry;
  v_start_vid bigint;
  v_end_vid bigint;
  v_rota geometry;
  v_dist double precision;
  v_estradas_count integer;
BEGIN
  IF NOT public.caller_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Usuário sem acesso à fazenda informada.';
  END IF;

  v_origem := ST_SetSRID(ST_Force2D(ST_GeomFromGeoJSON(p_origem_geojson)), 4326);
  v_destino := ST_SetSRID(ST_Force2D(ST_GeomFromGeoJSON(p_destino_geojson)), 4326);

  SELECT count(*) INTO v_estradas_count
  FROM public.mapa_estradas
  WHERE fazenda_id = p_fazenda_id AND ativo = true AND source IS NOT NULL AND target IS NOT NULL;

  IF v_estradas_count = 0 THEN
    RETURN QUERY SELECT NULL::json, 0.0::double precision, false;
    RETURN;
  END IF;

  SELECT v.id INTO v_start_vid
  FROM public.mapa_estradas_vertices_pgr v
  ORDER BY v.the_geom <-> v_origem
  LIMIT 1;

  SELECT v.id INTO v_end_vid
  FROM public.mapa_estradas_vertices_pgr v
  ORDER BY v.the_geom <-> v_destino
  LIMIT 1;

  IF v_start_vid IS NULL OR v_end_vid IS NULL THEN
    RETURN QUERY SELECT NULL::json, 0.0::double precision, false;
    RETURN;
  END IF;

  SELECT ST_MakeLine(ST_MakePoint(ST_X(v.the_geom), ST_Y(v.the_geom))) INTO v_rota
  FROM pgr_dijkstra(
    'SELECT gid AS id, source, target, ST_Length(geometria::geography) AS cost, ST_Length(geometria::geography) AS reverse_cost FROM public.mapa_estradas WHERE ativo = true AND source IS NOT NULL AND target IS NOT NULL',
    v_start_vid,
    v_end_vid,
    false
  ) d
  JOIN public.mapa_estradas_vertices_pgr v ON v.id = d.node;

  IF v_rota IS NULL THEN
    RETURN QUERY SELECT NULL::json, 0.0::double precision, false;
    RETURN;
  END IF;

  v_dist := ST_Length(ST_SetSRID(v_rota, 4326)::geography);
  RETURN QUERY SELECT ST_AsGeoJSON(ST_SetSRID(v_rota, 4326))::json, v_dist, true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.encontrar_rota_multi(p_fazenda_id uuid, p_origem_geojson text, p_destinos_geojson text, p_tolerancia_m integer DEFAULT 50)
 RETURNS TABLE(rota json, distancia_m double precision, encontrou boolean, ordem_visita json)
 LANGUAGE plpgsql
 SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_origem geometry;
  v_estradas_count integer;
  v_destinos geometry[];
  v_destino geometry;
  v_n_destinos integer;
  v_visitados boolean[];
  v_atual geometry;
  v_atual_vid bigint;
  v_prox_vid bigint;
  v_prox_dist double precision;
  v_melhor_idx integer;
  v_melhor_dist double precision;
  v_trecho_rota geometry;
  v_trecho_dist double precision;
  v_rota_completa geometry;
  v_dist_total double precision;
  v_ordem integer[];
  v_i integer;
  v_j integer;
  v_json_destinos json;
  v_destino_item json;
  v_ordem_visita json;
BEGIN
  IF NOT public.caller_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Usuário sem acesso à fazenda informada.';
  END IF;

  v_origem := ST_SetSRID(ST_Force2D(ST_GeomFromGeoJSON(p_origem_geojson)), 4326);
  v_json_destinos := p_destinos_geojson::json;
  v_n_destinos := jsonb_array_length(v_json_destinos::jsonb);

  SELECT count(*) INTO v_estradas_count
  FROM public.mapa_estradas
  WHERE fazenda_id = p_fazenda_id AND ativo = true AND source IS NOT NULL AND target IS NOT NULL;

  IF v_estradas_count = 0 OR v_n_destinos = 0 THEN
    RETURN QUERY SELECT NULL::json, 0.0::double precision, false, '[]'::json;
    RETURN;
  END IF;

  v_destinos := ARRAY[]::geometry[];
  v_visitados := ARRAY[]::boolean[];
  FOR v_i IN 0..v_n_destinos - 1 LOOP
    v_destino_item := v_json_destinos->v_i;
    v_destino := ST_SetSRID(ST_Force2D(ST_GeomFromGeoJSON(v_destino_item::text)), 4326);
    v_destinos := array_append(v_destinos, v_destino);
    v_visitados := array_append(v_visitados, false);
  END LOOP;

  v_atual := v_origem;
  v_rota_completa := NULL;
  v_dist_total := 0;
  v_ordem := ARRAY[]::integer[];

  FOR v_i IN 1..v_n_destinos LOOP
    SELECT v.id INTO v_atual_vid
    FROM public.mapa_estradas_vertices_pgr v
    ORDER BY v.the_geom <-> v_atual
    LIMIT 1;

    IF v_atual_vid IS NULL THEN
      RETURN QUERY SELECT NULL::json, 0.0::double precision, false, '[]'::json;
      RETURN;
    END IF;

    v_melhor_idx := -1;
    v_melhor_dist := 1e18;
    FOR v_j IN 1..v_n_destinos LOOP
      IF NOT v_visitados[v_j] THEN
        v_prox_dist := ST_Distance(v_atual::geography, v_destinos[v_j]::geography);
        IF v_prox_dist < v_melhor_dist THEN
          v_melhor_dist := v_prox_dist;
          v_melhor_idx := v_j;
        END IF;
      END IF;
    END LOOP;

    IF v_melhor_idx = -1 THEN
      EXIT;
    END IF;

    SELECT v.id INTO v_prox_vid
    FROM public.mapa_estradas_vertices_pgr v
    ORDER BY v.the_geom <-> v_destinos[v_melhor_idx]
    LIMIT 1;

    IF v_prox_vid IS NULL THEN
      RETURN QUERY SELECT NULL::json, 0.0::double precision, false, '[]'::json;
      RETURN;
    END IF;

    SELECT ST_MakeLine(ST_MakePoint(ST_X(v.the_geom), ST_Y(v.the_geom))) INTO v_trecho_rota
    FROM pgr_dijkstra(
      'SELECT gid AS id, source, target, ST_Length(geometria::geography) AS cost, ST_Length(geometria::geography) AS reverse_cost FROM public.mapa_estradas WHERE ativo = true AND source IS NOT NULL AND target IS NOT NULL',
      v_atual_vid,
      v_prox_vid,
      false
    ) d
    JOIN public.mapa_estradas_vertices_pgr v ON v.id = d.node;

    IF v_trecho_rota IS NOT NULL THEN
      IF v_rota_completa IS NULL THEN
        v_rota_completa := v_trecho_rota;
      ELSE
        v_rota_completa := ST_LineMerge(ST_Union(v_rota_completa, v_trecho_rota));
      END IF;
      v_trecho_dist := ST_Length(ST_SetSRID(v_trecho_rota, 4326)::geography);
      v_dist_total := v_dist_total + v_trecho_dist;
    END IF;

    v_visitados[v_melhor_idx] := true;
    v_ordem := array_append(v_ordem, v_melhor_idx);
    v_atual := v_destinos[v_melhor_idx];
  END LOOP;

  IF v_rota_completa IS NULL THEN
    RETURN QUERY SELECT NULL::json, 0.0::double precision, false, '[]'::json;
    RETURN;
  END IF;

  SELECT json_agg(i) INTO v_ordem_visita
  FROM unnest(v_ordem) AS i;

  RETURN QUERY SELECT
    ST_AsGeoJSON(ST_SetSRID(v_rota_completa, 4326))::json,
    v_dist_total,
    true,
    COALESCE(v_ordem_visita, '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.validar_conectividade_estradas(p_fazenda_id uuid, p_tolerancia_m integer DEFAULT 5)
 RETURNS TABLE(estrada_id uuid, estrada_nome text, extremidade text, ponto json, proxima_estrada_id uuid, proxima_estrada_nome text, distancia_m double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_tol_deg double precision;
BEGIN
  IF NOT public.caller_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Usuário sem acesso à fazenda informada.';
  END IF;

  v_tol_deg := p_tolerancia_m::double precision / 111000.0;

  RETURN QUERY
  SELECT
    e.id,
    e.nome,
    CASE
      WHEN ST_DWithin(ST_StartPoint(e.geometria), e2.geometria, v_tol_deg) THEN 'inicio'
      ELSE 'fim'
    END AS extremidade,
    ST_AsGeoJSON(
      CASE
        WHEN ST_DWithin(ST_StartPoint(e.geometria), e2.geometria, v_tol_deg)
        THEN ST_StartPoint(e.geometria)
        ELSE ST_EndPoint(e.geometria)
      END
    )::json AS ponto,
    e2.id AS proxima_estrada_id,
    e2.nome AS proxima_estrada_nome,
    ST_Distance(
      CASE
        WHEN ST_DWithin(ST_StartPoint(e.geometria), e2.geometria, v_tol_deg)
        THEN ST_StartPoint(e.geometria)
        ELSE ST_EndPoint(e.geometria)
      END,
      e2.geometria
    ) * 111000.0 AS distancia_m
  FROM public.mapa_estradas e
  CROSS JOIN public.mapa_estradas e2
  WHERE e.fazenda_id = p_fazenda_id
    AND e.ativo = true
    AND e2.fazenda_id = p_fazenda_id
    AND e2.ativo = true
    AND e.id <> e2.id
    AND (
      ST_DWithin(ST_StartPoint(e.geometria), e2.geometria, v_tol_deg)
      OR ST_DWithin(ST_EndPoint(e.geometria), e2.geometria, v_tol_deg)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.detectar_gaps_estradas(p_fazenda_id uuid, p_tolerancia_m integer DEFAULT 5)
 RETURNS TABLE(estrada_id uuid, estrada_nome text, extremidade text, ponto json)
 LANGUAGE plpgsql
 SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_tol_deg double precision;
BEGIN
  IF NOT public.caller_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Usuário sem acesso à fazenda informada.';
  END IF;

  v_tol_deg := p_tolerancia_m::double precision / 111000.0;

  RETURN QUERY
  SELECT e.id, e.nome, 'inicio' AS extremidade,
    ST_AsGeoJSON(ST_StartPoint(e.geometria))::json AS ponto
  FROM public.mapa_estradas e
  WHERE e.fazenda_id = p_fazenda_id
    AND e.ativo = true
    AND NOT EXISTS (
      SELECT 1 FROM public.mapa_estradas e2
      WHERE e2.fazenda_id = p_fazenda_id
        AND e2.ativo = true
        AND e2.id <> e.id
        AND ST_DWithin(ST_StartPoint(e.geometria), e2.geometria, v_tol_deg)
    )
  UNION ALL
  SELECT e.id, e.nome, 'fim' AS extremidade,
    ST_AsGeoJSON(ST_EndPoint(e.geometria))::json AS ponto
  FROM public.mapa_estradas e
  WHERE e.fazenda_id = p_fazenda_id
    AND e.ativo = true
    AND NOT EXISTS (
      SELECT 1 FROM public.mapa_estradas e2
      WHERE e2.fazenda_id = p_fazenda_id
        AND e2.ativo = true
        AND e2.id <> e.id
        AND ST_DWithin(ST_EndPoint(e.geometria), e2.geometria, v_tol_deg)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reconstruir_topologia_estradas(p_fazenda_id uuid, p_tolerancia_m integer DEFAULT 50)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_tol_deg double precision;
  v_estradas_count integer;
BEGIN
  IF NOT public.caller_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Usuário sem acesso à fazenda informada.';
  END IF;

  v_tol_deg := p_tolerancia_m::double precision / 111000.0;

  SELECT count(*) INTO v_estradas_count
  FROM public.mapa_estradas
  WHERE fazenda_id = p_fazenda_id AND ativo = true;

  IF v_estradas_count = 0 THEN
    RETURN false;
  END IF;

  -- Garantir que a tabela de vértices existe
  CREATE TABLE IF NOT EXISTS public.mapa_estradas_vertices_pgr (
    id integer PRIMARY KEY,
    the_geom geometry(Point, 4326),
    cnt integer,
    chk integer
  );

  -- Limpar vértices antigos (WHERE obrigatória por safeupdate)
  DELETE FROM public.mapa_estradas_vertices_pgr WHERE id IS NOT NULL;

  -- Limpar source/target (WHERE obrigatória por safeupdate)
  UPDATE public.mapa_estradas SET source = NULL, target = NULL
  WHERE source IS NOT NULL OR target IS NOT NULL;

  -- Inserir todos os endpoints únicos (start e end de cada LineString).
  -- Pontos dentro da tolerância são agrupados via ST_SnapToGrid.
  INSERT INTO public.mapa_estradas_vertices_pgr (id, the_geom, cnt, chk)
  WITH endpoints AS (
    SELECT
      e.gid,
      ST_StartPoint(e.geometria) AS start_pt,
      ST_EndPoint(e.geometria) AS end_pt
    FROM public.mapa_estradas e
    WHERE e.ativo = true
  ),
  all_points AS (
    SELECT start_pt AS pt FROM endpoints
    UNION ALL
    SELECT end_pt AS pt FROM endpoints
  ),
  snapped AS (
    SELECT
      ST_SnapToGrid(pt, v_tol_deg) AS grid_pt,
      ST_Centroid(ST_Collect(pt)) AS the_geom,
      count(*) AS cnt
    FROM all_points
    GROUP BY ST_SnapToGrid(pt, v_tol_deg)
  )
  SELECT
    row_number() OVER (ORDER BY ST_X(grid_pt), ST_Y(grid_pt))::integer AS id,
    the_geom,
    cnt,
    1 AS chk
  FROM snapped;

  -- Setar source = ID do vértice mais próximo do StartPoint
  UPDATE public.mapa_estradas e
  SET source = sub.vid
  FROM (
    SELECT
      e2.gid,
      v.id AS vid
    FROM public.mapa_estradas e2
    CROSS JOIN LATERAL (
      SELECT v.id, v.the_geom
      FROM public.mapa_estradas_vertices_pgr v
      ORDER BY v.the_geom <-> ST_StartPoint(e2.geometria)
      LIMIT 1
    ) v
    WHERE e2.ativo = true
  ) sub
  WHERE e.gid = sub.gid;

  -- Setar target = ID do vértice mais próximo do EndPoint
  UPDATE public.mapa_estradas e
  SET target = sub.vid
  FROM (
    SELECT
      e2.gid,
      v.id AS vid
    FROM public.mapa_estradas e2
    CROSS JOIN LATERAL (
      SELECT v.id, v.the_geom
      FROM public.mapa_estradas_vertices_pgr v
      ORDER BY v.the_geom <-> ST_EndPoint(e2.geometria)
      LIMIT 1
    ) v
    WHERE e2.ativo = true
  ) sub
  WHERE e.gid = sub.gid;

  RETURN true;
END;
$function$;

-- ==================== mapa_versao: SELECT apenas com vínculo ====================

DROP POLICY IF EXISTS mapa_versao_select_authenticated ON public.mapa_versao;
DROP POLICY IF EXISTS mapa_versao_select_anon ON public.mapa_versao;
DROP POLICY IF EXISTS mapa_versao_select_fazenda ON public.mapa_versao;

CREATE POLICY mapa_versao_select_fazenda ON public.mapa_versao
  FOR SELECT
  TO authenticated
  USING (public.caller_has_fazenda_access(fazenda_id));

-- ==================== mapa_estradas / mapa_pontos: SELECT via helper ====================
-- O helper cobre usuarios (painel) e peões (PWA, via email do JWT).
-- Policies de INSERT/UPDATE/DELETE permanecem como estão (usuario_fazenda).

DROP POLICY IF EXISTS "mapa_estradas_select_fazenda" ON public.mapa_estradas;
CREATE POLICY "mapa_estradas_select_fazenda" ON public.mapa_estradas
  FOR SELECT TO authenticated
  USING (public.caller_has_fazenda_access(fazenda_id));

DROP POLICY IF EXISTS "mapa_pontos_select_fazenda" ON public.mapa_pontos;
CREATE POLICY "mapa_pontos_select_fazenda" ON public.mapa_pontos
  FOR SELECT TO authenticated
  USING (public.caller_has_fazenda_access(fazenda_id));

-- ==================== mapa_estradas_vertices_pgr: bloquear acesso direto ====================
-- Tabela interna de topologia pgRouting; só funções SECURITY DEFINER acessam.
-- Sem fazenda_id próprio, então a política correta é negar acesso direto.

ALTER TABLE public.mapa_estradas_vertices_pgr ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.mapa_estradas_vertices_pgr FROM anon;
REVOKE ALL ON public.mapa_estradas_vertices_pgr FROM authenticated;
