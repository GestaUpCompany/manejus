// Configuração do mapa: fontes raster, estilo, tipos de ponto, estilos Terra Draw
import maplibregl from 'maplibre-gl'

// Config ESRI World Imagery (raster, gratuito, sem token)
export const esriWorldImagery: maplibregl.RasterSourceSpecification = {
  type: 'raster',
  tiles: [
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  ],
  tileSize: 256,
  attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics',
  maxzoom: 19,
}

export const esriLabels: maplibregl.RasterSourceSpecification = {
  type: 'raster',
  tiles: [
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  ],
  tileSize: 256,
  maxzoom: 19,
}

// Estilo do mapa: fundo verde acinzentado para fallback offline gracioso
export const mapStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    esri: esriWorldImagery,
    'esri-labels': esriLabels,
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#3a4a3a',
      },
    },
    {
      id: 'esri-satellite',
      type: 'raster',
      source: 'esri',
      paint: {},
    },
    {
      id: 'esri-labels',
      type: 'raster',
      source: 'esri-labels',
      paint: {
        'raster-opacity': 0.8,
      },
    },
  ],
}

// Tipos de pontos de interesse com cor e ícone
export const TIPOS_PONTO: { value: string; label: string; cor: string; icone: string }[] = [
  { value: 'fabrica', label: 'Fábrica de Ração', cor: '#7c3aed', icone: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5' },
  { value: 'curral', label: 'Curral', cor: '#dc2626', icone: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z' },
  { value: 'portao', label: 'Portão', cor: '#0891b2', icone: 'M4 4v16M20 4v16M4 12h16' },
  { value: 'saleiro', label: 'Saleiro', cor: '#ca8a04', icone: 'M12 2C8 2 5 5 5 9c0 3 4 8 7 13 3-5 7-10 7-13 0-4-3-7-7-7z' },
  { value: 'cocho', label: 'Cocho', cor: '#16a34a', icone: 'M4 6h16M4 6l2 12h12l2-12' },
  { value: 'outro', label: 'Outro', cor: '#6b7280', icone: 'M12 2a8 8 0 100 16 8 8 0 000-16z' },
]

export function corPonto(tipo: string): string {
  return TIPOS_PONTO.find((t) => t.value === tipo)?.cor ?? '#6b7280'
}

export function labelPonto(tipo: string): string {
  return TIPOS_PONTO.find((t) => t.value === tipo)?.label ?? tipo
}

// Estilos de desenho para Terra Draw
export const terraDrawStyles = {
  polygon: {
    fillColor: '#22c55e',
    outlineColor: '#16a34a',
    outlineWidth: 2,
    fillOpacity: 0.3,
  },
  point: {
    pointColor: '#3b82f6',
    pointWidth: 8,
    pointOutlineColor: '#ffffff',
    pointOutlineWidth: 2,
    pointOutlineOpacity: 1,
    pointOpacity: 1,
  },
}
