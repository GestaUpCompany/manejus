import { describe, it, expect } from 'vitest'
import {
  calcularCentroidePoligono,
  pontoDentroPoligono,
  calcularMelhorLabel,
  gerarCirculoPrecisao,
  calcularComprimentoEstrada,
} from './geometriaUtils'

// Poligono quadrado: (0,0) -> (10,0) -> (10,10) -> (0,10) -> (0,0)
// Nota: coords[0] deve ser igual ao ultimo ponto (ring fechado)
const quadrado: [number, number][] = [
  [0, 0], [10, 0], [10, 10], [0, 10], [0, 0],
]

// Poligono triangular: (0,0) -> (6,0) -> (3,6) -> (0,0)
const triangulo: [number, number][] = [
  [0, 0], [6, 0], [3, 6], [0, 0],
]

// Poligono concavo (formato L):
// (0,0) -> (6,0) -> (6,2) -> (2,2) -> (2,6) -> (0,6) -> (0,0)
// O centroide cai fora do poligono (na concavidade)
const formaL: [number, number][] = [
  [0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6], [0, 0],
]

describe('calcularCentroidePoligono', () => {
  it('quadrado: centróide no centro (5, 5)', () => {
    const [cx, cy] = calcularCentroidePoligono(quadrado)
    expect(cx).toBeCloseTo(5, 5)
    expect(cy).toBeCloseTo(5, 5)
  })

  it('triangulo: centróide em (3, 2)', () => {
    const [cx, cy] = calcularCentroidePoligono(triangulo)
    expect(cx).toBeCloseTo(3, 5)
    expect(cy).toBeCloseTo(2, 5)
  })

  it('forma L: centróide cai fora do poligono (na concavidade)', () => {
    const [cx, cy] = calcularCentroidePoligono(formaL)
    // Centroide ponderado por area de um L cai aproximadamente em (3.33, 3.33)
    // que esta na concavidade (fora do poligono)
    expect(pontoDentroPoligono(cx, cy, formaL)).toBe(false)
  })

  it('poligono degenerado (pontos colineares): fallback para media dos vertices', () => {
    const colinear: [number, number][] = [[0, 0], [5, 5], [10, 10], [0, 0]]
    const [cx, cy] = calcularCentroidePoligono(colinear)
    // Area = 0, fallback: media = (0+5+10+0)/4 = 3.75
    expect(cx).toBeCloseTo(3.75, 5)
    expect(cy).toBeCloseTo(3.75, 5)
  })
})

describe('pontoDentroPoligono', () => {
  it('ponto dentro do quadrado', () => {
    expect(pontoDentroPoligono(5, 5, quadrado)).toBe(true)
  })

  it('ponto fora do quadrado', () => {
    expect(pontoDentroPoligono(15, 15, quadrado)).toBe(false)
  })

  it('pento no vertice do quadrado (na borda)', () => {
    // Ray casting: ponto exatamente na borda é ambíguo, mas o algoritmo
    // deve retornar true ou false consistentemente (nao crasha)
    const result = pontoDentroPoligono(0, 0, quadrado)
    expect(typeof result).toBe('boolean')
  })

  it('ponto dentro da forma L (parte horizontal)', () => {
    expect(pontoDentroPoligono(3, 1, formaL)).toBe(true)
  })

  it('ponto dentro da forma L (parte vertical)', () => {
    expect(pontoDentroPoligono(1, 4, formaL)).toBe(true)
  })

  it('ponto na concavidade da forma L (fora)', () => {
    expect(pontoDentroPoligono(4, 4, formaL)).toBe(false)
  })
})

describe('calcularMelhorLabel', () => {
  it('quadrado: retorna centróide (5, 5) que esta dentro', () => {
    const [lng, lat] = calcularMelhorLabel(quadrado)
    expect(lng).toBeCloseTo(5, 5)
    expect(lat).toBeCloseTo(5, 5)
  })

  it('triangulo: retorna centróide (3, 2) que esta dentro', () => {
    const [lng, lat] = calcularMelhorLabel(triangulo)
    expect(lng).toBeCloseTo(3, 5)
    expect(lat).toBeCloseTo(2, 5)
  })

  it('forma L: centróide cai fora, mas o label deve cair dentro do poligono', () => {
    const [lng, lat] = calcularMelhorLabel(formaL)
    expect(pontoDentroPoligono(lng, lat, formaL)).toBe(true)
  })
})

describe('gerarCirculoPrecisao', () => {
  it('gera 65 pontos (64 segmentos + fechamento)', () => {
    const coords = gerarCirculoPrecisao(-55, -13, 100)
    expect(coords.length).toBe(65)
  })

  it('primeiro e ultimo ponto sao iguais (anel fechado)', () => {
    const coords = gerarCirculoPrecisao(-55, -13, 100)
    expect(coords[0][0]).toBeCloseTo(coords[64][0], 10)
    expect(coords[0][1]).toBeCloseTo(coords[64][1], 10)
  })

  it('o raio aproximado corresponde ao accuracy passado', () => {
    const lng = -55
    const lat = -13
    const raioMetros = 500
    const coords = gerarCirculoPrecisao(lng, lat, raioMetros)
    // Medir distancia do centro ao primeiro ponto (deve ser ~raioMetros)
    const [, py] = coords[0]
    // deltaLat = (raioKm * cos(0)) / 111.32 = 0.5 / 111.32
    const deltaLatEsperado = 0.5 / 111.32
    expect(py - lat).toBeCloseTo(deltaLatEsperado, 8)
  })

  it('todos os pontos tem coordenadas validas (numeros)', () => {
    const coords = gerarCirculoPrecisao(-55, -13, 1000)
    coords.forEach(([x, y]) => {
      expect(typeof x).toBe('number')
      expect(typeof y).toBe('number')
      expect(Number.isNaN(x)).toBe(false)
      expect(Number.isNaN(y)).toBe(false)
    })
  })
})

describe('calcularComprimentoEstrada', () => {
  it('feature undefined retorna 0', () => {
    expect(calcularComprimentoEstrada(undefined)).toBe(0)
  })

  it('feature sem coordenadas retorna 0', () => {
    const feature = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } as GeoJSON.Feature<GeoJSON.LineString>
    expect(calcularComprimentoEstrada(feature)).toBe(0)
  })

  it('linha de 1 grau de latitude (~111km)', () => {
    const feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [[0, 0], [0, 1]],
      },
    } as GeoJSON.Feature<GeoJSON.LineString>
    const comprimento = calcularComprimentoEstrada(feature)
    // 1 grau de latitude ≈ 111.32km
    expect(comprimento).toBeGreaterThan(110000)
    expect(comprimento).toBeLessThan(112000)
  })

  it('linha com 3 pontos soma os 2 segmentos', () => {
    const feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [[0, 0], [0, 1], [1, 1]],
      },
    } as GeoJSON.Feature<GeoJSON.LineString>
    const comprimento = calcularComprimentoEstrada(feature)
    // Segmento 1: ~111km (latitude), Segmento 2: ~111km (longitude no equador)
    expect(comprimento).toBeGreaterThan(220000)
    expect(comprimento).toBeLessThan(225000)
  })

  it('ponto unico retorna 0 (nao ha segmentos)', () => {
    const feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [[0, 0]],
      },
    } as GeoJSON.Feature<GeoJSON.LineString>
    expect(calcularComprimentoEstrada(feature)).toBe(0)
  })
})
