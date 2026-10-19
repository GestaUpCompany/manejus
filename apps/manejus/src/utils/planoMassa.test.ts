import { describe, expect, it } from 'vitest'
import {
  isBezerroAoPe,
  modoPadrao,
  montarItens,
  periodoPorDataFinal,
  validarLinha,
  type CategoriaLinha,
  type LoteLinha,
} from './planoMassa'

const cat = (o: Partial<CategoriaLinha> = {}): CategoriaLinha => ({
  id: 'c1',
  categoria: 'Novilho',
  quantAtual: 10,
  pesoAtual: 300,
  gmd: 0.8,
  periodo: '',
  pesoMeta: '',
  ...o,
})

const linha = (o: Partial<LoteLinha> = {}): LoteLinha => ({
  loteId: 'L1',
  nome: 'Lote 1',
  enfermaria: false,
  vigenteNome: null,
  modo: 'iniciar',
  retroativo: false,
  nomePlano: 'Engorda',
  periodo: '90',
  pesoMeta: '450',
  categorias: [cat()],
  ...o,
})

describe('isBezerroAoPe', () => {
  it('reconhece com e sem acento', () => {
    expect(isBezerroAoPe('Bezerro ao pé')).toBe(true)
    expect(isBezerroAoPe('bezerra ao pe')).toBe(true)
    expect(isBezerroAoPe('Bezerro')).toBe(false)
  })
})

describe('modoPadrao', () => {
  it('migra quando há vigente e inicia quando não há', () => {
    expect(modoPadrao(true)).toBe('migrar')
    expect(modoPadrao(false)).toBe('iniciar')
  })
})

describe('periodoPorDataFinal', () => {
  it('conta os dias até a data final', () => {
    expect(periodoPorDataFinal('2026-10-29', new Date('2026-10-19T15:00:00'))).toBe(10)
  })
  it('devolve null para data vazia ou inválida', () => {
    expect(periodoPorDataFinal('')).toBeNull()
    expect(periodoPorDataFinal('xx')).toBeNull()
  })
})

describe('validarLinha', () => {
  it('aceita uma linha completa', () => {
    expect(validarLinha(linha()).erros).toEqual([])
  })

  it('exige nome, período e peso meta', () => {
    const { erros } = validarLinha(linha({ nomePlano: ' ', periodo: '', pesoMeta: '0' }))
    expect(erros).toContain('Informe o nome do plano.')
    expect(erros.join()).toMatch(/Período deve ser/)
    expect(erros.join()).toMatch(/Peso meta deve ser/)
  })

  it('bloqueia migrar sem vigente e iniciar com vigente', () => {
    expect(validarLinha(linha({ modo: 'migrar' })).erros.join()).toMatch(/não há o que migrar/)
    expect(validarLinha(linha({ modo: 'iniciar', vigenteNome: 'X' })).erros.join()).toMatch(/já tem plano vigente/)
  })

  it('bloqueia categoria sem peso atual ao iniciar, mas não ao enfileirar', () => {
    const l = linha({ categorias: [cat({ pesoAtual: null })] })
    expect(validarLinha(l).erros.join()).toMatch(/sem peso vivo atual/)
    expect(validarLinha({ ...l, modo: 'enfileirar' }).erros).toEqual([])
  })

  it('bloqueia peso meta da categoria menor ou igual ao peso atual', () => {
    const l = linha({ categorias: [cat({ pesoMeta: '300' })] })
    expect(validarLinha(l).erros.join()).toMatch(/deve ser maior que o peso atual/)
  })

  it('bloqueia peso meta acima do máximo no lote e na categoria', () => {
    expect(validarLinha(linha({ pesoMeta: '700720' })).erros.join()).toMatch(/acima do máximo/)
    const l = linha({ categorias: [cat({ pesoMeta: '1600' })] })
    expect(validarLinha(l).erros.join()).toMatch(/Novilho: peso meta acima do máximo/)
    expect(validarLinha(linha({ pesoMeta: '1500', categorias: [cat()] })).erros).toEqual([])
  })

  it('avisa categoria sem GMD e lote em enfermaria', () => {
    const { avisos } = validarLinha(linha({ enfermaria: true, categorias: [cat({ gmd: null })] }))
    expect(avisos.join()).toMatch(/não tem GMD/)
    expect(avisos.join()).toMatch(/enfermaria/)
  })

  it('ignora bezerro ao pé nas validações', () => {
    const l = linha({ categorias: [cat(), cat({ id: 'c2', categoria: 'Bezerro ao pé', pesoAtual: null, gmd: null })] })
    expect(validarLinha(l).erros).toEqual([])
  })
})

describe('montarItens', () => {
  it('herda período e peso meta do lote e respeita override por categoria', () => {
    const l = linha({
      categorias: [cat({ id: 'a' }), cat({ id: 'b', categoria: 'Boi', pesoMeta: '520,5', periodo: '120' })],
    })
    const [item] = montarItens([l])
    expect(item.categorias).toEqual([
      { lote_categoria_id: 'a', periodo_dias: 90, peso_meta_kg: 450 },
      { lote_categoria_id: 'b', periodo_dias: 120, peso_meta_kg: 520.5 },
    ])
  })

  it('não envia categorias ao só enfileirar nem bezerro ao pé', () => {
    const l = linha({ categorias: [cat(), cat({ id: 'c2', categoria: 'Bezerra ao pé' })] })
    expect(montarItens([{ ...l, modo: 'enfileirar' }])[0].categorias).toEqual([])
    expect(montarItens([l])[0].categorias.map((c) => c.lote_categoria_id)).toEqual(['c1'])
  })

  it('só marca retroativo ao iniciar', () => {
    const l = linha({ retroativo: true })
    expect(montarItens([l])[0].retroativo).toBe(true)
    expect(montarItens([{ ...l, modo: 'migrar', vigenteNome: 'X' }])[0].retroativo).toBe(false)
  })
})
