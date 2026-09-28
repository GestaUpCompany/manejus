// Hook: geolocalizacao do dispositivo + import KML/KMZ
import { useEffect, useRef, useState } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import { extrairCoordenadas, importarArquivoKml } from './importKml'
import type { FeatureImportadaItem } from './importKml'

interface ImportStatus { type: 'success' | 'error' | 'info'; msg: string }
interface UserLocation { lng: number; lat: number; accuracy: number }

interface Props {
  mapRef: React.RefObject<MapRef | null>
  fileInputRef: React.RefObject<HTMLInputElement | null>
}

export function useMapGeolocalizacao({ mapRef, fileInputRef }: Props) {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null)
  const [localizando, setLocalizando] = useState(false)
  const [featuresImportadas, setFeaturesImportadas] = useState<GeoJSON.FeatureCollection | null>(null)
  const [itensImportados, setItensImportados] = useState<FeatureImportadaItem[] | null>(null)
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null)
  const watchIdRef = useRef<number | null>(null)

  // Auto-dismiss do importStatus após 10 segundos
  useEffect(() => {
    if (!importStatus) return
    const t = setTimeout(() => setImportStatus(null), 10000)
    return () => clearTimeout(t)
  }, [importStatus])

  // No Painel Web (browser) usa Web Geolocation API. A precisão depende do hardware:
  // GPS nativo (celular) é preciso (~10m), WiFi triangulation é médio (~50-100m),
  // IP geolocation (desktop sem WiFi) é impreciso (~1-5km).
  // No PWA usaremos @capacitor/geolocation que acessa GPS nativo.
  const handleLocalizarDispositivo = () => {
    if (!navigator.geolocation) {
      setImportStatus({ type: 'error', msg: 'Geolocalização não suportada neste navegador.' })
      return
    }

    // Parar watch anterior se existir
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }

    setLocalizando(true)
    let primeiraLeitura = true

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { longitude, latitude, accuracy } = position.coords
        setUserLocation({ lng: longitude, lat: latitude, accuracy })

        // Voar para a localização apenas na primeira leitura
        if (primeiraLeitura && mapRef.current) {
          mapRef.current.flyTo({
            center: [longitude, latitude],
            zoom: 15,
            duration: 1500,
          })
          primeiraLeitura = false
          setLocalizando(false)

          // Aviso de precisão
          if (accuracy > 100) {
            setImportStatus({
              type: 'info',
              msg: `Localização encontrada com precisão de ~${Math.round(accuracy)}m. No navegador desktop a precisão é limitada (usa WiFi/IP, não GPS). No app mobile a precisão será de ~10m com GPS nativo. O círculo azul mostra a margem de erro.`,
            })
          } else {
            setImportStatus({
              type: 'info',
              msg: `Localização encontrada com precisão de ~${Math.round(accuracy)}m. Você está no ponto azul.`,
            })
          }
        }
      },
      (err) => {
        setLocalizando(false)
        let msg = 'Erro ao obter localização.'
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Permissão de localização negada. Habilite no navegador para usar esta função.'
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Posição indisponível. Verifique o GPS do dispositivo.'
        } else if (err.code === err.TIMEOUT) {
          msg = 'Tempo esgotado ao obter localização. Tente novamente.'
        }
        setImportStatus({ type: 'error', msg })
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    )
  }

  // Limpar watch ao desmontar
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  // Retorna os itens parseados SEM commitar no estado: o caller decide
  // (filtro de pastas → match → revisão) antes de aplicarItensImportados.
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>): Promise<FeatureImportadaItem[] | null> => {
    const file = e.target.files?.[0]
    if (!file) return null

    setImportStatus({ type: 'info', msg: `Processando ${file.name}...` })

    try {
      const { itens } = await importarArquivoKml(file)
      return itens
    } catch (err) {
      console.error('Erro ao importar KML/KMZ:', err)
      setImportStatus({ type: 'error', msg: `Erro ao processar arquivo: ${(err as Error).message}` })
      return null
    } finally {
      // Limpar input para permitir reimportar o mesmo arquivo
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Comita os itens na camada temporária de importação e enquadra o mapa.
  const aplicarItensImportados = (itens: FeatureImportadaItem[]) => {
    setItensImportados(itens)
    setFeaturesImportadas({ type: 'FeatureCollection', features: itens.map((i) => i.feature) })
    setImportStatus({
      type: 'success',
      msg: `${itens.length} features importadas. Revise as associações sugeridas ou clique numa feature para associar manualmente.`,
    })

    if (mapRef.current && itens.length > 0) {
      const coords = itens.flatMap((i) => extrairCoordenadas(i.feature.geometry))
      if (coords.length > 0) {
        const lngs = coords.map((c) => c[0])
        const lats = coords.map((c) => c[1])
        const bounds: [[number, number], [number, number]] = [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ]
        mapRef.current.fitBounds(bounds, { padding: 50, duration: 1000 })
      }
    }
  }

  return {
    userLocation,
    localizando,
    featuresImportadas,
    itensImportados,
    importStatus,
    setImportStatus,
    setFeaturesImportadas,
    setItensImportados,
    handleLocalizarDispositivo,
    handleFileImport,
    aplicarItensImportados,
  }
}
