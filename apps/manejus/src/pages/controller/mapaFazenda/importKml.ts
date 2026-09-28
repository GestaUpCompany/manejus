// Parse de arquivos KML/KMZ para o mapa da fazenda.
// Extrai geometrias (flattened), nomes limpos e a pasta (Folder) de origem
// de cada placemark — o togeojson descarta o Folder, então mapeamos via DOM.
import { kml } from '@tmcw/togeojson'
import { strFromU8, unzipSync } from 'fflate'
import { extrairNomeUtil } from './nomeMatch'

export interface FeatureImportadaItem {
  /** id estável para lookup no click handler (vai em properties.__importId) */
  importId: string
  /** feature GeoJSON de geometria simples (GeometryCollection/Multi* são flattenados) */
  feature: GeoJSON.Feature
  /** <name> original do placemark */
  nomeOriginal: string
  /** nome sem sufixo de medida; null quando o nome é só número (área/comprimento) */
  nomeLimpo: string | null
  /** nome do <Folder> de origem no KML; null quando indisponível */
  folder: string | null
  /** tipo final da geometria após flatten (Polygon | LineString | Point) */
  tipoGeometria: string
  /** "parte X/Y" quando o placemark tinha geometria múltipla */
  parteInfo: string | null
  /** índice do placemark de origem: partes de um mesmo placemark compartilham o valor */
  grupoPlacemark: number
}

export interface ResultadoImportacao {
  itens: FeatureImportadaItem[]
  geojson: GeoJSON.FeatureCollection
}

async function lerTextoKml(file: File): Promise<string> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.kmz')) {
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()))
    const kmlKey = Object.keys(files).find((k) => k.toLowerCase().endsWith('.kml'))
    if (!kmlKey) throw new Error('KMZ não contém arquivo KML.')
    return strFromU8(files[kmlKey])
  }
  if (lower.endsWith('.kml')) return file.text()
  throw new Error('Formato não suportado. Use .kml ou .kmz.')
}

// KMLs do Google Earth Pro / ArcGIS trazem namespaces não declarados
// (xsi:schemaLocation) que quebram o DOMParser em modo XML.
function parseKmlDom(kmlText: string): Document {
  const kmlClean = kmlText
    .replace(/xsi:schemaLocation="[^"]*"/g, '')
    .replace(/xmlns:xsi="[^"]*"/g, '')
    .replace(/xsi:/g, '')

  let dom = new DOMParser().parseFromString(kmlClean, 'application/xml')
  if (dom.getElementsByTagName('parsererror').length > 0) {
    console.warn('[KML] Parser XML falhou após limpeza; tentando como HTML.')
    dom = new DOMParser().parseFromString(kmlClean, 'text/html')
  }
  return dom
}

function nomeDoFolderPai(el: Element | null): string | null {
  let cur = el?.parentElement ?? null
  while (cur) {
    if (cur.tagName === 'Folder') {
      const nameEl = Array.from(cur.children).find((c) => c.tagName === 'name')
      return nameEl?.textContent?.trim() || null
    }
    cur = cur.parentElement
  }
  return null
}

function flattenGeometry(g: GeoJSON.Geometry): GeoJSON.Geometry[] {
  if (g.type === 'GeometryCollection') {
    return g.geometries.flatMap(flattenGeometry)
  }
  if (g.type === 'MultiPolygon') {
    return g.coordinates.map((c) => ({ type: 'Polygon', coordinates: c }) as GeoJSON.Polygon)
  }
  if (g.type === 'MultiLineString') {
    return g.coordinates.map((c) => ({ type: 'LineString', coordinates: c }) as GeoJSON.LineString)
  }
  if (g.type === 'MultiPoint') {
    return g.coordinates.map((c) => ({ type: 'Point', coordinates: c }) as GeoJSON.Point)
  }
  return [g]
}

/** Todas as coordenadas [lng,lat] de uma geometria (qualquer tipo). */
export function extrairCoordenadas(g: GeoJSON.Geometry | null | undefined): [number, number][] {
  if (!g) return []
  switch (g.type) {
    case 'Point':
      return [g.coordinates as [number, number]]
    case 'MultiPoint':
    case 'LineString':
      return g.coordinates as [number, number][]
    case 'MultiLineString':
    case 'Polygon':
      return g.coordinates.flat() as [number, number][]
    case 'MultiPolygon':
      return g.coordinates.flat(2) as [number, number][]
    case 'GeometryCollection':
      return g.geometries.flatMap((sub) => extrairCoordenadas(sub))
    default:
      return []
  }
}

/**
 * Lê um arquivo .kml/.kmz e retorna os itens importados:
 * uma entrada por geometria simples, com nome limpo e folder de origem.
 */
export async function importarArquivoKml(file: File): Promise<ResultadoImportacao> {
  const kmlText = await lerTextoKml(file)
  const dom = parseKmlDom(kmlText)
  const geojson = kml(dom) as GeoJSON.FeatureCollection

  // Mapear folder de cada placemark pela posição no documento:
  // togeojson emite features na mesma ordem dos <Placemark> no DOM.
  const placemarks = Array.from(dom.getElementsByTagName('Placemark'))
  const foldersPorIndice = placemarks.map(nomeDoFolderPai)
  const foldersConfiaveis = geojson.features.length === placemarks.length
  if (!foldersConfiaveis) {
    console.warn(
      `[KML] Placemarks (${placemarks.length}) != features (${geojson.features.length}); folders não serão mapeados.`
    )
  }

  const itens: FeatureImportadaItem[] = []
  ;(geojson.features || []).forEach((f, idx) => {
    if (!f.geometry) return
    const folder = foldersConfiaveis ? foldersPorIndice[idx] : null
    const nomeOriginal = (f.properties?.name as string) || ''
    const geometrias = flattenGeometry(f.geometry)

    geometrias.forEach((g, gi) => {
      const importId = `imp-${itens.length}`
      const feature: GeoJSON.Feature = {
        type: 'Feature',
        properties: { ...(f.properties || {}), __importId: importId },
        geometry: g,
      }
      itens.push({
        importId,
        feature,
        nomeOriginal,
        nomeLimpo: extrairNomeUtil(nomeOriginal),
        folder,
        tipoGeometria: g.type,
        parteInfo: geometrias.length > 1 ? `parte ${gi + 1}/${geometrias.length}` : null,
        grupoPlacemark: idx,
      })
    })
  })

  if (itens.length === 0) {
    throw new Error('KML não contém features válidas.')
  }

  return {
    itens,
    geojson: { type: 'FeatureCollection', features: itens.map((i) => i.feature) },
  }
}
