// Persistência de posição/zoom do mapa no localStorage

const MAP_VIEW_KEY = 'mapaFazendaView'
const DEFAULT_VIEW = { longitude: -55.0, latitude: -13.0, zoom: 8 }

export function loadSavedView(): { longitude: number; latitude: number; zoom: number } {
  try {
    const raw = localStorage.getItem(MAP_VIEW_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (
        typeof parsed.longitude === 'number' &&
        typeof parsed.latitude === 'number' &&
        typeof parsed.zoom === 'number'
      ) {
        return parsed
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_VIEW
}

export function saveView(lng: number, lat: number, zoom: number) {
  try {
    localStorage.setItem(MAP_VIEW_KEY, JSON.stringify({ longitude: lng, latitude: lat, zoom }))
  } catch {
    // ignore
  }
}
