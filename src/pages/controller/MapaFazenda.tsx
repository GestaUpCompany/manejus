import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Map, MapRef } from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { TerraDraw, TerraDrawPolygonMode, TerraDrawPointMode, TerraDrawLineStringMode, TerraDrawSelectMode, TerraDrawRenderMode } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import { supabase } from '../../services/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { Button, ConfirmModal } from '../../components/ui'
import type { BebedouroMapa, EstradaMapa, PontoMapa, CurralDetalhe, PastoDetalhe } from './mapaFazenda/types'
import { mapStyle, terraDrawStyles } from './mapaFazenda/mapaConfig'
import { loadSavedView, saveView } from './mapaFazenda/viewPersist'
import { PastoDetalhePanel } from './mapaFazenda/PastoDetalhePanel'
import { EstradaDetalhePanel } from './mapaFazenda/EstradaDetalhePanel'
import { PontoDetalhePanel } from './mapaFazenda/PontoDetalhePanel'
import { FabricaDetalhePanel } from './mapaFazenda/FabricaDetalhePanel'
import { CurralDetalhePanel } from './mapaFazenda/CurralDetalhePanel'
import { MorteDetalhePanel } from './mapaFazenda/MorteDetalhePanel'
import { MortesAgregadasPanel } from './mapaFazenda/MortesAgregadasPanel'
import { AssocGeometriaModal } from './mapaFazenda/AssocGeometriaModal'
import { ConfirmarRemocaoModal, RemocaoLoteModal, NomearEstradaModal, NomearPontoModal, NomearFabricaModal, AssociarCurralModal, AssocTipoModal } from './mapaFazenda/MapaModais'
import { useMapaData } from './mapaFazenda/useMapaData'
import { useMapGeolocalizacao } from './mapaFazenda/useMapGeolocalizacao'
import { MapaCamadas } from './mapaFazenda/MapaCamadas'

export function MapaFazenda() {
  const { user } = useAuth()
  const mapRef = useRef<MapRef>(null)
  const drawRef = useRef<TerraDraw | null>(null)

  // Filtro de data para mortes (antes do hook para evitar uso antes da declaracao)
  const [mortesDataInicio, setMortesDataInicio] = useState<string | null>(null)
  const [mortesDataFim, setMortesDataFim] = useState<string | null>(null)
  const [agruparMortes, setAgruparMortes] = useState(false)
  const [modoSelecaoArea, setModoSelecaoArea] = useState(false)
  const [areaSelecao, setAreaSelecao] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [mortesSelecionadas, setMortesSelecionadas] = useState<any[]>([])
  const arrastandoSelecaoRef = useRef(false)
  const [areaSelecaoGeoJSON, setAreaSelecaoGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null)
  const [morteDestaqueId, setMorteDestaqueId] = useState<string | null>(null)

  // Param ?morte=<id> da URL (vem da notificacao "Ver no Mapa")
  const [searchParams, setSearchParams] = useSearchParams()
  const morteParam = searchParams.get('morte')

  // Dados do mapa (carregamento + GeoJSON sources derivados)
  const {
    fazendaId, loading,
    pastos, bebedouros, estradas, currais,
    curraisSemGeo, pastosSemGeometria,
    loadData,
    pastosGeoJSON, pastosLabelsGeoJSON,
    fabricas, pontosRegulares,
    fabricasGeoJSON, curraisGeoJSON, bebedourosGeoJSON,
    mortesGeoJSON, mortes,
  } = useMapaData(user, mortesDataInicio, mortesDataFim)

  const [pastoDetalhe, setPastoDetalhe] = useState<PastoDetalhe | null>(null)
  const [popup, setPopup] = useState<{ lng: number; lat: number; nome: string } | null>(null)
  const [popupBebedouro, setPopupBebedouro] = useState<{ lng: number; lat: number; id: string; nome: string } | null>(null)
  const [drawMode, setDrawMode] = useState<string | null>(null)
  const drawModeRef = useRef<string | null>(null)
  useEffect(() => { drawModeRef.current = drawMode }, [drawMode])
  const [showAssocModal, setShowAssocModal] = useState(false)
  const [modoSelecaoMultipla, setModoSelecaoMultipla] = useState(false)
  const [modoTelaCheia, setModoTelaCheia] = useState(false)
  const [modoEdicao, setModoEdicao] = useState(false)
  const [showEstradaModal, setShowEstradaModal] = useState(false)
  const [nomeEstrada, setNomeEstrada] = useState('')
  const [estradaDesenhada, setEstradaDesenhada] = useState<GeoJSON.Feature<GeoJSON.LineString> | null>(null)
  const [estradaDetalhe, setEstradaDetalhe] = useState<EstradaMapa | null>(null)
  const [visCamadas, setVisCamadas] = useState({ pastos: true, bebedouros: true, estradas: true, pontos: true, fabricas: true, currais: true, mortes: true })
  const [showPontoModal, setShowPontoModal] = useState(false)
  const [pontoDesenhado, setPontoDesenhado] = useState<GeoJSON.Feature<GeoJSON.Point> | null>(null)
  const [tipoPontoSelecionado, setTipoPontoSelecionado] = useState('fabrica')
  const [nomePonto, setNomePonto] = useState('')
  const [pontoDetalhe, setPontoDetalhe] = useState<PontoMapa | null>(null)
  const [fabricaDetalhe, setFabricaDetalhe] = useState<PontoMapa | null>(null)
  const [curralDetalhe, setCurralDetalhe] = useState<CurralDetalhe | null>(null)
  const [morteDetalhe, setMorteDetalhe] = useState<any>(null)
  const [showFabricaModal, setShowFabricaModal] = useState(false)
  const [nomeFabrica, setNomeFabrica] = useState('')
  const [showCurralModal, setShowCurralModal] = useState(false)
  const [curralSelecionadoAssoc, setCurralSelecionadoAssoc] = useState('')
  const [showAssocTipoModal, setShowAssocTipoModal] = useState(false)
  const [editandoFabrica, setEditandoFabrica] = useState<{ fabricaId: string; fabricaNome: string; featureId: string } | null>(null)
  const [editandoCurral, setEditandoCurral] = useState<{ curralId: string; curralNome: string; featureId: string } | null>(null)
  const [modoRota, setModoRota] = useState<null | 'origem' | 'destinos'>(null)
  const [rotaOrigem, setRotaOrigem] = useState<GeoJSON.Point | null>(null)
  const [rotaDestinos, setRotaDestinos] = useState<GeoJSON.Point[]>([])
  const [rotaResultado, setRotaResultado] = useState<GeoJSON.FeatureCollection | null>(null)
  const [rotaSetas, setRotaSetas] = useState<GeoJSON.FeatureCollection | null>(null)
  const [rotaDistancia, setRotaDistancia] = useState<number | null>(null)
  const [calculandoRota, setCalculandoRota] = useState(false)
  const [rotaErro, setRotaErro] = useState<string | null>(null)
  const [pastosSelecionados, setPastosSelecionados] = useState<Set<string>>(new Set())
  const [showRemocaoLoteModal, setShowRemocaoLoteModal] = useState(false)
  const [removerBebedourosLote, setRemoverBebedourosLote] = useState(false)
  const [removendoLote, setRemovendoLote] = useState(false)
  const [editandoGeometria, setEditandoGeometria] = useState<{ pastoId: string; pastoNome: string; featureId: string } | null>(null)
  const [editandoEstrada, setEditandoEstrada] = useState<{ estradaId: string; estradaNome: string; featureId: string } | null>(null)
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const [featureDesenhada, setFeatureDesenhada] = useState<GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.Point | GeoJSON.LineString> | null>(null)
  const [pastoSelecionadoAssoc, setPastoSelecionadoAssoc] = useState<string>('')
  const [pastoDetectado, setPastoDetectado] = useState<{ id: string; nome: string } | null>(null)
  const [bebedourosDoPasto, setBebedourosDoPasto] = useState<{ id: string; nome: string }[]>([])
  const [buscandoPasto, setBuscandoPasto] = useState(false)
  const [salvando, setSalvando] = useState(false)

  // Confirmação única para remoções (substitui window.confirm)
  const [confirmAction, setConfirmAction] = useState<
    | { type: 'removerEstrada'; estradaId: string }
    | { type: 'removerPonto'; pontoId: string }
    | { type: 'removerFabrica'; fabricaId: string }
    | { type: 'removerGeometriaCurral'; curralId: string }
    | null
  >(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Geolocalização + import KML/KMZ
  const {
    userLocation, localizando, featuresImportadas, importStatus,
    setImportStatus, setFeaturesImportadas,
    handleLocalizarDispositivo, handleFileImport,
  } = useMapGeolocalizacao({ mapRef, fileInputRef })

  const fazendaIdRef = useRef<string | null>(null)
  const bebedourosRef = useRef<BebedouroMapa[]>([])
  const mortesRef = useRef<any[]>([])
  const editandoGeometriaRef = useRef<{ pastoId: string; pastoNome: string; featureId: string } | null>(null)

  // Manter refs sincronizadas com estado
  useEffect(() => { fazendaIdRef.current = fazendaId }, [fazendaId])
  useEffect(() => { bebedourosRef.current = bebedouros }, [bebedouros])
  useEffect(() => { mortesRef.current = mortes }, [mortes])

  // Quando vem da notificacao (?morte=<id>), centralizar mapa e abrir detalhe
  useEffect(() => {
    if (!morteParam) return
    // Tentar encontrar no array de mortes carregadas (com coordenadas)
    const registro = mortes?.find((m) => m.id === morteParam)
    if (registro) {
      // Centralizar mapa nas coordenadas da morte
      if (registro.latitude != null && registro.longitude != null && mapRef.current) {
        mapRef.current.easeTo({
          center: [registro.longitude, registro.latitude],
          zoom: Math.max(mapRef.current.getZoom(), 15),
        })
      }
      setMorteDetalhe({
        id: registro.id,
        data: registro.data,
        causaMorte: registro.causa_morte,
        brinco: registro.brinco,
        chip: registro.chip,
        categoria: registro.categoria,
        sexo: registro.sexo,
        raca: registro.raca,
        idade: registro.idade,
        pasto: registro.pasto,
        lote: registro.lote,
        pesoVivo: registro.peso_vivo,
        fotoUrl: registro.foto_url,
      })
      setMorteDestaqueId(registro.id)
      setSearchParams({}, { replace: true })
      return
    }
    // Se nao encontrou no array (morte sem coordenadas), buscar direto no banco
    if (mortes && mortes.length >= 0) {
      // mortes ja carregou mas o registro nao tem coordenadas (nao esta no array filtrado)
      supabase
        .from('registros_morte')
        .select('id, data, causa_morte, brinco, chip, categoria, sexo, raca, idade, pasto, lote, peso_vivo, foto_url')
        .eq('id', morteParam)
        .single()
        .then(({ data }) => {
          if (data) {
            setMorteDetalhe({
              id: data.id,
              data: data.data,
              causaMorte: data.causa_morte,
              brinco: data.brinco,
              chip: data.chip,
              categoria: data.categoria,
              sexo: data.sexo,
              raca: data.raca,
              idade: data.idade,
              pasto: data.pasto,
              lote: data.lote,
              pesoVivo: data.peso_vivo,
              fotoUrl: data.foto_url,
            })
            setMorteDestaqueId(data.id)
          }
          setSearchParams({}, { replace: true })
        })
    }
  }, [morteParam, mortes, setSearchParams])
  useEffect(() => { editandoGeometriaRef.current = editandoGeometria }, [editandoGeometria])

  const editandoEstradaRef = useRef<{ estradaId: string; estradaNome: string; featureId: string } | null>(null)
  useEffect(() => { editandoEstradaRef.current = editandoEstrada }, [editandoEstrada])

  const editandoFabricaRef = useRef<{ fabricaId: string; fabricaNome: string; featureId: string } | null>(null)
  useEffect(() => { editandoFabricaRef.current = editandoFabrica }, [editandoFabrica])

  const editandoCurralRef = useRef<{ curralId: string; curralNome: string; featureId: string } | null>(null)
  useEffect(() => { editandoCurralRef.current = editandoCurral }, [editandoCurral])

  const modoRotaRef = useRef<null | 'origem' | 'destinos'>(null)
  useEffect(() => { modoRotaRef.current = modoRota }, [modoRota])

  const rotaOrigemRef = useRef<GeoJSON.Point | null>(null)
  useEffect(() => { rotaOrigemRef.current = rotaOrigem }, [rotaOrigem])

  const rotaDestinosRef = useRef<GeoJSON.Point[]>([])
  useEffect(() => { rotaDestinosRef.current = rotaDestinos }, [rotaDestinos])

  // Esc sai do modo tela cheia
  useEffect(() => {
    if (!modoTelaCheia) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModoTelaCheia(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [modoTelaCheia])

  // Redimensionar mapa ao entrar/sair do modo tela cheia
  useEffect(() => {
    const t = setTimeout(() => {
      const map = mapRef.current?.getMap()
      if (map) map.resize()
    }, 100)
    return () => clearTimeout(t)
  }, [modoTelaCheia])

  // GeoJSON sources que dependem de estado de detalhe (ficam no componente)
  // GeoJSON dos pastos selecionados (para highlight visual)
  const pastosSelecionadosGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = []
    pastos.forEach((p) => {
      if (p.geometria_geojson?.features?.[0] && pastosSelecionados.has(p.id)) {
        features.push(p.geometria_geojson.features[0])
      }
    })
    return { type: 'FeatureCollection', features }
  }, [pastos, pastosSelecionados])

  // Highlight do pasto em detalhe (painel aberto)
  const pastoDetalheGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!pastoDetalhe) return { type: 'FeatureCollection', features: [] }
    const pasto = pastos.find((p) => p.id === pastoDetalhe.id)
    if (!pasto?.geometria_geojson?.features?.[0]) return { type: 'FeatureCollection', features: [] }
    return { type: 'FeatureCollection', features: [pasto.geometria_geojson.features[0]] }
  }, [pastos, pastoDetalhe])

  // Highlight da estrada em detalhe (painel aberto)
  const estradaDetalheGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!estradaDetalhe) return { type: 'FeatureCollection', features: [] }
    const estrada = estradas.find((e) => e.id === estradaDetalhe.id)
    if (!estrada?.geometria_geojson?.features?.[0]) return { type: 'FeatureCollection', features: [] }
    return { type: 'FeatureCollection', features: [estrada.geometria_geojson.features[0]] }
  }, [estradas, estradaDetalhe])

  const fabricaDetalheGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!fabricaDetalhe) return { type: 'FeatureCollection', features: [] }
    const f = fabricas.find((x) => x.id === fabricaDetalhe.id)
    if (!f?.geometria_geojson?.features?.[0]) return { type: 'FeatureCollection', features: [] }
    return { type: 'FeatureCollection', features: [f.geometria_geojson.features[0]] }
  }, [fabricas, fabricaDetalhe])

  const curralDetalheGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!curralDetalhe) return { type: 'FeatureCollection', features: [] }
    const c = currais.find((x) => x.id === curralDetalhe.id)
    if (!c?.geometria_geojson?.features?.[0]) return { type: 'FeatureCollection', features: [] }
    return { type: 'FeatureCollection', features: [c.geometria_geojson.features[0]] }
  }, [currais, curralDetalhe])

  // ==================== Import KML/KMZ + Geolocalização ====================
  // (extraído para useMapGeolocalizacao)

  // ==================== Desenho (Terra Draw) ====================
  // Cria (ou recria) a instância do Terra Draw sobre o mapa atual.
  // Extraído para função reutilizável porque o adapter pode corromper
  // o estado interno após sequências de clear/setMode, e a única forma
  // confiável de recuperar é recriar a instância inteira sobre o mesmo mapa.
  const criarTerraDraw = useCallback((): TerraDraw | null => {
    const map = mapRef.current?.getMap()
    if (!map) return null

    // Destruir instância anterior se existir
    if (drawRef.current) {
      try { drawRef.current.stop() } catch { /* ignore */ }
      drawRef.current = null
    }

    // Limpar manualmente layers e sources órfãos do Terra Draw no mapa.
    // Quando stop() falha (adapter corrompido), os layers/sources com
    // prefixo "td-" ficam órfãos e impedem a criação de um novo adapter.
    const tdLayers = [
      'td-point', 'td-point-marker',
      'td-linestring',
      'td-polygon', 'td-polygon-fill', 'td-polygon-outline',
    ]
    tdLayers.forEach((layerId) => {
      try { if (map.getLayer(layerId)) map.removeLayer(layerId) } catch { /* ignore */ }
    })
    ;['td-point', 'td-linestring', 'td-polygon'].forEach((sourceId) => {
      try { if (map.getSource(sourceId)) map.removeSource(sourceId) } catch { /* ignore */ }
    })

    const adapter = new TerraDrawMapLibreGLAdapter({ map })
    const draw = new TerraDraw({
      adapter,
      modes: [
        new TerraDrawPolygonMode({
          styles: terraDrawStyles.polygon as any,
        }),
        new TerraDrawPointMode({
          styles: terraDrawStyles.point as any,
        }),
        new TerraDrawLineStringMode({
          styles: {
            lineStringColor: '#d97706',
            lineStringWidth: 3,
            lineStringOpacity: 0.8,
            closingPointColor: '#374151',
            closingPointWidth: 6,
            closingPointOpacity: 1,
            closingPointOutlineColor: '#ffffff',
            closingPointOutlineWidth: 2,
            closingPointOutlineOpacity: 1,
            coordinatePointColor: '#6b7280',
            coordinatePointOpacity: 1,
            coordinatePointWidth: 5,
            coordinatePointOutlineColor: '#ffffff',
            coordinatePointOutlineWidth: 2,
            coordinatePointOutlineOpacity: 1,
          } as any,
        }),
        new TerraDrawSelectMode({
          flags: {
            polygon: {
              feature: {
                validation: (feature: any) => {
                  if (feature.geometry?.type === 'Polygon') {
                    const coords = feature.geometry.coordinates[0]
                    if (coords.length < 4) {
                      return { valid: false, reason: 'Polígono precisa de no mínimo 3 vértices' }
                    }
                  }
                  return { valid: true }
                },
                draggable: true,
                coordinates: {
                  midpoints: true,
                  draggable: true,
                  deletable: true,
                },
              },
            },
            render: {
              feature: {
                validation: (feature: any) => {
                  if (feature.geometry?.type === 'Polygon') {
                    const coords = feature.geometry.coordinates[0]
                    if (coords.length < 4) {
                      return { valid: false, reason: 'Polígono precisa de no mínimo 3 vértices' }
                    }
                  }
                  return { valid: true }
                },
                draggable: true,
                coordinates: {
                  midpoints: true,
                  draggable: true,
                  deletable: true,
                },
              },
            },
            linestring: {
              feature: {
                validation: (feature: any) => {
                  if (feature.geometry?.type === 'LineString') {
                    const coords = feature.geometry.coordinates
                    if (coords.length < 2) {
                      return { valid: false, reason: 'Estrada precisa de no mínimo 2 pontos' }
                    }
                  }
                  return { valid: true }
                },
                draggable: true,
                coordinates: {
                  midpoints: true,
                  draggable: true,
                  deletable: true,
                },
              },
            },
          },
        }),
        new TerraDrawRenderMode({
          modeName: 'render',
          styles: {
            polygonFillColor: '#3b82f6',
            polygonFillOpacity: 0.2,
            polygonOutlineColor: '#3b82f6',
            polygonOutlineWidth: 2,
            polygonOutlineOpacity: 0.8,
            pointColor: '#3b82f6',
            pointWidth: 6,
            pointOpacity: 0.8,
            pointOutlineColor: '#ffffff',
            pointOutlineWidth: 2,
            pointOutlineOpacity: 1,
            lineStringColor: '#d97706',
            lineStringWidth: 3,
            lineStringOpacity: 0.8,
          } as any,
        }),
      ],
    })
    draw.start()
    drawRef.current = draw

    // Listener: quando uma feature é finalizada (desenho completo)
    draw.on('finish', async () => {
      // Ignorar finish quando estiver em modo de edição de geometria existente
      if (editandoGeometriaRef.current) return
      if (editandoEstradaRef.current) return
      if (editandoFabricaRef.current) return
      if (editandoCurralRef.current) return

      const snapshot = draw.getSnapshot()
      if (snapshot.length === 0) return

      // Pegar a última feature criada
      const lastFeature = snapshot[snapshot.length - 1] as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.Point | GeoJSON.LineString>
      const modoAtual = drawModeRef.current
      setDrawMode(null)

      // Se for LineString (estrada): abrir modal para nomear e salvar
      if (lastFeature.geometry.type === 'LineString') {
        setEstradaDesenhada(lastFeature as GeoJSON.Feature<GeoJSON.LineString>)
        setNomeEstrada('')
        setShowEstradaModal(true)
        return
      }

      // Se for ponto de interesse (não bebedouro): abrir modal de ponto
      if (lastFeature.geometry.type === 'Point' && modoAtual === 'point-interesse') {
        setPontoDesenhado(lastFeature as GeoJSON.Feature<GeoJSON.Point>)
        setNomePonto('')
        setShowPontoModal(true)
        return
      }

      // Se for fábrica (polígono): abrir modal para nomear
      if (lastFeature.geometry.type === 'Polygon' && modoAtual === 'fabrica') {
        setFeatureDesenhada(lastFeature)
        setNomeFabrica('')
        setShowFabricaModal(true)
        return
      }

      // Se for curral (polígono): abrir modal para associar a curral existente
      if (lastFeature.geometry.type === 'Polygon' && modoAtual === 'curral') {
        setFeatureDesenhada(lastFeature)
        setCurralSelecionadoAssoc('')
        setShowCurralModal(true)
        return
      }

      setFeatureDesenhada(lastFeature)
      setPastoSelecionadoAssoc('')
      setPastoDetectado(null)
      setBebedourosDoPasto([])

      // Se for ponto (bebedouro), detectar qual pasto contém o ponto
      if (lastFeature.geometry.type === 'Point' && fazendaIdRef.current) {
        setBuscandoPasto(true)
        setShowAssocModal(true) // já mostra o modal com estado de busca

        try {
          const pontoGeojson = JSON.stringify(lastFeature.geometry)
          const { data: pastoData, error: pastoError } = await supabase.rpc('encontrar_pasto_por_ponto', {
            p_fazenda_id: fazendaIdRef.current,
            p_ponto_geojson: pontoGeojson,
          })

          if (pastoError) throw pastoError

          if (!pastoData || (pastoData as any[]).length === 0) {
            // Ponto não está dentro de nenhum pasto
            setPastoDetectado(null)
            setBuscandoPasto(false)
            return
          }

          const pasto = (pastoData as any[])[0]
          setPastoDetectado({ id: pasto.id, nome: pasto.nome })

          // Buscar bebedouros associados a este pasto que ainda não têm geometria
          const { data: vinculosData, error: vinculosError } = await supabase
            .from('pasto_bebedouros')
            .select('bebedouros(id, nome)')
            .eq('pasto_id', pasto.id)

          if (vinculosError) throw vinculosError

          // Filtrar bebedouros que ainda não têm geometria
          const bebedourosVinculados: { id: string; nome: string }[] = []
          if (vinculosData) {
            const idsBebedourosComGeo = new Set(bebedourosRef.current.map((b) => b.id))
            ;(vinculosData as any[]).forEach((row) => {
              const b = row.bebedouros
              if (b) {
                const arr = Array.isArray(b) ? b : [b]
                arr.forEach((x: any) => {
                  if (!idsBebedourosComGeo.has(x.id)) {
                    bebedourosVinculados.push({ id: x.id, nome: x.nome })
                  }
                })
              }
            })
          }

          setBebedourosDoPasto(bebedourosVinculados)

          // Se só tem um bebedouro, já selecionar automaticamente
          if (bebedourosVinculados.length === 1) {
            setPastoSelecionadoAssoc(bebedourosVinculados[0].id)
          }

          setBuscandoPasto(false)
        } catch (err) {
          console.error('Erro ao detectar pasto:', err)
          setBuscandoPasto(false)
        }
      } else {
        // Polígono (pasto): fluxo direto como antes
        setShowAssocModal(true)
      }
    })

    return draw
  }, [])

  // Inicialização acontece no onLoad do Map (handleMapLoad), que garante
  // que o mapa está completamente carregado antes de criar o adapter.
  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map || drawRef.current) return

    criarTerraDraw()

    // Adicionar controles de navegação e escala
    const navControl = new maplibregl.NavigationControl()
    const scaleControl = new maplibregl.ScaleControl()
    map.addControl(navControl, 'top-right')
    map.addControl(scaleControl, 'bottom-left')
  }, [criarTerraDraw])

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (drawRef.current) {
        try {
          drawRef.current.stop()
        } catch {
          // map pode já ter sido destruído
        }
        drawRef.current = null
      }
    }
  }, [])

  // Limpa o estado do Terra Draw. Se clear() falhar (adapter corrompido),
  // recria a instância inteira sobre o mesmo mapa, que é a única forma
  // confiável de recuperar o estado de desenho.
  const limparFeaturesTerraDraw = () => {
    if (!drawRef.current) return
    try {
      drawRef.current.clear()
    } catch (e) {
      console.warn('[Mapa] clear() falhou, recriando instância Terra Draw:', e)
      criarTerraDraw()
    }
  }

  // Reseta o Terra Draw para o modo render, limpando features.
  // Se clear/setMode falhar, recria a instância inteira.
  const resetarTerraDraw = () => {
    if (!drawRef.current) return
    try {
      drawRef.current.clear()
      drawRef.current.setMode('render')
    } catch (e) {
      console.warn('[Mapa] reset falhou, recriando instância Terra Draw:', e)
      criarTerraDraw()
    }
  }

  const ativarDesenhoPoligono = () => {
    if (!drawRef.current) return
    limparFeaturesTerraDraw()
    drawRef.current.setMode('polygon')
    setDrawMode('polygon')
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = 'crosshair'
  }

  const ativarDesenhoPonto = () => {
    if (!drawRef.current) return
    limparFeaturesTerraDraw()
    drawRef.current.setMode('point')
    setDrawMode('point')
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = 'crosshair'
  }

  const ativarDesenhoEstrada = () => {
    if (!drawRef.current) return
    limparFeaturesTerraDraw()
    drawRef.current.setMode('linestring')
    setDrawMode('linestring')
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = 'crosshair'
  }


  const salvarEstrada = async () => {
    if (!estradaDesenhada || !fazendaId || !nomeEstrada.trim()) return
    setSalvando(true)
    try {
      const geojsonStr = JSON.stringify(estradaDesenhada.geometry)
      const { error } = await supabase.rpc('salvar_estrada', {
        p_fazenda_id: fazendaId,
        p_nome: nomeEstrada.trim(),
        p_geometria_geojson: geojsonStr,
      })
      if (error) throw error
      setImportStatus({ type: 'success', msg: `Estrada "${nomeEstrada.trim()}" salva com sucesso.` })
      if (drawRef.current && estradaDesenhada.id) {
        try {
          resetarTerraDraw()
        } catch (e) {
          console.warn('[Mapa] Erro ao remover feature do Terra Draw:', e)
        }
      }
      setShowEstradaModal(false)
      setEstradaDesenhada(null)
      setNomeEstrada('')
      setDrawMode(null)
      loadData()
    } catch (err) {
      console.error('Erro ao salvar estrada:', err)
      setImportStatus({ type: 'error', msg: `Erro ao salvar estrada: ${(err as Error).message}` })
    } finally {
      setSalvando(false)
    }
  }

  const cancelarEstrada = () => {
    if (drawRef.current && estradaDesenhada?.id) {
      try {
          resetarTerraDraw()
        } catch (e) {
        console.warn('[Mapa] Erro ao remover feature do Terra Draw:', e)
      }
    }
    setShowEstradaModal(false)
    setEstradaDesenhada(null)
    setNomeEstrada('')
    setDrawMode(null)
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = ''
  }

  const removerEstrada = (estradaId: string) => {
    setConfirmAction({ type: 'removerEstrada', estradaId })
  }

  // ==================== Pontos de interesse ====================

  const ativarDesenhoPontoInteresse = () => {
    if (!drawRef.current) return
    limparFeaturesTerraDraw()
    drawRef.current.setMode('point')
    setDrawMode('point-interesse')
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = 'crosshair'
  }

  const salvarPonto = async () => {
    if (!pontoDesenhado || !fazendaId || !nomePonto.trim()) return
    setSalvando(true)
    try {
      const geojsonStr = JSON.stringify(pontoDesenhado.geometry)
      const { error } = await supabase.rpc('salvar_ponto', {
        p_fazenda_id: fazendaId,
        p_tipo: tipoPontoSelecionado,
        p_nome: nomePonto.trim(),
        p_geometria_geojson: geojsonStr,
      })
      if (error) throw error
      setImportStatus({ type: 'success', msg: `Ponto "${nomePonto.trim()}" salvo com sucesso.` })
      if (drawRef.current && pontoDesenhado.id) {
        try {
          resetarTerraDraw()
        } catch (e) {
          console.warn('[Mapa] Erro ao remover feature:', e)
        }
      }
      setShowPontoModal(false)
      setPontoDesenhado(null)
      setNomePonto('')
      setDrawMode(null)
      loadData()
    } catch (err) {
      console.error('Erro ao salvar ponto:', err)
      setImportStatus({ type: 'error', msg: `Erro ao salvar ponto: ${(err as Error).message}` })
    } finally {
      setSalvando(false)
    }
  }

  const cancelarPonto = () => {
    if (drawRef.current && pontoDesenhado?.id) {
      try {
          resetarTerraDraw()
        } catch (e) {
        console.warn('[Mapa] Erro ao remover feature:', e)
      }
    }
    setShowPontoModal(false)
    setPontoDesenhado(null)
    setNomePonto('')
    setDrawMode(null)
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = ''
  }

  const removerPonto = (pontoId: string) => {
    setConfirmAction({ type: 'removerPonto', pontoId })
  }

  // ==================== Fábricas ====================

  const ativarDesenhoFabrica = () => {
    if (!drawRef.current) return
    limparFeaturesTerraDraw()
    drawRef.current.setMode('polygon')
    setDrawMode('fabrica')
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = 'crosshair'
  }

  const salvarFabrica = async () => {
    if (!featureDesenhada || !fazendaId || !nomeFabrica.trim()) return
    setSalvando(true)
    try {
      const geojsonStr = JSON.stringify(featureDesenhada.geometry)
      const { error } = await supabase.rpc('salvar_ponto', {
        p_fazenda_id: fazendaId,
        p_tipo: 'fabrica',
        p_nome: nomeFabrica.trim(),
        p_geometria_geojson: geojsonStr,
      })
      if (error) throw error
      setImportStatus({ type: 'success', msg: `Fábrica "${nomeFabrica.trim()}" salva com sucesso.` })
      if (drawRef.current && featureDesenhada.id) {
        try {
          resetarTerraDraw()
        } catch (e) {
          console.warn('[Mapa] Erro ao remover feature:', e)
        }
      }
      setShowFabricaModal(false)
      setFeatureDesenhada(null)
      setNomeFabrica('')
      setDrawMode(null)
      loadData()
    } catch (err) {
      console.error('Erro ao salvar fábrica:', err)
      setImportStatus({ type: 'error', msg: `Erro ao salvar fábrica: ${(err as Error).message}` })
    } finally {
      setSalvando(false)
    }
  }

  const cancelarFabrica = () => {
    if (drawRef.current && featureDesenhada?.id) {
      try {
          resetarTerraDraw()
        } catch (e) {
        console.warn('[Mapa] Erro ao remover feature:', e)
      }
    }
    setShowFabricaModal(false)
    setFeatureDesenhada(null)
    setNomeFabrica('')
    setDrawMode(null)
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = ''
  }

  const removerFabrica = (fabricaId: string) => {
    setConfirmAction({ type: 'removerFabrica', fabricaId })
  }

  const iniciarEdicaoFabrica = (fabricaId: string, fabricaNome: string) => {
    if (!drawRef.current) return
    const fabrica = fabricas.find((f) => f.id === fabricaId)
    if (!fabrica?.geometria_geojson?.features?.[0]) return
    const feature = fabrica.geometria_geojson.features[0]
    const featureId = crypto.randomUUID()
    const featureToAdd = { type: 'Feature', geometry: feature.geometry, properties: { mode: 'render' }, id: featureId } as any
    try {
      const validation = drawRef.current.addFeatures([featureToAdd])
      const rejeitadas = validation.filter((v: any) => !v.valid)
      if (rejeitadas.length > 0) { console.error('[Mapa] Feature rejeitada:', rejeitadas); return }
    } catch (err) { console.error('[Mapa] Erro ao adicionar feature:', err); return }
    drawRef.current.setMode('select')
    setDrawMode('select')
    setTimeout(() => { try { drawRef.current?.selectFeature(featureId) } catch (e) { console.warn(e) } }, 200)
    setFabricaDetalhe(null)
    setEditandoFabrica({ fabricaId, fabricaNome, featureId })
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = 'pointer'
  }

  const salvarEdicaoFabrica = async () => {
    if (!editandoFabrica || !drawRef.current) return
    setSalvandoEdicao(true)
    try {
      const snapshot = drawRef.current.getSnapshot()
      const featureEditada = snapshot.find((f) => String(f.id) === editandoFabrica.featureId)
      if (!featureEditada) throw new Error('Feature não encontrada no snapshot.')
      const geojsonStr = JSON.stringify(featureEditada.geometry)
      const { error } = await supabase.rpc('atualizar_ponto', { p_ponto_id: editandoFabrica.fabricaId, p_geometria_geojson: geojsonStr })
      if (error) throw error
      setImportStatus({ type: 'success', msg: `Fábrica "${editandoFabrica.fabricaNome}" atualizada.` })
      try { resetarTerraDraw() } catch { /* ignore */ }
      setDrawMode(null)
      setEditandoFabrica(null)
      const canvas = mapRef.current?.getCanvas()
      if (canvas) canvas.style.cursor = ''
      loadData()
    } catch (err) {
      console.error('Erro ao salvar edição de fábrica:', err)
      setImportStatus({ type: 'error', msg: `Erro: ${(err as Error).message}` })
    } finally {
      setSalvandoEdicao(false)
    }
  }

  const cancelarEdicaoFabrica = () => {
    if (!drawRef.current || !editandoFabrica) return
    try { resetarTerraDraw() } catch (e) { console.warn(e) }
    setDrawMode(null)
    setEditandoFabrica(null)
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = ''
  }

  // ==================== Currais ====================

  const ativarDesenhoCurral = () => {
    if (!drawRef.current) return
    limparFeaturesTerraDraw()
    drawRef.current.setMode('polygon')
    setDrawMode('curral')
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = 'crosshair'
  }

  const salvarCurral = async () => {
    if (!featureDesenhada || !fazendaId || !curralSelecionadoAssoc) return
    setSalvando(true)
    try {
      const geojsonStr = JSON.stringify(featureDesenhada.geometry)
      const { error } = await supabase.rpc('salvar_geometria_curral', {
        p_curral_id: curralSelecionadoAssoc,
        p_geometria_geojson: geojsonStr,
      })
      if (error) throw error
      const curralNome = curraisSemGeo.find((c) => c.id === curralSelecionadoAssoc)?.nome || ''
      setImportStatus({ type: 'success', msg: `Curral "${curralNome}" associado com sucesso.` })
      if (drawRef.current && featureDesenhada.id) {
        try {
          resetarTerraDraw()
        } catch (e) { console.warn(e) }
      }
      setShowCurralModal(false)
      setFeatureDesenhada(null)
      setCurralSelecionadoAssoc('')
      setDrawMode(null)
      loadData()
    } catch (err) {
      console.error('Erro ao salvar curral:', err)
      setImportStatus({ type: 'error', msg: `Erro ao salvar curral: ${(err as Error).message}` })
    } finally {
      setSalvando(false)
    }
  }

  const cancelarCurral = () => {
    if (drawRef.current && featureDesenhada?.id) {
      try {
          resetarTerraDraw()
        } catch (e) { console.warn(e) }
    }
    setShowCurralModal(false)
    setFeatureDesenhada(null)
    setCurralSelecionadoAssoc('')
    setDrawMode(null)
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = ''
  }

  const removerGeometriaCurral = (curralId: string) => {
    setConfirmAction({ type: 'removerGeometriaCurral', curralId })
  }

  const iniciarEdicaoCurral = (curralId: string, curralNome: string) => {
    if (!drawRef.current) return
    const curral = currais.find((c) => c.id === curralId)
    if (!curral?.geometria_geojson?.features?.[0]) return
    const feature = curral.geometria_geojson.features[0]
    const featureId = crypto.randomUUID()
    const featureToAdd = { type: 'Feature', geometry: feature.geometry, properties: { mode: 'render' }, id: featureId } as any
    try {
      const validation = drawRef.current.addFeatures([featureToAdd])
      const rejeitadas = validation.filter((v: any) => !v.valid)
      if (rejeitadas.length > 0) { console.error('[Mapa] Feature rejeitada:', rejeitadas); return }
    } catch (err) { console.error('[Mapa] Erro ao adicionar feature:', err); return }
    drawRef.current.setMode('select')
    setDrawMode('select')
    setTimeout(() => { try { drawRef.current?.selectFeature(featureId) } catch (e) { console.warn(e) } }, 200)
    setCurralDetalhe(null)
    setEditandoCurral({ curralId, curralNome, featureId })
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = 'pointer'
  }

  const salvarEdicaoCurral = async () => {
    if (!editandoCurral || !drawRef.current) return
    setSalvandoEdicao(true)
    try {
      const snapshot = drawRef.current.getSnapshot()
      const featureEditada = snapshot.find((f) => String(f.id) === editandoCurral.featureId)
      if (!featureEditada) throw new Error('Feature não encontrada.')
      const geojsonStr = JSON.stringify(featureEditada.geometry)
      const { error } = await supabase.rpc('salvar_geometria_curral', { p_curral_id: editandoCurral.curralId, p_geometria_geojson: geojsonStr })
      if (error) throw error
      setImportStatus({ type: 'success', msg: `Curral "${editandoCurral.curralNome}" atualizado.` })
      try { resetarTerraDraw() } catch { /* ignore */ }
      setDrawMode(null)
      setEditandoCurral(null)
      const canvas = mapRef.current?.getCanvas()
      if (canvas) canvas.style.cursor = ''
      loadData()
    } catch (err) {
      console.error('Erro ao salvar edição de curral:', err)
      setImportStatus({ type: 'error', msg: `Erro: ${(err as Error).message}` })
    } finally {
      setSalvandoEdicao(false)
    }
  }

  const cancelarEdicaoCurral = () => {
    if (!drawRef.current || !editandoCurral) return
    try { resetarTerraDraw() } catch (e) { console.warn(e) }
    setDrawMode(null)
    setEditandoCurral(null)
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = ''
  }

  // ==================== Rota (Corte C) ====================

  const ativarModoRota = () => {
    if (modoRota) {
      cancelarRota()
      return
    }
    setModoRota('origem')
    setRotaOrigem(null)
    setRotaDestinos([])
    setRotaResultado(null)
    setRotaSetas(null)
    setRotaDistancia(null)
    setRotaErro(null)
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = 'crosshair'
  }

  const cancelarRota = () => {
    setModoRota(null)
    setRotaOrigem(null)
    setRotaDestinos([])
    setRotaResultado(null)
    setRotaSetas(null)
    setRotaDistancia(null)
    setRotaErro(null)
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = ''
  }

  const removerUltimoDestino = () => {
    setRotaDestinos((prev) => prev.slice(0, -1))
  }

  // Gera pontos com setas direcionais ao longo da rota.
  // Para cada segmento da LineString, calcula o bearing (azimute) e
  // coloca setas ao longo da rota para indicar a direção do trajeto.
  // Garante pelo menos uma seta no meio de cada segmento, mesmo os curtos.
  const gerarSetasRota = (rotaGeojson: GeoJSON.Geometry): GeoJSON.FeatureCollection => {
    const features: GeoJSON.Feature[] = []
    const ESPACAMENTO_M = 100

    const processarLineString = (coords: number[][]) => {
      let distAcumulada = 0
      let proximoMarcador = ESPACAMENTO_M

      for (let i = 0; i < coords.length - 1; i++) {
        const [lng1, lat1] = coords[i]
        const [lng2, lat2] = coords[i + 1]
        const dLat = (lat2 - lat1) * Math.PI / 180
        const dLng = (lng2 - lng1) * Math.PI / 180
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
        const segLen = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        if (segLen < 0.5) continue

        const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180)
        const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng)
        let bearing = Math.atan2(y, x) * 180 / Math.PI
        bearing = (bearing + 360) % 360

        // Setas espaçadas a cada ESPACAMENTO_M
        while (distAcumulada + segLen >= proximoMarcador) {
          const frac = (proximoMarcador - distAcumulada) / segLen
          const lng = lng1 + (lng2 - lng1) * frac
          const lat = lat1 + (lat2 - lat1) * frac
          features.push({
            type: 'Feature',
            properties: { bearing },
            geometry: { type: 'Point', coordinates: [lng, lat] },
          })
          proximoMarcador += ESPACAMENTO_M
        }

        // Garantir pelo menos uma seta no meio do segmento se não teve nenhuma
        const setasNesteSegmento = features.filter(
          (f) => f.geometry.type === 'Point' &&
          (f.geometry as GeoJSON.Point).coordinates[0] >= Math.min(lng1, lng2) - 0.0001 &&
          (f.geometry as GeoJSON.Point).coordinates[0] <= Math.max(lng1, lng2) + 0.0001
        ).length
        if (setasNesteSegmento === 0 && segLen >= 5) {
          features.push({
            type: 'Feature',
            properties: { bearing },
            geometry: { type: 'Point', coordinates: [(lng1 + lng2) / 2, (lat1 + lat2) / 2] },
          })
        }

        distAcumulada += segLen
      }
    }

    if (rotaGeojson.type === 'LineString') {
      processarLineString(rotaGeojson.coordinates)
    } else if (rotaGeojson.type === 'MultiLineString') {
      rotaGeojson.coordinates.forEach(processarLineString)
    }

    return { type: 'FeatureCollection', features }
  }

  const finalizarRota = async () => {
    const origem = rotaOrigemRef.current
    const destinos = rotaDestinosRef.current
    if (!origem || destinos.length === 0) return
    setModoRota(null)
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = 'wait'
    setCalculandoRota(true)
    setRotaErro(null)
    try {
      // Reconstruir topologia das estradas antes de calcular a rota.
      // pgr_createTopology faz DDL internamente e falha dentro de
      // SECURITY DEFINER via PostgREST, por isso é uma RPC separada.
      const { error: topoError } = await supabase.rpc('reconstruir_topologia_estradas', {
        p_fazenda_id: fazendaId,
      })
      if (topoError) throw topoError

      const destinosJson = JSON.stringify(destinos.map((d) => d))
      const { data, error } = await supabase.rpc('encontrar_rota_multi', {
        p_fazenda_id: fazendaId,
        p_origem_geojson: JSON.stringify(origem),
        p_destinos_geojson: destinosJson,
      })
      if (error) throw error
      const resultado = data as any
      if (resultado && resultado.length > 0) {
        const row = resultado[0]
        if (row.encontrou && row.rota) {
          setRotaResultado({
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              properties: { distancia_m: row.distancia_m, ordem: row.ordem_visita },
              geometry: row.rota,
            }],
          })
          setRotaSetas(gerarSetasRota(row.rota as GeoJSON.Geometry))
          setRotaDistancia(row.distancia_m)
        } else {
          setRotaErro('Não foi possível encontrar uma rota. Verifique se as estradas formam uma rede conectada entre os pontos.')
        }
      } else {
        setRotaErro('Resposta vazia do servidor de rotas.')
      }
    } catch (err) {
      console.error('Erro ao calcular rota:', err)
      setRotaErro(`Erro ao calcular rota: ${(err as Error).message}`)
    } finally {
      setCalculandoRota(false)
      const canvas2 = mapRef.current?.getCanvas()
      if (canvas2) canvas2.style.cursor = ''
    }
  }

  const limparDesenho = () => {
    if (!drawRef.current) return
    limparFeaturesTerraDraw()
    setDrawMode(null)
    cancelarRota()
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = ''
  }

  // Restaurar cursor quando drawMode for null
  useEffect(() => {
    if (!drawMode) {
      const canvas = mapRef.current?.getCanvas()
      if (canvas) canvas.style.cursor = ''
    }
  }, [drawMode])

  // ==================== Salvar geometria ====================
  const salvarGeometriaPasto = async () => {
    if (!featureDesenhada || !pastoSelecionadoAssoc || featureDesenhada.geometry.type !== 'Polygon') {
      return
    }
    setSalvando(true)

    try {
      const geojsonStr = JSON.stringify(featureDesenhada.geometry)
      const { error } = await supabase.rpc('salvar_geometria_pasto', {
        p_pasto_id: pastoSelecionadoAssoc,
        p_geometria_geojson: geojsonStr,
      })

      if (error) throw error

      setImportStatus({ type: 'success', msg: 'Geometria salva com sucesso.' })
      if (drawRef.current && featureDesenhada?.id) {
        try {
          resetarTerraDraw()
        } catch (e) {
          console.warn('[Mapa] Erro ao remover feature:', e)
        }
      }
      setShowAssocModal(false)
      setFeatureDesenhada(null)
      setPastoSelecionadoAssoc('')
      setDrawMode(null)
      // Recarregar dados
      loadData()
    } catch (err) {
      console.error('Erro ao salvar geometria:', err)
      setImportStatus({ type: 'error', msg: `Erro ao salvar: ${(err as Error).message}` })
    } finally {
      setSalvando(false)
    }
  }

  // ==================== Salvar geometria de bebedouro (ponto) ====================
  const salvarGeometriaBebedouro = async () => {
    if (!featureDesenhada || !pastoSelecionadoAssoc || featureDesenhada.geometry.type !== 'Point') {
      return
    }
    setSalvando(true)

    try {
      const geojsonStr = JSON.stringify(featureDesenhada.geometry)
      const { error } = await supabase.rpc('salvar_geometria_bebedouro', {
        p_bebedouro_id: pastoSelecionadoAssoc,
        p_geometria_geojson: geojsonStr,
      })

      if (error) throw error

      setImportStatus({ type: 'success', msg: 'Localização do bebedouro salva com sucesso.' })
      if (drawRef.current && featureDesenhada?.id) {
        try {
          resetarTerraDraw()
        } catch (e) {
          console.warn('[Mapa] Erro ao remover feature:', e)
        }
      }
      setShowAssocModal(false)
      setFeatureDesenhada(null)
      setPastoSelecionadoAssoc('')
      setDrawMode(null)
      loadData()
    } catch (err) {
      console.error('Erro ao salvar geometria do bebedouro:', err)
      setImportStatus({ type: 'error', msg: `Erro ao salvar: ${(err as Error).message}` })
    } finally {
      setSalvando(false)
    }
  }

  // ==================== Remover geometria ====================
  const [confirmarRemocao, setConfirmarRemocao] = useState<{ tipo: 'pasto' | 'bebedouro'; id: string; nome: string } | null>(null)
  const [removendo, setRemovendo] = useState(false)

  const removerGeometriaPasto = (id: string, nome: string) => {
    setConfirmarRemocao({ tipo: 'pasto', id, nome })
  }

  const removerGeometriaBebedouro = (id: string, nome: string) => {
    setConfirmarRemocao({ tipo: 'bebedouro', id, nome })
  }

  const confirmarRemocaoGeometria = async () => {
    if (!confirmarRemocao) return
    setRemovendo(true)

    try {
      const rpcName = confirmarRemocao.tipo === 'pasto' ? 'remover_geometria_pasto' : 'remover_geometria_bebedouro'
      const param = confirmarRemocao.tipo === 'pasto' ? 'p_pasto_id' : 'p_bebedouro_id'
      const { error } = await supabase.rpc(rpcName, { [param]: confirmarRemocao.id })

      if (error) throw error

      setImportStatus({
        type: 'success',
        msg: `${confirmarRemocao.tipo === 'pasto' ? 'Pasto' : 'Bebedouro'} "${confirmarRemocao.nome}" removido do mapa. O cadastro continua intacto, apenas a geometria foi removida.`,
      })
      setConfirmarRemocao(null)
      setPastoDetalhe(null)
      setPopup(null)
      loadData()
    } catch (err) {
      console.error('Erro ao remover geometria:', err)
      setImportStatus({ type: 'error', msg: `Erro ao remover: ${(err as Error).message}` })
    } finally {
      setRemovendo(false)
    }
  }

  // ==================== Remoção em lote ====================
  const confirmarRemocaoLote = async () => {
    if (pastosSelecionados.size === 0) return
    setRemovendoLote(true)

    try {
      const pastoIds = Array.from(pastosSelecionados)
      const { data, error } = await supabase.rpc('remover_geometrias_lote', {
        p_pasto_ids: pastoIds,
        p_remover_bebedouros: removerBebedourosLote,
      })

      if (error) throw error

      const result = data?.[0] as any
      const pastosRemovidos = result?.pastos_removidos ?? 0
      const bebedourosRemovidos = result?.bebedouros_removidos ?? 0

      let msg = `${pastosRemovidos} pasto(s) removido(s) do mapa.`
      if (removerBebedourosLote && bebedourosRemovidos > 0) {
        msg += ` ${bebedourosRemovidos} bebedouro(s) também removido(s).`
      }
      setImportStatus({ type: 'success', msg })

      // Limpar seleção e fechar modal
      setPastosSelecionados(new Set())
      setShowRemocaoLoteModal(false)
      setRemoverBebedourosLote(false)
      setModoSelecaoMultipla(false)
      setPastoDetalhe(null)
      setPopup(null)
      setPopupBebedouro(null)
      loadData()
    } catch (err) {
      console.error('Erro ao remover geometrias em lote:', err)
      setImportStatus({ type: 'error', msg: `Erro ao remover: ${(err as Error).message}` })
    } finally {
      setRemovendoLote(false)
    }
  }

  const cancelarSelecaoMultipla = () => {
    setModoSelecaoMultipla(false)
    setPastosSelecionados(new Set())
  }

  // ==================== Editar geometria existente ====================
  const iniciarEdicaoGeometria = (pastoId: string, pastoNome: string) => {
    if (!drawRef.current) return

    // Encontrar a geometria do pasto nos dados carregados
    const pasto = pastos.find((p) => p.id === pastoId)
    if (!pasto?.geometria_geojson?.features?.[0]) return

    const feature = pasto.geometria_geojson.features[0]

    // Gerar UUID4 válido para o Terra Draw (exige UUID4 por padrão)
    const featureId = crypto.randomUUID()

    // Limpar a feature: só geometria + id + mode, sem properties extras que podem conflitar
    const featureToAdd = {
      type: 'Feature',
      geometry: feature.geometry,
      properties: { mode: 'render' },
      id: featureId,
    } as any

    try {
      const validation = drawRef.current.addFeatures([featureToAdd])
      const rejeitadas = validation.filter((v: any) => !v.valid)
      if (rejeitadas.length > 0) {
        console.error('[Mapa] Feature rejeitada pelo Terra Draw:', JSON.stringify(rejeitadas, null, 2))
        return
      }

    } catch (err) {
      console.error('[Mapa] Erro ao adicionar feature para edição:', err)
      return
    }

    // Switch para modo select e selecionar a feature programaticamente
    drawRef.current.setMode('select')
    setDrawMode('select')

    // Selecionar a feature após um breve delay para garantir que o modo foi ativado
    setTimeout(() => {
      try {
        drawRef.current?.selectFeature(featureId)
      } catch (err) {
        console.warn('[Mapa] Erro ao selecionar feature:', err)
      }
    }, 200)

    // Esconder o painel de detalhes e popup
    setPastoDetalhe(null)
    setPopup(null)
    setPopupBebedouro(null)

    setEditandoGeometria({ pastoId, pastoNome, featureId })

    // Forçar cursor apropriado
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = 'pointer'
  }

  const salvarEdicaoGeometria = async () => {
    if (!editandoGeometria || !drawRef.current) return

    setSalvandoEdicao(true)

    try {
      // Pegar a feature atualizada do snapshot do Terra Draw
      const snapshot = drawRef.current.getSnapshot()
      const featureEditada = snapshot.find((f) => String(f.id) === editandoGeometria.featureId)

      if (!featureEditada) {
        throw new Error('Feature não encontrada no snapshot do Terra Draw.')
      }

      // Salvar a geometria atualizada via RPC
      const geojsonStr = JSON.stringify(featureEditada.geometry)
      const { error } = await supabase.rpc('salvar_geometria_pasto', {
        p_pasto_id: editandoGeometria.pastoId,
        p_geometria_geojson: geojsonStr,
      })

      if (error) throw error

      setImportStatus({ type: 'success', msg: `Geometria do pasto "${editandoGeometria.pastoNome}" atualizada com sucesso.` })

      // Remover a feature do Terra Draw e voltar ao modo normal
      try {
        resetarTerraDraw()
      } catch {
        // ignore
      }

      setDrawMode(null)
      setEditandoGeometria(null)

      // Restaurar cursor
      const canvas = mapRef.current?.getCanvas()
      if (canvas) canvas.style.cursor = ''

      loadData()
    } catch (err) {
      console.error('Erro ao salvar edição de geometria:', err)
      setImportStatus({ type: 'error', msg: `Erro ao salvar edição: ${(err as Error).message}` })
    } finally {
      setSalvandoEdicao(false)
    }
  }

  const cancelarEdicaoGeometria = () => {
    if (!drawRef.current || !editandoGeometria) return

    try {
      resetarTerraDraw()
    } catch (err) {
      console.warn('[Mapa] Erro ao remover feature de edição:', err)
    }

    setDrawMode(null)
    setEditandoGeometria(null)

    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = ''
  }

  // ==================== Edição de estrada ====================

  const iniciarEdicaoEstrada = (estradaId: string, estradaNome: string) => {
    if (!drawRef.current) return

    const estrada = estradas.find((e) => e.id === estradaId)
    if (!estrada?.geometria_geojson?.features?.[0]) return

    const feature = estrada.geometria_geojson.features[0]
    const featureId = crypto.randomUUID()

    const featureToAdd = {
      type: 'Feature',
      geometry: feature.geometry,
      properties: { mode: 'render' },
      id: featureId,
    } as any

    try {
      const validation = drawRef.current.addFeatures([featureToAdd])
      const rejeitadas = validation.filter((v: any) => !v.valid)
      if (rejeitadas.length > 0) {
        console.error('[Mapa] Feature rejeitada pelo Terra Draw:', JSON.stringify(rejeitadas, null, 2))
        return
      }
    } catch (err) {
      console.error('[Mapa] Erro ao adicionar feature para edição:', err)
      return
    }

    drawRef.current.setMode('select')
    setDrawMode('select')

    setTimeout(() => {
      try {
        drawRef.current?.selectFeature(featureId)
      } catch (err) {
        console.warn('[Mapa] Erro ao selecionar feature:', err)
      }
    }, 200)

    setEstradaDetalhe(null)
    setEditandoEstrada({ estradaId, estradaNome, featureId })

    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = 'pointer'
  }

  const salvarEdicaoEstrada = async () => {
    if (!editandoEstrada || !drawRef.current) return

    setSalvandoEdicao(true)

    try {
      const snapshot = drawRef.current.getSnapshot()
      const featureEditada = snapshot.find((f) => String(f.id) === editandoEstrada.featureId)

      if (!featureEditada) {
        throw new Error('Feature não encontrada no snapshot do Terra Draw.')
      }

      const geojsonStr = JSON.stringify(featureEditada.geometry)
      const { error } = await supabase.rpc('atualizar_estrada', {
        p_estrada_id: editandoEstrada.estradaId,
        p_geometria_geojson: geojsonStr,
      })

      if (error) throw error

      setImportStatus({ type: 'success', msg: `Estrada "${editandoEstrada.estradaNome}" atualizada com sucesso.` })

      try {
        resetarTerraDraw()
      } catch {
        // ignore
      }

      setDrawMode(null)
      setEditandoEstrada(null)

      const canvas = mapRef.current?.getCanvas()
      if (canvas) canvas.style.cursor = ''

      loadData()
    } catch (err) {
      console.error('Erro ao salvar edição de estrada:', err)
      setImportStatus({ type: 'error', msg: `Erro ao salvar edição: ${(err as Error).message}` })
    } finally {
      setSalvandoEdicao(false)
    }
  }

  const cancelarEdicaoEstrada = () => {
    if (!drawRef.current || !editandoEstrada) return

    try {
      resetarTerraDraw()
    } catch (err) {
      console.warn('[Mapa] Erro ao remover feature de edição:', err)
    }

    setDrawMode(null)
    setEditandoEstrada(null)

    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = ''
  }

  const cancelarAssociacao = () => {
    setShowAssocModal(false)
    setFeatureDesenhada(null)
    setPastoSelecionadoAssoc('')
    setPastoDetectado(null)
    setBebedourosDoPasto([])
    setBuscandoPasto(false)
    // Remover a feature desenhada do Terra Draw (voltar para render antes)
    if (drawRef.current && featureDesenhada?.id) {
      try {
          resetarTerraDraw()
        } catch (err) {
        console.warn('[Mapa] Erro ao remover feature:', err)
      }
    }
    setDrawMode(null)
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = ''
  }

  // ==================== Click no pasto para ver detalhes ou selecionar ====================
  const handleMapClick = async (e: maplibregl.MapLayerMouseEvent) => {
    // Se está em modo de desenho, não tratar click como seleção
    // Modo rota: intercepta o clique antes de tudo
    if (modoRotaRef.current) {
      const ponto: GeoJSON.Point = { type: 'Point', coordinates: [e.lngLat.lng, e.lngLat.lat] }
      if (modoRotaRef.current === 'origem') {
        setRotaOrigem(ponto)
        setRotaResultado(null)
        setRotaDistancia(null)
        setRotaErro(null)
        setRotaDestinos([])
        setModoRota('destinos')
      } else if (modoRotaRef.current === 'destinos') {
        // Adicionar mais um destino (não calcula ainda; usuário clica "Finalizar")
        setRotaDestinos((prev) => [...prev, ponto])
      }
      return
    }

    if (drawMode || editandoGeometria || editandoEstrada || editandoFabrica || editandoCurral) return

    const features = e.features
    if (!features || features.length === 0) return

    // Em modo de seleção múltipla, só seleciona pastos (ignora bebedouros)
    if (modoSelecaoMultipla) {
      const pastoFeature = features.find((f) => f.source === 'pastos-source' || f.source === 'pastos-labels-source')
      if (!pastoFeature) return
      const pastoId = pastoFeature.properties?.id as string
      if (!pastoId) return

      // Toggle seleção
      setPastosSelecionados((prev) => {
        const next = new Set(prev)
        if (next.has(pastoId)) {
          next.delete(pastoId)
        } else {
          next.add(pastoId)
        }
        return next
      })
      return
    }

    // Priorizar bebedouro (ponto está acima do polígono visualmente)
    const bebedouroFeature = features.find((f) => f.source === 'bebedouros-source')
    if (bebedouroFeature) {
      const bebedouroId = bebedouroFeature.properties?.id as string
      const bebedouroNome = bebedouroFeature.properties?.nome as string
      if (bebedouroId) {
        setPopupBebedouro({ lng: e.lngLat.lng, lat: e.lngLat.lat, id: bebedouroId, nome: bebedouroNome })
        return
      }
    }

    // Verificar se clicou numa fábrica
    const fabricaFeature = features.find((f) => f.source === 'fabricas-source')
    if (fabricaFeature) {
      const fabricaId = fabricaFeature.properties?.id as string
      const fabricaNome = fabricaFeature.properties?.nome as string
      if (fabricaId) {
        setFabricaDetalhe({ id: fabricaId, tipo: 'fabrica', nome: fabricaNome, geometria_geojson: null })
        setPastoDetalhe(null)
        setEstradaDetalhe(null)
        setPontoDetalhe(null)
        setCurralDetalhe(null)
        setMorteDetalhe(null)
        setMorteDestaqueId(null)
        return
      }
    }

    // Verificar se clicou num curral
    const curralFeature = features.find((f) => f.source === 'currais-source')
    if (curralFeature) {
      const curralId = curralFeature.properties?.id as string
      if (curralId) {
        setPastoDetalhe(null)
        setEstradaDetalhe(null)
        setPontoDetalhe(null)
        setFabricaDetalhe(null)
        setMorteDetalhe(null)
        setMorteDestaqueId(null)
        await carregarDetalheCurral(curralId)
        return
      }
    }

    // Verificar se clicou num ponto de interesse
    const pontoFeature = features.find((f) => f.source === 'pontos-source')
    if (pontoFeature) {
      const pontoId = pontoFeature.properties?.id as string
      const pontoTipo = pontoFeature.properties?.tipo as string
      const pontoNome = pontoFeature.properties?.nome as string
      if (pontoId) {
        setPontoDetalhe({ id: pontoId, tipo: pontoTipo, nome: pontoNome, geometria_geojson: null })
        setPastoDetalhe(null)
        setEstradaDetalhe(null)
        setFabricaDetalhe(null)
        setCurralDetalhe(null)
        setMorteDetalhe(null)
        setMorteDestaqueId(null)
        return
      }
    }

    // Verificar se clicou num cluster de mortes (zoom in no centro)
    const clusterFeature = features.find((f) => f.source === 'mortes-source' && f.properties?.point_count)
    if (clusterFeature) {
      const coords = (clusterFeature.geometry as any).coordinates
      if (coords) {
        const currentZoom = mapRef.current?.getZoom() || 10
        mapRef.current?.easeTo({ center: coords, zoom: currentZoom + 2 })
      }
      return
    }

    // Verificar se clicou numa morte (ponto GPS individual)
    // Buscar o registro original no array mortesRef para preservar acentos/cedilha
    // (MapLibre pode corromper caracteres UTF-8 nas properties do feature)
    const morteFeature = features.find((f) => f.source === 'mortes-source' && !f.properties?.point_count)
    if (morteFeature) {
      const morteId = morteFeature.properties?.id as string
      if (morteId) {
        const registro = mortesRef.current.find((m) => m.id === morteId)
        if (registro) {
          setMorteDetalhe({
            id: registro.id,
            data: registro.data,
            causaMorte: registro.causa_morte,
            brinco: registro.brinco,
            chip: registro.chip,
            categoria: registro.categoria,
            sexo: registro.sexo,
            raca: registro.raca,
            idade: registro.idade,
            pasto: registro.pasto,
            lote: registro.lote,
            pesoVivo: registro.peso_vivo,
            fotoUrl: registro.foto_url,
          })
          setMorteDestaqueId(morteId)
        }
        setPastoDetalhe(null)
        setEstradaDetalhe(null)
        setPontoDetalhe(null)
        setFabricaDetalhe(null)
        setCurralDetalhe(null)
        return
      }
    }

    // Verificar se clicou numa estrada
    const estradaFeature = features.find((f) => f.source === 'estradas-source')
    if (estradaFeature) {
      console.log('[Mapa] Click estrada:', estradaFeature)
      const estradaId = estradaFeature.properties?.id as string
      const estradaNome = estradaFeature.properties?.nome as string
      if (estradaId) {
        setEstradaDetalhe({ id: estradaId, nome: estradaNome, geometria_geojson: null })
        setPastoDetalhe(null)
        setPontoDetalhe(null)
        setFabricaDetalhe(null)
        setCurralDetalhe(null)
        setMorteDetalhe(null)
        setMorteDestaqueId(null)
        return
      }
    }

    // Verificar se clicou numa feature importada (KML/KMZ)
    const importFeature = features.find((f) => f.source === 'import-source')
    if (importFeature && featuresImportadas) {
      // O MapLibre pode truncar coordenadas; buscar por tipo + nome ao invés de comparar coords
      const importName = importFeature.properties?.name as string
      const importType = importFeature.geometry?.type

      // Encontrar a feature completa no GeoJSON importado
      let feature = featuresImportadas.features.find((f) => {
        if (!f.geometry) return false
        if (f.geometry.type !== importType) return false
        if (importName && f.properties?.name === importName) return true
        // Fallback: comparar primeira coordenada
        if (importType === 'Polygon') {
          const a = (importFeature.geometry as any).coordinates?.[0]?.[0]
          const b = (f.geometry as GeoJSON.Polygon).coordinates[0][0]
          return a && b && a[0] === b[0] && a[1] === b[1]
        }
        if (importType === 'Point') {
          const a = (importFeature.geometry as any).coordinates
          const b = (f.geometry as GeoJSON.Point).coordinates
          return a && b && a[0] === b[0] && a[1] === b[1]
        }
        if (importType === 'LineString') {
          const a = (importFeature.geometry as any).coordinates?.[0]
          const b = (f.geometry as GeoJSON.LineString).coordinates[0]
          return a && b && a[0] === b[0] && a[1] === b[1]
        }
        return false
      })

      // Se não encontrou por nome ou coordenada, pegar a primeira do mesmo tipo
      if (!feature) {
        feature = featuresImportadas.features.find((f) => f.geometry?.type === importType)
      }

      if (feature && (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'Point')) {
        // Se for polígono, perguntar se é pasto ou fábrica antes de associar
        if (feature.geometry?.type === 'Polygon') {
          setFeatureDesenhada(feature as any)
          setShowAssocTipoModal(true)
          return
        }
        // Se for ponto, associar direto (bebedouro)
        setFeatureDesenhada(feature as any)
        setPastoSelecionadoAssoc('')
        setPastoDetectado(null)
        setBebedourosDoPasto([])
        setShowAssocModal(true)
        return
      }

      // Se for LineString importada: abrir modal para nomear e salvar como estrada
      if (feature && feature.geometry?.type === 'LineString') {
        setEstradaDesenhada(feature as GeoJSON.Feature<GeoJSON.LineString>)
        setNomeEstrada(importName || '')
        setShowEstradaModal(true)
        return
      }
    }

    // Procurar feature de pasto clicada (pode ser o polígono ou o label)
    const pastoFeature = features.find((f) => f.source === 'pastos-source' || f.source === 'pastos-labels-source')
    if (!pastoFeature) return

    const pastoId = pastoFeature.properties?.id as string
    if (!pastoId) return

    setPopupBebedouro(null)
    setPopup({ lng: e.lngLat.lng, lat: e.lngLat.lat, nome: pastoFeature.properties?.nome || 'Pasto' })

    // Buscar detalhes completos do pasto
    await carregarDetalhePasto(pastoId)
  }

  const carregarDetalhePasto = async (pastoId: string) => {
    try {
      // Buscar pasto + bebedouros + lote associado ao pasto (via RPC com dados reais)
      const [pastoRes, bebedourosRes, loteRes] = await Promise.all([
        supabase
          .from('pastos')
          .select('*, modulos_pastos!left(nome)')
          .eq('id', pastoId)
          .maybeSingle(),
        supabase
          .from('pasto_bebedouros')
          .select('bebedouros(id, nome)')
          .eq('pasto_id', pastoId),
        supabase.rpc('get_lote_por_pasto', { p_pasto_id: pastoId }),
      ])

      if (pastoRes.data) {
        const p = pastoRes.data as any
        const bebedourosList: { id: string; nome: string }[] = []
        if (bebedourosRes.data) {
          ;(bebedourosRes.data as any[]).forEach((row) => {
            const b = row.bebedouros
            if (b) {
              const arr = Array.isArray(b) ? b : [b]
              arr.forEach((x: any) => bebedourosList.push({ id: x.id, nome: x.nome }))
            }
          })
        }

        const loteData = (loteRes.data as any[])?.[0] ?? null

        const detalhe: PastoDetalhe = {
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
          modulo_nome: p.modulos_pastos?.nome || null,
          bebedouros: bebedourosList,
          lote_atual: loteData
            ? {
                id: loteData.id,
                nome: loteData.nome,
                n_cabecas: loteData.cabecas_atual || 0,
                raca: loteData.raca,
                sexo: loteData.sexo,
                peso_medio_atual_kg: loteData.peso_medio_atual_kg ?? null,
              }
            : null,
        }
        setPastoDetalhe(detalhe)
        setEstradaDetalhe(null)
        setPontoDetalhe(null)
        setFabricaDetalhe(null)
        setCurralDetalhe(null)
        setMorteDetalhe(null)
        setMorteDestaqueId(null)
      }
    } catch (err) {
      console.error('Erro ao carregar detalhe do pasto:', err)
    }
  }

  const carregarDetalheCurral = async (curralId: string) => {
    try {
      const [curralRes, loteRes] = await Promise.all([
        supabase
          .from('currais')
          .select('*, formulacoes(nome), linhas_confinamento(largura_m, comprimento_m, metros_cocho_m)')
          .eq('id', curralId)
          .maybeSingle(),
        supabase.rpc('get_lote_por_curral', { p_curral_id: curralId }),
      ])

      if (curralRes.data) {
        const c = curralRes.data as any
        const loteData = (loteRes.data as any[])?.[0] ?? null

        const loteInfo = loteData
          ? {
              id: loteData.id,
              nome: loteData.nome,
              n_cabecas: loteData.cabecas_atual || 0,
              raca: loteData.raca,
              sexo: loteData.sexo,
              peso_medio_atual_kg: loteData.peso_medio_atual_kg ?? null,
            }
          : null

        const detalhe: CurralDetalhe = {
          id: c.id,
          nome: c.nome,
          lote_id: c.lote_id,
          geometria_geojson: null,
          largura_m: c.linhas_confinamento?.largura_m ?? null,
          comprimento_m: c.linhas_confinamento?.comprimento_m ?? null,
          metros_cocho_m: c.linhas_confinamento?.metros_cocho_m ?? null,
          formulacao_nome: c.formulacoes?.nome ?? null,
          lote_atual: loteInfo,
        }
        setCurralDetalhe(detalhe)
      }
    } catch (err) {
      console.error('Erro ao carregar detalhe do curral:', err)
    }
  }

  // ==================== Render ====================
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <p className="text-gray-500">Carregando mapa...</p>
      </div>
    )
  }

  if (!fazendaId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <p className="text-gray-500">Nenhuma fazenda vinculada ao seu usuário.</p>
      </div>
    )
  }

  // Executa a ação de remoção confirmada no modal (substitui window.confirm)
  const executarConfirmacao = async () => {
    if (!confirmAction) return
    const action = confirmAction
    setConfirmAction(null)
    try {
      if (action.type === 'removerEstrada') {
        const { error } = await supabase.rpc('remover_estrada', { p_estrada_id: action.estradaId })
        if (error) throw error
        setEstradaDetalhe(null)
        setImportStatus({ type: 'success', msg: 'Estrada removida.' })
        loadData()
      } else if (action.type === 'removerPonto') {
        const { error } = await supabase.rpc('remover_ponto', { p_ponto_id: action.pontoId })
        if (error) throw error
        setPontoDetalhe(null)
        setImportStatus({ type: 'success', msg: 'Ponto removido.' })
        loadData()
      } else if (action.type === 'removerFabrica') {
        const { error } = await supabase.rpc('remover_ponto', { p_ponto_id: action.fabricaId })
        if (error) throw error
        setFabricaDetalhe(null)
        setImportStatus({ type: 'success', msg: 'Fábrica removida.' })
        loadData()
      } else if (action.type === 'removerGeometriaCurral') {
        const { error } = await supabase.rpc('remover_geometria_curral', { p_curral_id: action.curralId })
        if (error) throw error
        setCurralDetalhe(null)
        setImportStatus({ type: 'success', msg: 'Geometria do curral removida.' })
        loadData()
      }
    } catch (err) {
      const rotuloErro =
        action.type === 'removerEstrada' ? 'Erro ao remover estrada:'
        : action.type === 'removerPonto' ? 'Erro ao remover ponto:'
        : action.type === 'removerFabrica' ? 'Erro ao remover fábrica:'
        : 'Erro ao remover curral:'
      console.error(rotuloErro, err)
      setImportStatus({ type: 'error', msg: `Erro ao remover: ${(err as Error).message}` })
    }
  }

  // Configuração do modal de confirmação conforme o tipo de ação
  const confirmModalConfig = confirmAction
    ? {
        removerEstrada: { title: 'Remover estrada', message: 'Remover esta estrada do mapa?' },
        removerPonto: { title: 'Remover ponto', message: 'Remover este ponto do mapa?' },
        removerFabrica: { title: 'Remover fábrica', message: 'Remover esta fábrica do mapa?' },
        removerGeometriaCurral: { title: 'Remover geometria do curral', message: 'Remover a geometria deste curral do mapa?' },
      }[confirmAction.type]
    : null

  return (
    <div className={modoTelaCheia ? 'fixed inset-0 z-50 bg-white flex flex-col' : 'space-y-4'}>
      {/* Header (oculto em tela cheia) */}
      {!modoTelaCheia && (
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mapa da Fazenda</h1>
          <p className="text-sm text-gray-500">
            Importe KML/KMZ do ArcGIS ou Google Earth, desenhe delimitações de pastos e associe aos cadastros.
          </p>
        </div>
      </div>
      )}

      {/* Toolbar (overlay compacto em tela cheia) */}
      <div className={modoTelaCheia
        ? 'absolute top-2 left-2 right-2 z-10 flex flex-col gap-2 bg-white/95 p-2 rounded-lg border border-gray-200 shadow-lg'
        : 'flex flex-col gap-2 bg-white p-3 rounded-lg border border-gray-200'
      }>
        <input
          ref={fileInputRef}
          type="file"
          accept=".kml,.kmz"
          onChange={handleFileImport}
          className="hidden"
        />

        {/* Linha 1: botoes de acao */}
        <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          variant={modoEdicao ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => {
            setModoEdicao(!modoEdicao)
            if (modoEdicao) {
              // Sair do modo edição: cancelar qualquer desenho ativo
              if (drawMode) {
                try { resetarTerraDraw() } catch { /* ignore */ }
                setDrawMode(null)
                const canvas = mapRef.current?.getCanvas()
                if (canvas) canvas.style.cursor = ''
              }
              setModoSelecaoMultipla(false)
              setPastosSelecionados(new Set())
            }
          }}
          className={modoEdicao
            ? 'bg-gray-800 text-white hover:bg-gray-900 border border-gray-900'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'}
        >
          <span className="flex items-center gap-2">
            {modoEdicao ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Visualização
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Editar
              </>
            )}
          </span>
        </Button>

        {modoEdicao && (
        <>
        {/* Grupo 1: Importar */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Importar KML/KMZ
          </span>
        </Button>
        {featuresImportadas && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setFeaturesImportadas(null)
              setImportStatus(null)
            }}
            className="bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
          >
            Remover Importação
          </Button>
        )}

        {/* Divider */}
        <div className="w-px h-8 bg-gray-300 mx-1" />

        {/* Grupo 2: Desenhar (colorido por entidade) */}
        <Button
          variant={drawMode === 'polygon' ? 'primary' : 'secondary'}
          size="sm"
          onClick={ativarDesenhoPoligono}
          className={drawMode === 'polygon'
            ? 'bg-green-600 text-white hover:bg-green-700 border border-green-700'
            : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4l16 0l0 16l-16 0z" />
            </svg>
            Pasto
          </span>
        </Button>
        <Button
          variant={drawMode === 'point' ? 'primary' : 'secondary'}
          size="sm"
          onClick={ativarDesenhoPonto}
          className={drawMode === 'point'
            ? 'bg-blue-600 text-white hover:bg-blue-700 border border-blue-700'
            : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2a8 8 0 00-8 8c0 5 8 12 8 12s8-7 8-12a8 8 0 00-8-8z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            Bebedouro
          </span>
        </Button>
        <Button
          variant={drawMode === 'linestring' ? 'primary' : 'secondary'}
          size="sm"
          onClick={ativarDesenhoEstrada}
          className={drawMode === 'linestring'
            ? 'bg-amber-600 text-white hover:bg-amber-700 border border-amber-700'
            : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 18c4-8 12-8 16 0M4 18a2 2 0 11-4 0 2 2 0 014 0zM20 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
            Estrada
          </span>
        </Button>
        <Button
          variant={drawMode === 'point-interesse' ? 'primary' : 'secondary'}
          size="sm"
          onClick={ativarDesenhoPontoInteresse}
          className={drawMode === 'point-interesse'
            ? 'bg-purple-600 text-white hover:bg-purple-700 border border-purple-700'
            : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Ponto
          </span>
        </Button>
        <Button
          variant={drawMode === 'fabrica' ? 'primary' : 'secondary'}
          size="sm"
          onClick={ativarDesenhoFabrica}
          className={drawMode === 'fabrica'
            ? 'bg-violet-700 text-white hover:bg-violet-800 border border-violet-800'
            : 'bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200'}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5" />
            </svg>
            Fábrica
          </span>
        </Button>
        <Button
          variant={drawMode === 'curral' ? 'primary' : 'secondary'}
          size="sm"
          onClick={ativarDesenhoCurral}
          className={drawMode === 'curral'
            ? 'bg-amber-800 text-white hover:bg-amber-900 border border-amber-900'
            : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300'}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            Curral
          </span>
        </Button>

        {/* Divider */}
        <div className="w-px h-8 bg-gray-300 mx-1" />

        {/* Grupo 3: Ferramentas */}
        <Button
          variant={modoRota ? 'primary' : 'secondary'}
          size="sm"
          onClick={ativarModoRota}
          className={modoRota
            ? 'bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-700'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Rota
          </span>
        </Button>
        <Button
          variant={modoSelecaoMultipla ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => {
            setModoSelecaoMultipla(!modoSelecaoMultipla)
            setPastosSelecionados(new Set())
          }}
          className={modoSelecaoMultipla
            ? 'bg-gray-700 text-white hover:bg-gray-800 border border-gray-800'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            {modoSelecaoMultipla ? 'Sair Seleção' : 'Seleção'}
          </span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={limparDesenho}
          className="bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600 border border-gray-300"
        >
          Limpar
        </Button>

        {/* Divider */}
        <div className="w-px h-8 bg-gray-300 mx-1" />
        </>
        )}

        <Button
          variant="secondary"
          size="sm"
          onClick={handleLocalizarDispositivo}
          disabled={localizando}
          className="bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-700 border border-gray-300"
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" strokeWidth={2} />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v3m0 14v3m10-10h-3M5 12H2" />
            </svg>
            {localizando ? 'Localizando...' : 'Localização'}
          </span>
        </Button>

        {/* Divider */}
        <div className="w-px h-8 bg-gray-300 mx-1" />

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setModoTelaCheia((v) => !v)}
          className="bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300"
        >
          <span className="flex items-center gap-2">
            {modoTelaCheia ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                </svg>
                Sair Tela Cheia
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
                Tela Cheia
              </>
            )}
          </span>
        </Button>
        </div>

        {/* Linha 2: camadas + contador */}
        <div className="flex items-center gap-2 flex-wrap bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-200">
          <label className="flex items-center gap-1.5 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={visCamadas.pastos}
              onChange={(e) => setVisCamadas((v) => ({ ...v, pastos: e.target.checked }))}
              className="accent-green-600"
            />
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-green-500/40 border border-green-600" />
              Pastos
            </span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={visCamadas.bebedouros}
              onChange={(e) => setVisCamadas((v) => ({ ...v, bebedouros: e.target.checked }))}
              className="accent-blue-600"
            />
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
              Bebedouros
            </span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={visCamadas.estradas}
              onChange={(e) => setVisCamadas((v) => ({ ...v, estradas: e.target.checked }))}
              className="accent-amber-600"
            />
            <span className="flex items-center gap-1">
              <span className="w-4 h-0.5 bg-amber-600" />
              Estradas
            </span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={visCamadas.pontos}
              onChange={(e) => setVisCamadas((v) => ({ ...v, pontos: e.target.checked }))}
              className="accent-purple-600"
            />
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-purple-600 border-2 border-white" />
              Pontos
            </span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={visCamadas.fabricas}
              onChange={(e) => setVisCamadas((v) => ({ ...v, fabricas: e.target.checked }))}
              className="accent-violet-700"
            />
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-violet-700 border border-violet-900" />
              Fábricas
            </span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={visCamadas.currais}
              onChange={(e) => setVisCamadas((v) => ({ ...v, currais: e.target.checked }))}
              className="accent-amber-800"
            />
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-amber-800 border border-amber-900" />
              Currais
            </span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={visCamadas.mortes}
              onChange={(e) => setVisCamadas((v) => ({ ...v, mortes: e.target.checked }))}
              className="accent-red-800"
            />
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-red-800 border border-red-900" />
              Mortes
            </span>
          </label>
          {visCamadas.mortes && (
            <div className="flex items-center gap-1.5 text-xs border-l border-gray-300 pl-2 ml-1">
              <span className="text-gray-500">Perodo:</span>
              <input
                type="date"
                value={mortesDataInicio || ''}
                onChange={(e) => setMortesDataInicio(e.target.value || null)}
                className="border border-gray-300 rounded px-1 py-0.5 text-xs"
              />
              <span className="text-gray-400">at</span>
              <input
                type="date"
                value={mortesDataFim || ''}
                onChange={(e) => setMortesDataFim(e.target.value || null)}
                className="border border-gray-300 rounded px-1 py-0.5 text-xs"
              />
              {(mortesDataInicio || mortesDataFim) && (
                <button
                  onClick={() => { setMortesDataInicio(null); setMortesDataFim(null) }}
                  className="text-gray-400 hover:text-gray-600 text-xs"
                  title="Limpar filtro"
                >
                  &#10005;
                </button>
              )}
              <label className="flex items-center gap-1 cursor-pointer ml-1" title="Agrupar mortes proximas">
                <input
                  type="checkbox"
                  checked={agruparMortes}
                  onChange={(e) => setAgruparMortes(e.target.checked)}
                  className="accent-red-800"
                />
                <span className="text-gray-600">Agrupar</span>
              </label>
              <button
                onClick={() => { setModoSelecaoArea(true); setMortesSelecionadas([]); setAreaSelecaoGeoJSON(null) }}
                disabled={modoSelecaoArea}
                className="text-xs px-2 py-0.5 rounded border border-red-700 text-red-800 hover:bg-red-50 disabled:opacity-50 disabled:cursor-default ml-1"
                title="Selecionar área para ver métricas agregadas"
              >
                Selecionar área
              </button>
            </div>
          )}
        </div>
        <div className="ml-auto text-sm text-gray-500">
          {pastos.filter((p) => p.geometria_geojson).length} pastos ·{' '}
          {bebedouros.filter((b) => b.geometria_geojson).length} bebedouros ·{' '}
          {estradas.length} estradas ·{' '}
          {pontosRegulares.length} pontos ·{' '}
          {fabricas.length} fábricas ·{' '}
          {currais.length} currais
        </div>
      </div>

      {/* Barra de edição de geometria (overlay em tela cheia) */}
      {editandoGeometria && (
        <div className={modoTelaCheia
          ? 'absolute top-16 left-2 right-2 z-10 flex items-center gap-3 bg-blue-50 border border-blue-200 p-3 rounded-lg flex-wrap shadow-lg'
          : 'flex items-center gap-3 bg-blue-50 border border-blue-200 p-3 rounded-lg flex-wrap'
        }>
          <span className="text-sm font-medium text-blue-800">
            Editando geometria do pasto <strong>{editandoGeometria.pastoNome}</strong>.
            Arraste os vértices para reposicioná-los. Clique duas vezes num ponto intermediário para criar um novo vértice. Clique com o botão direito num vértice para removê-lo.
          </span>
          <div className="flex gap-2 ml-auto">
            <Button
              variant="secondary"
              onClick={cancelarEdicaoGeometria}
              disabled={salvandoEdicao}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={salvarEdicaoGeometria}
              disabled={salvandoEdicao}
            >
              {salvandoEdicao ? 'Salvando...' : 'Salvar Edição'}
            </Button>
          </div>
        </div>
      )}

      {/* Barra de edição de estrada (overlay em tela cheia) */}
      {editandoEstrada && (
        <div className={modoTelaCheia
          ? 'absolute top-16 left-2 right-2 z-10 flex items-center gap-3 bg-amber-50 border border-amber-200 p-3 rounded-lg flex-wrap shadow-lg'
          : 'flex items-center gap-3 bg-amber-50 border border-amber-200 p-3 rounded-lg flex-wrap'
        }>
          <span className="text-sm font-medium text-amber-800">
            Editando estrada <strong>{editandoEstrada.estradaNome}</strong>.
            Arraste os vértices para reposicioná-los. Clique duas vezes num ponto intermediário para criar um novo vértice. Clique com o botão direito num vértice para removê-lo.
          </span>
          <div className="flex gap-2 ml-auto">
            <Button
              variant="secondary"
              onClick={cancelarEdicaoEstrada}
              disabled={salvandoEdicao}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={salvarEdicaoEstrada}
              disabled={salvandoEdicao}
            >
              {salvandoEdicao ? 'Salvando...' : 'Salvar Edição'}
            </Button>
          </div>
        </div>
      )}

      {/* Barra de edição de fábrica (overlay em tela cheia) */}
      {editandoFabrica && (
        <div className={modoTelaCheia
          ? 'absolute top-16 left-2 right-2 z-10 flex items-center gap-3 bg-violet-50 border border-violet-200 p-3 rounded-lg flex-wrap shadow-lg'
          : 'flex items-center gap-3 bg-violet-50 border border-violet-200 p-3 rounded-lg flex-wrap'
        }>
          <span className="text-sm font-medium text-violet-800">
            Editando fábrica <strong>{editandoFabrica.fabricaNome}</strong>.
            Arraste os vértices para reposicioná-los. Clique duas vezes num ponto intermediário para criar um novo vértice. Clique com o botão direito num vértice para removê-lo.
          </span>
          <div className="flex gap-2 ml-auto">
            <Button variant="secondary" onClick={cancelarEdicaoFabrica} disabled={salvandoEdicao}>Cancelar</Button>
            <Button variant="primary" onClick={salvarEdicaoFabrica} disabled={salvandoEdicao}>
              {salvandoEdicao ? 'Salvando...' : 'Salvar Edição'}
            </Button>
          </div>
        </div>
      )}

      {/* Barra de edição de curral (overlay em tela cheia) */}
      {editandoCurral && (
        <div className={modoTelaCheia
          ? 'absolute top-16 left-2 right-2 z-10 flex items-center gap-3 bg-amber-50 border border-amber-200 p-3 rounded-lg flex-wrap shadow-lg'
          : 'flex items-center gap-3 bg-amber-50 border border-amber-200 p-3 rounded-lg flex-wrap'
        }>
          <span className="text-sm font-medium text-amber-800">
            Editando curral <strong>{editandoCurral.curralNome}</strong>.
            Arraste os vértices para reposicioná-los. Clique duas vezes num ponto intermediário para criar um novo vértice. Clique com o botão direito num vértice para removê-lo.
          </span>
          <div className="flex gap-2 ml-auto">
            <Button variant="secondary" onClick={cancelarEdicaoCurral} disabled={salvandoEdicao}>Cancelar</Button>
            <Button variant="primary" onClick={salvarEdicaoCurral} disabled={salvandoEdicao}>
              {salvandoEdicao ? 'Salvando...' : 'Salvar Edição'}
            </Button>
          </div>
        </div>
      )}

      {/* Barra de rota (instruções + resultado) */}
      {(modoRota || rotaResultado || rotaErro || calculandoRota) && (
        <div className={modoTelaCheia
          ? 'absolute top-16 left-2 right-2 z-10 flex items-center gap-3 bg-blue-50 border border-blue-200 p-3 rounded-lg flex-wrap shadow-lg'
          : 'flex items-center gap-3 bg-blue-50 border border-blue-200 p-3 rounded-lg flex-wrap'
        }>
          {calculandoRota && (
            <span className="text-sm font-medium text-blue-800">
              Calculando rota...
            </span>
          )}
          {!calculandoRota && modoRota === 'origem' && (
            <>
              <span className="text-sm font-medium text-blue-800">
                Clique no mapa para marcar a origem (ex: fábrica).
              </span>
              <Button variant="secondary" onClick={cancelarRota} className="ml-auto">Cancelar</Button>
            </>
          )}
          {!calculandoRota && modoRota === 'destinos' && (
            <>
              <span className="text-sm font-medium text-blue-800">
                Origem marcada. Clique nos currais/cochos para adicionar destinos ({rotaDestinos.length} adicionado{rotaDestinos.length === 1 ? '' : 's'}).
              </span>
              {rotaDestinos.length > 0 && (
                <Button variant="secondary" onClick={removerUltimoDestino} className="ml-auto">Desfazer último</Button>
              )}
              {rotaDestinos.length >= 1 && (
                <Button variant="primary" onClick={finalizarRota}>Calcular Rota</Button>
              )}
              <Button variant="secondary" onClick={cancelarRota}>Cancelar</Button>
            </>
          )}
          {!calculandoRota && !modoRota && rotaResultado && rotaDistancia != null && (
            <>
              <span className="text-sm font-medium text-blue-800">
                Rota encontrada: <strong>{(rotaDistancia / 1000).toFixed(2)} km</strong>
                ({rotaDistancia.toFixed(0)} m) com {rotaDestinos.length} parada{rotaDestinos.length === 1 ? '' : 's'}
              </span>
              <Button variant="secondary" onClick={cancelarRota} className="ml-auto">Limpar Rota</Button>
            </>
          )}
          {!calculandoRota && !modoRota && rotaErro && (
            <>
              <span className="text-sm font-medium text-red-700">{rotaErro}</span>
              <Button variant="secondary" onClick={cancelarRota} className="ml-auto">Fechar</Button>
            </>
          )}
        </div>
      )}

      {/* Barra de ações em lote (seleção múltipla) */}
      {modoSelecaoMultipla && (
        <div className={modoTelaCheia
          ? 'absolute top-16 left-2 right-2 z-30 flex items-center gap-3 bg-blue-50 border border-blue-200 p-3 rounded-lg flex-wrap shadow-lg'
          : 'flex items-center gap-3 bg-blue-50 border border-blue-200 p-3 rounded-lg flex-wrap'
        }>
          <span className="text-sm font-medium text-blue-800">
            {pastosSelecionados.size === 0
              ? 'Clique nos pastos no mapa para selecioná-los.'
              : `${pastosSelecionados.size} pasto(s) selecionado(s).`}
          </span>
          {pastosSelecionados.size > 0 && (
            <>
              <Button
                variant="secondary"
                onClick={() => setShowRemocaoLoteModal(true)}
                className="text-red-600 hover:text-red-700 border-red-200"
              >
                Remover Geometrias
              </Button>
              <Button
                variant="secondary"
                onClick={() => setPastosSelecionados(new Set())}
              >
                Limpar Seleção
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={cancelarSelecaoMultipla} className="ml-auto">
            Sair da Seleção
          </Button>
        </div>
      )}

      {/* Status de importação (overlay em tela cheia) */}
      {importStatus && (
        <div
          className={modoTelaCheia
            ? `absolute bottom-2 left-2 z-10 p-3 pr-8 rounded-lg text-sm shadow-lg ${importStatus.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : importStatus.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-blue-50 text-blue-800 border border-blue-200'}`
            : `p-3 pr-8 rounded-lg text-sm relative ${importStatus.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : importStatus.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-blue-50 text-blue-800 border border-blue-200'}`
          }
        >
          {importStatus.msg}
          <button
            onClick={() => setImportStatus(null)}
            className="absolute top-1 right-1 text-current opacity-50 hover:opacity-100"
            aria-label="Dispensar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Mapa + Side Panel */}
      <div className={modoTelaCheia
        ? 'relative flex-1 flex'
        : 'flex gap-4 flex-col lg:flex-row'
      }>
        {/* Mapa */}
        <div className={modoTelaCheia
          ? 'flex-1 relative'
          : 'flex-1 relative rounded-lg overflow-hidden border border-gray-200'
        } style={modoTelaCheia
          ? { height: '100%' }
          : { height: 'calc(100vh - 280px)', minHeight: '400px' }
        }>
          <Map
            ref={mapRef}
            initialViewState={loadSavedView()}
            mapStyle={mapStyle}
            interactiveLayerIds={[
              ...(visCamadas.pastos ? ['pastos-fill', 'pastos-line', 'pastos-labels'] : []),
              ...(visCamadas.bebedouros ? ['bebedouros-circle'] : []),
              ...(visCamadas.estradas ? ['estradas-line'] : []),
              ...(visCamadas.pontos ? ['pontos-circle'] : []),
              ...(visCamadas.fabricas ? ['fabricas-fill', 'fabricas-line', 'fabricas-label'] : []),
              ...(visCamadas.currais ? ['currais-fill', 'currais-line', 'currais-label'] : []),
              ...(visCamadas.mortes ? ['mortes-circle', 'mortes-cluster-circle'] : []),
              ...(featuresImportadas ? ['import-fill', 'import-line', 'import-point', 'import-line-string'] : []),
            ]}
            onClick={handleMapClick}
            onLoad={handleMapLoad}
            onMoveEnd={(e) => saveView(e.viewState.longitude, e.viewState.latitude, e.viewState.zoom)}
            style={{ width: '100%', height: '100%' }}
          >
            <MapaCamadas
              visCamadas={visCamadas}
              pastosGeoJSON={pastosGeoJSON}
              pastosLabelsGeoJSON={pastosLabelsGeoJSON}
              bebedourosGeoJSON={bebedourosGeoJSON}
              fabricasGeoJSON={fabricasGeoJSON}
              curraisGeoJSON={curraisGeoJSON}
              mortesGeoJSON={mortesGeoJSON}
              agruparMortes={agruparMortes}
              areaSelecaoGeoJSON={areaSelecaoGeoJSON}
              morteDestaqueId={morteDestaqueId}
              pastosSelecionadosGeoJSON={pastosSelecionadosGeoJSON}
              pastoDetalheGeoJSON={pastoDetalheGeoJSON}
              estradaDetalheGeoJSON={estradaDetalheGeoJSON}
              fabricaDetalheGeoJSON={fabricaDetalheGeoJSON}
              curralDetalheGeoJSON={curralDetalheGeoJSON}
              estradas={estradas}
              pontosRegulares={pontosRegulares}
              editandoGeometria={editandoGeometria}
              editandoEstrada={editandoEstrada}
              editandoFabrica={editandoFabrica}
              editandoCurral={editandoCurral}
              rotaOrigem={rotaOrigem}
              rotaDestinos={rotaDestinos}
              rotaResultado={rotaResultado}
              rotaSetas={rotaSetas}
              featuresImportadas={featuresImportadas}
              userLocation={userLocation}
              popup={popup}
              popupBebedouro={popupBebedouro}
              setPopup={setPopup}
              setPopupBebedouro={setPopupBebedouro}
              onRemoverBebedouro={removerGeometriaBebedouro}
            />

            {/* Controles de navegação adicionados via useEffect no map instance */}
          </Map>

          {/* Overlay de selecao por area (retangulo) */}
          {modoSelecaoArea && (
            <div
              className="absolute inset-0 z-20"
              style={{ cursor: 'crosshair' }}
              onMouseDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const x = e.clientX - rect.left
                const y = e.clientY - rect.top
                arrastandoSelecaoRef.current = true
                setAreaSelecao({ x1: x, y1: y, x2: x, y2: y })
              }}
              onMouseMove={(e) => {
                if (!arrastandoSelecaoRef.current) return
                const rect = e.currentTarget.getBoundingClientRect()
                const x = e.clientX - rect.left
                const y = e.clientY - rect.top
                setAreaSelecao((prev) => prev ? { ...prev, x2: x, y2: y } : null)
              }}
              onMouseUp={(e) => {
                if (!arrastandoSelecaoRef.current) return
                arrastandoSelecaoRef.current = false
                const rect = e.currentTarget.getBoundingClientRect()
                const x2 = e.clientX - rect.left
                const y2 = e.clientY - rect.top
                setAreaSelecao((prev) => {
                  if (!prev) { setModoSelecaoArea(false); return null }
                  const x1 = prev.x1
                  const y1 = prev.y1
                  const minX = Math.min(x1, x2)
                  const maxX = Math.max(x1, x2)
                  const minY = Math.min(y1, y2)
                  const maxY = Math.max(y1, y2)
                  // Ignorar clique sem arrasto (menos de 5px)
                  if (Math.abs(maxX - minX) < 5 || Math.abs(maxY - minY) < 5) {
                    setModoSelecaoArea(false)
                    return null
                  }
                  // Converter pixels para coordenadas
                  const lngLat1 = mapRef.current?.unproject([minX, minY])
                  const lngLat2 = mapRef.current?.unproject([maxX, maxY])
                  if (lngLat1 && lngLat2) {
                    const minLng = Math.min(lngLat1.lng, lngLat2.lng)
                    const maxLng = Math.max(lngLat1.lng, lngLat2.lng)
                    const minLat = Math.min(lngLat1.lat, lngLat2.lat)
                    const maxLat = Math.max(lngLat1.lat, lngLat2.lat)
                    const bbox = { minLng, maxLng, minLat, maxLat }
                    const selecionadas = mortesRef.current.filter((m) =>
                      m.latitude != null && m.longitude != null &&
                      m.longitude >= bbox.minLng && m.longitude <= bbox.maxLng &&
                      m.latitude >= bbox.minLat && m.latitude <= bbox.maxLat
                    )
                    setMortesSelecionadas(selecionadas)
                    // Guardar retângulo como GeoJSON para destacar no mapa
                    setAreaSelecaoGeoJSON({
                      type: 'FeatureCollection',
                      features: [{
                        type: 'Feature',
                        properties: {},
                        geometry: {
                          type: 'Polygon',
                          coordinates: [[
                            [minLng, minLat],
                            [maxLng, minLat],
                            [maxLng, maxLat],
                            [minLng, maxLat],
                            [minLng, minLat],
                          ]],
                        },
                      }],
                    })
                    setMorteDetalhe(null)
        setMorteDestaqueId(null)
                    setPastoDetalhe(null)
                    setEstradaDetalhe(null)
                    setPontoDetalhe(null)
                    setFabricaDetalhe(null)
                    setCurralDetalhe(null)
                  }
                  setModoSelecaoArea(false)
                  return null
                })
              }}
            >
              {areaSelecao && (
                <div
                  className="absolute border-2 border-dashed border-red-700 bg-red-700/10 pointer-events-none"
                  style={{
                    left: Math.min(areaSelecao.x1, areaSelecao.x2),
                    top: Math.min(areaSelecao.y1, areaSelecao.y2),
                    width: Math.abs(areaSelecao.x2 - areaSelecao.x1),
                    height: Math.abs(areaSelecao.y2 - areaSelecao.y1),
                  }}
                />
              )}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-red-800 text-white text-xs px-3 py-1 rounded-full shadow-lg pointer-events-none">
                Clique e arraste para selecionar a área
              </div>
            </div>
          )}
        </div>

        {/* Side Panel: detalhes do pasto (overlay flutuante em tela cheia) */}
        {pastoDetalhe && (
          <PastoDetalhePanel
            detalhe={pastoDetalhe}
            modoTelaCheia={modoTelaCheia}
            onFechar={() => { setPastoDetalhe(null); setPopup(null) }}
            onEditarGeometria={iniciarEdicaoGeometria}
            onRemoverGeometria={removerGeometriaPasto}
          />
        )}

        {/* Side Panel: detalhes da estrada (overlay flutuante em tela cheia) */}
        {estradaDetalhe && (
          <EstradaDetalhePanel
            detalhe={estradaDetalhe}
            estradas={estradas}
            modoTelaCheia={modoTelaCheia}
            onFechar={() => setEstradaDetalhe(null)}
            onEditarGeometria={iniciarEdicaoEstrada}
            onRemover={removerEstrada}
          />
        )}

        {/* Side Panel: detalhes do ponto de interesse */}
        {pontoDetalhe && (
          <PontoDetalhePanel
            detalhe={pontoDetalhe}
            modoTelaCheia={modoTelaCheia}
            onFechar={() => setPontoDetalhe(null)}
            onRemover={removerPonto}
          />
        )}

        {/* Side Panel: detalhes da fábrica */}
        {fabricaDetalhe && (
          <FabricaDetalhePanel
            detalhe={fabricaDetalhe}
            modoTelaCheia={modoTelaCheia}
            onFechar={() => setFabricaDetalhe(null)}
            onEditarGeometria={iniciarEdicaoFabrica}
            onRemover={removerFabrica}
          />
        )}

        {/* Side Panel: detalhes do curral */}
        {curralDetalhe && (
          <CurralDetalhePanel
            detalhe={curralDetalhe}
            modoTelaCheia={modoTelaCheia}
            onFechar={() => setCurralDetalhe(null)}
            onEditarGeometria={iniciarEdicaoCurral}
            onRemoverGeometria={removerGeometriaCurral}
          />
        )}

        {/* Side Panel: detalhes da morte */}
        {morteDetalhe && (
          <MorteDetalhePanel
            detalhe={morteDetalhe}
            modoTelaCheia={modoTelaCheia}
            onFechar={() => { setMorteDetalhe(null); setMorteDestaqueId(null) }}
          />
        )}

        {/* Side Panel: métricas agregadas de mortes na área selecionada */}
        {mortesSelecionadas.length > 0 && !morteDetalhe && (
          <MortesAgregadasPanel
            mortes={mortesSelecionadas}
            modoTelaCheia={modoTelaCheia}
            onFechar={() => { setMortesSelecionadas([]); setAreaSelecaoGeoJSON(null) }}
            onVerDetalhe={(m) => {
              setMorteDetalhe({
                id: m.id,
                data: m.data,
                causaMorte: m.causa_morte,
                brinco: m.brinco,
                chip: m.chip,
                categoria: m.categoria,
                sexo: m.sexo,
                raca: m.raca,
                idade: m.idade,
                pasto: m.pasto,
                lote: m.lote,
                pesoVivo: m.peso_vivo,
                fotoUrl: m.foto_url,
              })
            }}
          />
        )}
      </div>

      {/* Modal: associar geometria desenhada a pasto (polígono) ou bebedouro (ponto) */}
      <AssocGeometriaModal
        isOpen={showAssocModal}
        onClose={cancelarAssociacao}
        featureDesenhada={featureDesenhada}
        buscandoPasto={buscandoPasto}
        pastoDetectado={pastoDetectado}
        bebedourosDoPasto={bebedourosDoPasto}
        pastosSemGeometria={pastosSemGeometria}
        pastoSelecionadoAssoc={pastoSelecionadoAssoc}
        setPastoSelecionadoAssoc={setPastoSelecionadoAssoc}
        salvando={salvando}
        onSalvarBebedouro={salvarGeometriaBebedouro}
        onSalvarPasto={salvarGeometriaPasto}
      />

      {/* Modal: confirmar remoção de geometria */}
      <ConfirmarRemocaoModal
        isOpen={confirmarRemocao !== null}
        onClose={() => setConfirmarRemocao(null)}
        confirmarRemocao={confirmarRemocao}
        removendo={removendo}
        onConfirmar={confirmarRemocaoGeometria}
      />

      {/* Modal: confirmar remoção em lote */}
      <RemocaoLoteModal
        isOpen={showRemocaoLoteModal}
        onClose={() => setShowRemocaoLoteModal(false)}
        quantidadePastos={pastosSelecionados.size}
        removerBebedourosLote={removerBebedourosLote}
        setRemoverBebedourosLote={setRemoverBebedourosLote}
        removendoLote={removendoLote}
        onConfirmar={confirmarRemocaoLote}
      />

      {/* Modal: nomear estrada */}
      <NomearEstradaModal
        isOpen={showEstradaModal}
        onClose={cancelarEstrada}
        nomeEstrada={nomeEstrada}
        setNomeEstrada={setNomeEstrada}
        salvando={salvando}
        onSalvar={salvarEstrada}
      />

      {/* Modal: nomear ponto de interesse */}
      <NomearPontoModal
        isOpen={showPontoModal}
        onClose={cancelarPonto}
        tipoPontoSelecionado={tipoPontoSelecionado}
        setTipoPontoSelecionado={setTipoPontoSelecionado}
        nomePonto={nomePonto}
        setNomePonto={setNomePonto}
        salvando={salvando}
        onSalvar={salvarPonto}
      />

      {/* Modal: nomear fábrica */}
      <NomearFabricaModal
        isOpen={showFabricaModal}
        onClose={cancelarFabrica}
        nomeFabrica={nomeFabrica}
        setNomeFabrica={setNomeFabrica}
        salvando={salvando}
        onSalvar={salvarFabrica}
      />

      {/* Modal: associar curral */}
      <AssociarCurralModal
        isOpen={showCurralModal}
        onClose={cancelarCurral}
        curraisSemGeo={curraisSemGeo}
        curralSelecionadoAssoc={curralSelecionadoAssoc}
        setCurralSelecionadoAssoc={setCurralSelecionadoAssoc}
        salvando={salvando}
        onSalvar={salvarCurral}
      />

      {/* Modal: perguntar tipo de associação (pasto ou fábrica) */}
      <AssocTipoModal
        isOpen={showAssocTipoModal}
        onClose={() => {
          if (drawRef.current && featureDesenhada?.id) {
            try {
              resetarTerraDraw()
            } catch (e) { console.warn(e) }
          }
          setShowAssocTipoModal(false)
          setFeatureDesenhada(null)
          setDrawMode(null)
          const canvas = mapRef.current?.getCanvas()
          if (canvas) canvas.style.cursor = ''
        }}
        onSelecionarPasto={() => {
          setShowAssocTipoModal(false)
          setPastoSelecionadoAssoc('')
          setPastoDetectado(null)
          setBebedourosDoPasto([])
          setShowAssocModal(true)
        }}
        onSelecionarFabrica={() => {
          setShowAssocTipoModal(false)
          setNomeFabrica('')
          setShowFabricaModal(true)
        }}
      />

      {/* Modal de confirmação genérico para remoções (estrada, ponto, fábrica, curral) */}
      <ConfirmModal
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={executarConfirmacao}
        title={confirmModalConfig?.title ?? ''}
        message={confirmModalConfig?.message ?? ''}
        confirmText="Remover"
        variant="danger"
      />
    </div>
  )
}
