// Utilidades de geometria para o mapa: centróide, point-in-polygon, melhor label, círculo de precisão

// Calcular centróide verdadeiro de um polígono (ponderado por área)
// Fórmula: Cx = (1/6A) * Σ(xi + xi+1)(xi*yi+1 - xi+1*yi)
//          Cy = (1/6A) * Σ(yi + yi+1)(xi*yi+1 - xi+1*yi)
//          A  = (1/2) * Σ(xi*yi+1 - xi+1*yi)
export function calcularCentroidePoligono(coords: [number, number][]): [number, number] {
  let area = 0
  let cx = 0
  let cy = 0

  for (let i = 0; i < coords.length - 1; i++) {
    const [x0, y0] = coords[i]
    const [x1, y1] = coords[i + 1]
    const cross = x0 * y1 - x1 * y0
    area += cross
    cx += (x0 + x1) * cross
    cy += (y0 + y1) * cross
  }

  area *= 0.5
  if (area === 0) {
    // Polígono degenerado: fallback para média dos vértices
    let lx = 0, ly = 0
    coords.forEach((c) => { lx += c[0]; ly += c[1] })
    return [lx / coords.length, ly / coords.length]
  }

  cx = cx / (6 * area)
  cy = cy / (6 * area)
  return [cx, cy]
}

// Testar se um ponto está dentro de um polígono (ray casting)
export function pontoDentroPoligono(lng: number, lat: number, coords: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i][0], yi = coords[i][1]
    const xj = coords[j][0], yj = coords[j][1]
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

// Calcular o melhor ponto para o label do pasto:
// 1. Tenta o centróide verdadeiro (ponderado por área)
// 2. Se cair fora do polígono, usa o centro do bounding box
// 3. Se também cair fora, faz uma busca em grade do bounding box
export function calcularMelhorLabel(coords: [number, number][]): [number, number] {
  // 1. Centróide verdadeiro
  const [cx, cy] = calcularCentroidePoligono(coords)
  if (pontoDentroPoligono(cx, cy, coords)) {
    return [cx, cy]
  }

  // 2. Centro do bounding box
  const lngs = coords.map((c) => c[0])
  const lats = coords.map((c) => c[1])
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const bboxCx = (minLng + maxLng) / 2
  const bboxCy = (minLat + maxLat) / 2
  if (pontoDentroPoligono(bboxCx, bboxCy, coords)) {
    return [bboxCx, bboxCy]
  }

  // 3. Busca em grade dentro do bounding box
  const steps = 20
  for (let i = 1; i < steps; i++) {
    for (let j = 1; j < steps; j++) {
      const x = minLng + (maxLng - minLng) * (i / steps)
      const y = minLat + (maxLat - minLat) * (j / steps)
      if (pontoDentroPoligono(x, y, coords)) {
        return [x, y]
      }
    }
  }

  // Fallback final: centróide mesmo que fora do polígono
  return [cx, cy]
}

// Gerar círculo de precisão como polígono (aproximação esférica)
// Retorna array de coordenadas [lng, lat] formando um anel
export function gerarCirculoPrecisao(lng: number, lat: number, raioMetros: number): [number, number][] {
  const coords: [number, number][] = []
  const numPontos = 64
  const raioKm = raioMetros / 1000
  const latRad = (lat * Math.PI) / 180

  for (let i = 0; i <= numPontos; i++) {
    const angulo = (i * 2 * Math.PI) / numPontos
    // Aproximação esférica para distâncias curtas
    const deltaLat = (raioKm * Math.cos(angulo)) / 111.32
    const deltaLng = (raioKm * Math.sin(angulo)) / (111.32 * Math.cos(latRad))
    coords.push([lng + deltaLng, lat + deltaLat])
  }

  return coords
}

// Calcular comprimento de uma LineString em metros (Haversine simplificado)
export function calcularComprimentoEstrada(feature: GeoJSON.Feature<GeoJSON.LineString> | undefined): number {
  if (!feature?.geometry?.coordinates) return 0
  const coords = feature.geometry.coordinates
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1]
    const [lng2, lat2] = coords[i]
    const R = 6371000 // raio da Terra em metros
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }
  return total
}
