import { describe, it, expect } from 'vitest'
import { normalizarNome, extrairNomeUtil, sugerirMatches, linhasEmConflito } from './nomeMatch'
import type { FeatureImportadaItem } from './importKml'

function item(nome: string, folder = 'Pecuaria Atual', grupoPlacemark = 0): FeatureImportadaItem {
  return {
    importId: `imp-${nome}`,
    feature: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    },
    nomeOriginal: nome,
    nomeLimpo: extrairNomeUtil(nome),
    folder,
    tipoGeometria: 'Polygon',
    parteInfo: null,
    grupoPlacemark,
  }
}

const pasto = (nome: string, temGeo = false) => ({ id: `id-${nome}`, nome, temGeo })

describe('normalizarNome', () => {
  it('remove separadores, pontuação e iguala caixa', () => {
    expect(normalizarNome('1. TIP 01')).toBe('01TIP01')
    expect(normalizarNome('1TIP01')).toBe('01TIP01')
    expect(normalizarNome('1TIP1')).toBe('01TIP01')
    expect(normalizarNome('MI-09 A')).toBe('MI09A')
    expect(normalizarNome('mi-09a')).toBe('MI09A')
    expect(normalizarNome('SR-22.A')).toBe('SR22A')
    expect(normalizarNome('SL-06/A')).toBe('SL06A')
  })

  it('zero-pad em sequências numéricas', () => {
    expect(normalizarNome('TIP1')).toBe('TIP01')
    expect(normalizarNome('P1')).toBe('P01')
    expect(normalizarNome('P10')).toBe('P10')
  })

  it('remove diacríticos', () => {
    expect(normalizarNome('Açúcar 1')).toBe('ACUCAR01')
  })
})

describe('extrairNomeUtil', () => {
  it('remove sufixo de área em ha', () => {
    expect(extrairNomeUtil('MI-09 A  66,02 ha')).toBe('MI-09 A')
    expect(extrairNomeUtil('SL-15  79,43 ha')).toBe('SL-15')
    expect(extrairNomeUtil('SR19  108,6 ha')).toBe('SR19')
    expect(extrairNomeUtil('MI-42 B  138,54 ha')).toBe('MI-42 B')
  })

  it('remove sufixo decimal sem unidade', () => {
    expect(extrairNomeUtil('Curral  15,93 ha')).toBe('Curral')
    expect(extrairNomeUtil('Piq. Curral  32,97 ha')).toBe('Piq. Curral')
  })

  it('nome puramente numérico retorna null', () => {
    expect(extrairNomeUtil('348,387329380913')).toBeNull()
    expect(extrairNomeUtil('55876,1948030158')).toBeNull()
    expect(extrairNomeUtil('')).toBeNull()
    expect(extrairNomeUtil(null)).toBeNull()
  })

  it('não corta inteiro sem unidade que faz parte do nome', () => {
    expect(extrairNomeUtil('LOTE 5')).toBe('LOTE 5')
    expect(extrairNomeUtil('MI-29-2')).toBe('MI-29-2')
  })

  it('sufixo TESTE é preservado', () => {
    expect(extrairNomeUtil('MI-06 B TESTE  77,1 ha')).toBe('MI-06 B TESTE')
  })
})

describe('sugerirMatches', () => {
  const pastos = [
    pasto('1. TIP 10'),
    pasto('MI-09 A'),
    pasto('MI-09 B'),
    pasto('MI-10 A'),
    pasto('MI-10 B'),
    pasto('MI-10 C'),
    pasto('MI-39'),
    pasto('MI-54-A'),
    pasto('MI-54-B'),
    pasto('SL-13'),
    pasto('SR-22 A'),
    pasto('Pasto Com Geo', true),
  ]

  it('match exato canonical vira auto', () => {
    const rows = sugerirMatches([item('1TIP10  25,51 ha')], pastos)
    expect(rows[0].status).toBe('auto')
    expect(rows[0].pastoSelecionado).toBe('id-1. TIP 10')
    expect(rows[0].score).toBe(1)
  })

  it('match exato com separadores diferentes', () => {
    const rows = sugerirMatches([item('SR-22.A  66,82 ha')], pastos)
    expect(rows[0].status).toBe('auto')
    expect(rows[0].pastoSelecionado).toBe('id-SR-22 A')
  })

  it('contenção única vira sugestao (nunca auto)', () => {
    const rows = sugerirMatches([item('MI-39.A  118,55 ha')], pastos)
    expect(rows[0].status).toBe('sugestao')
    expect(rows[0].pastoSelecionado).toBe('id-MI-39')
  })

  it('contenção múltipla vira ambiguo sem pré-seleção', () => {
    const rows = sugerirMatches([item('MI-10   82,19 ha')], pastos)
    expect(rows[0].status).toBe('ambiguo')
    expect(rows[0].pastoSelecionado).toBe('')
    expect(rows[0].candidatos).toHaveLength(3)
  })

  it('exato em pasto que já tem geometria vira sugestao', () => {
    const rows = sugerirMatches([item('Pasto Com Geo  10,0 ha')], pastos)
    expect(rows[0].status).toBe('sugestao')
  })

  it('nome numérico vira sem_nome', () => {
    const rows = sugerirMatches([item('348,387329380913')], pastos)
    expect(rows[0].status).toBe('sem_nome')
  })

  it('sem candidato vira sem_match', () => {
    const rows = sugerirMatches([item('ZZ-99  10,0 ha')], pastos)
    expect(rows[0].status).toBe('sem_match')
    expect(rows[0].pastoSelecionado).toBe('')
  })
})

describe('desempate de partes multi-geometria', () => {
  function parte(nome: string, grupo: number, anel: number[][], idx = 0): FeatureImportadaItem {
    return {
      ...item(nome, 'Pecuaria Atual', grupo),
      importId: `imp-${nome}-${grupo}-${idx}`,
      parteInfo: 'parte 1/2',
      feature: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [anel] } },
    }
  }

  const anelPequeno = [[0, 0], [1, 0], [1, 1], [0, 0]]
  const anelGrande = [[0, 0], [10, 0], [10, 10], [0, 0]]

  it('partes do mesmo placemark no mesmo pasto: só a maior fica selecionada', () => {
    const pastos = [pasto('SL-20')]
    const rows = sugerirMatches(
      [parte('SL-20  10 ha', 7, anelPequeno), parte('SL-20  10 ha', 7, anelGrande)],
      pastos
    )
    expect(rows[0].pastoSelecionado).toBe('')
    expect(rows[1].pastoSelecionado).toBe('id-SL-20')
    expect(linhasEmConflito(rows).size).toBe(0)
  })

  it('placemarks distintos com o mesmo nome seguem em conflito', () => {
    const pastos = [pasto('SL-20')]
    const rows = sugerirMatches(
      [parte('SL-20  10 ha', 7, anelPequeno), parte('SL-20  10 ha', 9, anelGrande, 1)],
      pastos
    )
    expect(linhasEmConflito(rows).size).toBe(2)
  })
})

describe('linhasEmConflito', () => {
  it('duas linhas no mesmo pasto entram em conflito', () => {
    const pastos = [pasto('SL-13')]
    const rows = sugerirMatches(
      [item('SL-13 A  69,3 ha'), item('SL-13 B  75,61 ha'), item('SL-13 C  72,06 ha')],
      pastos
    )
    const conflito = linhasEmConflito(rows)
    expect(conflito.size).toBe(3)
  })

  it('linha ignorada não conta como conflito', () => {
    const pastos = [pasto('SL-13')]
    const rows = sugerirMatches([item('SL-13 A  69,3 ha'), item('SL-13 B  75,61 ha')], pastos)
    rows[0].ignorado = true
    expect(linhasEmConflito(rows).size).toBe(0)
  })
})
