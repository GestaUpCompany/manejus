// Hook: carregamento de dados do mapa e derivacao de GeoJSON sources
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../services/supabaseClient'
import { getFazendaIdForUser } from '../../../utils/fazendaContext'
import { calcularMelhorLabel } from './geometriaUtils'
import { corPonto } from './mapaConfig'
import type { PastoMapa, BebedouroMapa, EstradaMapa, PontoMapa, CurralMapa, AreaMapa } from './types'

export function useMapaData(user: { id: string } | null, mortesDataInicio?: string | null, mortesDataFim?: string | null) {
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pastos, setPastos] = useState<PastoMapa[]>([])
  const [bebedouros, setBebedouros] = useState<BebedouroMapa[]>([])
  const [estradas, setEstradas] = useState<EstradaMapa[]>([])
  const [pontos, setPontos] = useState<PontoMapa[]>([])
  const [currais, setCurrais] = useState<CurralMapa[]>([])
  const [areas, setAreas] = useState<AreaMapa[]>([])
  const [curraisSemGeo, setCurraisSemGeo] = useState<{ id: string; nome: string }[]>([])
  const [pastosSemGeometria, setPastosSemGeometria] = useState<{ id: string; nome: string }[]>([])
  const [mortes, setMortes] = useState<any[]>([])

  const loadData = useCallback(async () => {
    if (!user) return
    setLoading(true)

    const fid = await getFazendaIdForUser(user.id)
    if (!fid) {
      setLoading(false)
      return
    }
    setFazendaId(fid)

    // Buscar pastos com geometria (ST_AsGeoJSON) e sem geometria (para o modal de associação)
    // e bebedouros com geometria (para renderizar no mapa)
    const [pastosComGeo, pastosSemGeo, bebedourosComGeo, estradasRes, pontosRes, curraisComGeoRes, curraisSemGeoRes, areasRes] = await Promise.all([
      supabase.rpc('get_pastos_com_geometria', { p_fazenda_id: fid }),
      supabase
        .from('pastos')
        .select('id, nome')
        .eq('fazenda_id', fid)
        .is('geometria', null)
        .is('deleted_at', null)
        .order('nome'),
      supabase.rpc('get_bebedouros_com_geometria', { p_fazenda_id: fid }),
      supabase
        .from('mapa_estradas')
        .select('id, nome, geometria')
        .eq('fazenda_id', fid)
        .eq('ativo', true)
        .order('nome'),
      supabase
        .from('mapa_pontos')
        .select('id, tipo, nome, geometria')
        .eq('fazenda_id', fid)
        .eq('ativo', true)
        .order('nome'),
      supabase.rpc('get_currais_com_geometria', { p_fazenda_id: fid }),
      supabase
        .from('currais')
        .select('id, nome')
        .eq('fazenda_id', fid)
        .is('geometria', null)
        .is('deleted_at', null)
        .order('nome'),
      supabase
        .from('mapa_areas')
        .select('id, nome, tipo, geometria')
        .eq('fazenda_id', fid)
        .eq('ativo', true)
        .order('nome'),
    ])

    if (pastosComGeo.data) {
      const pastosParsed: PastoMapa[] = (pastosComGeo.data as any[]).map((p) => ({
        id: p.id,
        nome: p.nome,
        setor: p.setor,
        tipo: p.tipo,
        area_total_ha: p.area_total_ha,
        area_util_ha: p.area_util_ha,
        especie: p.especie,
        ativo: p.ativo,
        metragem_cocho_m: p.metragem_cocho_m,
        possui_deposito: p.possui_deposito,
        fonte_agua_principal: p.fonte_agua_principal,
        modulo_nome: p.modulo_nome,
        geometria_geojson: p.geometria_geojson
          ? ({
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: { id: p.id, nome: p.nome },
                  geometry: typeof p.geometria_geojson === 'string' ? JSON.parse(p.geometria_geojson) : p.geometria_geojson,
                },
              ],
            } as GeoJSON.FeatureCollection)
          : null,
      }))
      setPastos(pastosParsed)
    }

    if (pastosSemGeo.data) {
      setPastosSemGeometria(pastosSemGeo.data as { id: string; nome: string }[])
    }

    if (bebedourosComGeo.data) {
      const bebedourosParsed: BebedouroMapa[] = (bebedourosComGeo.data as any[]).map((b) => ({
        id: b.id,
        nome: b.nome,
        capacidade: b.capacidade,
        geometria_geojson: b.geometria_geojson
          ? ({
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: { id: b.id, nome: b.nome },
                  geometry: typeof b.geometria_geojson === 'string' ? JSON.parse(b.geometria_geojson) : b.geometria_geojson,
                },
              ],
            } as GeoJSON.FeatureCollection)
          : null,
      }))
      setBebedouros(bebedourosParsed)
    }

    if (estradasRes.data) {
      const estradasParsed: EstradaMapa[] = (estradasRes.data as any[]).map((e) => ({
        id: e.id,
        nome: e.nome,
        geometria_geojson: e.geometria
          ? ({
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: { id: e.id, nome: e.nome },
                  geometry: typeof e.geometria === 'string' ? JSON.parse(e.geometria) : e.geometria,
                },
              ],
            } as GeoJSON.FeatureCollection)
          : null,
      }))
      setEstradas(estradasParsed)
    }

    if (pontosRes.data) {
      const pontosParsed: PontoMapa[] = (pontosRes.data as any[]).map((p) => ({
        id: p.id,
        tipo: p.tipo,
        nome: p.nome,
        geometria_geojson: p.geometria
          ? ({
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: { id: p.id, tipo: p.tipo, nome: p.nome, cor: corPonto(p.tipo) },
                  geometry: typeof p.geometria === 'string' ? JSON.parse(p.geometria) : p.geometria,
                },
              ],
            } as GeoJSON.FeatureCollection)
          : null,
      }))
      setPontos(pontosParsed)
    }

    if (curraisComGeoRes.data) {
      const curraisParsed: CurralMapa[] = (curraisComGeoRes.data as any[]).map((c) => ({
        id: c.id,
        nome: c.nome,
        lote_id: c.lote_id,
        geometria_geojson: c.geometria
          ? ({
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: { id: c.id, nome: c.nome },
                  geometry: c.geometria,
                },
              ],
            } as GeoJSON.FeatureCollection)
          : null,
      }))
      setCurrais(curraisParsed)
    }

    if (curraisSemGeoRes.data) {
      setCurraisSemGeo((curraisSemGeoRes.data as any[]).map((c) => ({ id: c.id, nome: c.nome })))
    }

    if (areasRes.data) {
      const areasParsed: AreaMapa[] = (areasRes.data as any[]).map((a) => ({
        id: a.id,
        nome: a.nome,
        tipo: a.tipo,
        geometria_geojson: a.geometria
          ? ({
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: { id: a.id, nome: a.nome, tipo: a.tipo },
                  geometry: typeof a.geometria === 'string' ? JSON.parse(a.geometria) : a.geometria,
                },
              ],
            } as GeoJSON.FeatureCollection)
          : null,
      }))
      setAreas(areasParsed)
    }

    setLoading(false)
  }, [user])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Carregamento separado de mortes (para nao recarregar o mapa todo ao mudar o filtro de data)
  const loadMortes = useCallback(async () => {
    if (!fazendaId) return
    const { data } = await supabase
      .from('registros_morte')
      .select('id, data, causa_morte, brinco, chip, categoria, sexo, raca, idade, pasto, lote, peso_vivo, latitude, longitude, gps_accuracy, foto_url')
      .eq('fazenda_id', fazendaId)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .gte('data', mortesDataInicio || '1900-01-01')
      .lte('data', mortesDataFim || '2100-01-01')
      .order('data', { ascending: false })
      .limit(500)
    if (data) setMortes(data as any[])
  }, [fazendaId, mortesDataInicio, mortesDataFim])

  useEffect(() => {
    loadMortes()
  }, [loadMortes])

  // ==================== GeoJSON sources ====================
  const pastosGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = []
    pastos.forEach((p) => {
      if (p.geometria_geojson?.features?.[0]) {
        features.push(p.geometria_geojson.features[0])
      }
    })
    return { type: 'FeatureCollection', features }
  }, [pastos])

  // GeoJSON de labels (centróide de cada pasto com nome e áreas)
  const pastosLabelsGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = []
    pastos.forEach((p) => {
      if (p.geometria_geojson?.features?.[0]?.geometry?.type === 'Polygon') {
        const coords = p.geometria_geojson.features[0].geometry.coordinates[0] as [number, number][]
        const [lng, lat] = calcularMelhorLabel(coords)

        const areaTotal = p.area_total_ha != null ? `${p.area_total_ha} ha` : ''
        const areaUtil = p.area_util_ha != null ? `${p.area_util_ha} ha` : ''
        const sublabel = [areaTotal, areaUtil].filter(Boolean).join(' · ')

        features.push({
          type: 'Feature',
          properties: { id: p.id, nome: p.nome, sublabel },
          geometry: { type: 'Point', coordinates: [lng, lat] },
        })
      }
    })
    return { type: 'FeatureCollection', features }
  }, [pastos])

  // Fábricas: pontos com tipo='fabrica' e geometria Polygon
  const fabricas = useMemo(() => pontos.filter((p) => p.tipo === 'fabrica'), [pontos])

  // Pontos regulares (não fábricas)
  const pontosRegulares = useMemo(() => pontos.filter((p) => p.tipo !== 'fabrica'), [pontos])

  const fabricasGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = []
    fabricas.forEach((f) => {
      if (f.geometria_geojson?.features?.[0]) {
        features.push({
          type: 'Feature',
          properties: { id: f.id, nome: f.nome },
          geometry: f.geometria_geojson.features[0].geometry,
        })
      }
    })
    return { type: 'FeatureCollection', features }
  }, [fabricas])

  const curraisGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = []
    currais.forEach((c) => {
      if (c.geometria_geojson?.features?.[0]) {
        features.push({
          type: 'Feature',
          properties: { id: c.id, nome: c.nome },
          geometry: c.geometria_geojson.features[0].geometry,
        })
      }
    })
    return { type: 'FeatureCollection', features }
  }, [currais])

  const bebedourosGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = []
    bebedouros.forEach((b) => {
      if (b.geometria_geojson?.features?.[0]) {
        features.push(b.geometria_geojson.features[0])
      }
    })
    return { type: 'FeatureCollection', features }
  }, [bebedouros])

  const estradasGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = []
    estradas.forEach((e) => {
      if (e.geometria_geojson?.features?.[0]) {
        features.push(e.geometria_geojson.features[0])
      }
    })
    return { type: 'FeatureCollection', features }
  }, [estradas])

  const areasGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = []
    areas.forEach((a) => {
      if (a.geometria_geojson?.features?.[0]) {
        features.push(a.geometria_geojson.features[0])
      }
    })
    return { type: 'FeatureCollection', features }
  }, [areas])

  const pontosRegularesGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = []
    pontosRegulares.forEach((p) => {
      if (p.geometria_geojson?.features?.[0]) {
        features.push(p.geometria_geojson.features[0])
      }
    })
    return { type: 'FeatureCollection', features }
  }, [pontosRegulares])

  // Mortes com coordenadas GPS (pontos no mapa)
  // So carregamos o id nas properties; os detalhes vêm do array mortes no click handler
  // (evita corromper acentos/cedilha na serializacao do MapLibre)
  const mortesGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = []
    mortes.forEach((m) => {
      if (m.latitude != null && m.longitude != null) {
        features.push({
          type: 'Feature',
          properties: { id: m.id },
          geometry: { type: 'Point', coordinates: [m.longitude, m.latitude] },
        })
      }
    })
    return { type: 'FeatureCollection', features }
  }, [mortes])

  return {
    // Estado
    fazendaId,
    loading,
    pastos,
    bebedouros,
    estradas,
    pontos,
    currais,
    curraisSemGeo,
    pastosSemGeometria,
    areas,
    mortes,
    // Setters (para uso pelos handlers de salvar/remover)
    setPastos,
    setBebedouros,
    setEstradas,
    setPontos,
    setCurrais,
    setCurraisSemGeo,
    setPastosSemGeometria,
    // Recarga
    loadData,
    loadMortes,
    // GeoJSON sources derivados
    pastosGeoJSON,
    pastosLabelsGeoJSON,
    fabricas,
    pontosRegulares,
    fabricasGeoJSON,
    curraisGeoJSON,
    areasGeoJSON,
    bebedourosGeoJSON,
    estradasGeoJSON,
    pontosRegularesGeoJSON,
    mortesGeoJSON,
  }
}
