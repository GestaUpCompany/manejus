import { describe, expect, it } from 'vitest'
import { aplicarConfigColunas, moverColunaPara, moverColunaVisivel, reconciliarConfig } from './configColunas'
import type { TabelaZootecnica } from './colunas'

const tabela: TabelaZootecnica = {
  colunas: [
    { id: 'a', grupo: 'G1', header: 'A', tipo: 'texto' },
    { id: 'b', grupo: 'G1', header: 'B', tipo: 'int' },
    { id: 'c', grupo: 'G2', header: 'C', tipo: 'int' },
  ],
  geral: ['ga', 'gb', 'gc'],
  secoes: [{ titulo: 'S', total: ['ta', 'tb', 'tc'], linhas: [['1a', '1b', '1c']] }],
}

describe('reconciliarConfig', () => {
  it('descarta ids antigos, acrescenta novos e evita ocultar tudo', () => {
    expect(reconciliarConfig({ ordem: ['c', 'x', 'a'], ocultas: ['x', 'a'] }, ['a', 'b', 'c'])).toEqual({ ordem: ['c', 'a', 'b'], ocultas: ['a'] })
    expect(reconciliarConfig({ ordem: [], ocultas: ['a', 'b', 'c'] }, ['a', 'b', 'c']).ocultas).toEqual([])
    expect(reconciliarConfig(null, ['a', 'b']).ordem).toEqual(['a', 'b'])
  })
})

describe('moverColunaVisivel', () => {
  it('pula colunas ocultas e respeita as bordas', () => {
    expect(moverColunaVisivel(['a', 'b', 'c'], [], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(moverColunaVisivel(['a', 'b', 'c'], ['b'], 'a', 1)).toEqual(['c', 'b', 'a'])
    expect(moverColunaVisivel(['a', 'b', 'c'], [], 'a', -1)).toEqual(['a', 'b', 'c'])
    expect(moverColunaVisivel(['a', 'b', 'c'], ['b'], 'c', 1)).toEqual(['a', 'b', 'c'])
  })
})

describe('moverColunaPara', () => {
  it('coloca a coluna arrastrada na posição do alvo', () => {
    expect(moverColunaPara(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a'])
    expect(moverColunaPara(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
    expect(moverColunaPara(['a', 'b', 'c'], 'b', 'b')).toEqual(['a', 'b', 'c'])
  })
})

describe('aplicarConfigColunas', () => {
  it('reordena e oculta em colunas, geral, totais e linhas', () => {
    const t = aplicarConfigColunas(tabela, { ordem: ['c', 'a', 'b'], ocultas: ['a'] })
    expect(t.colunas.map((c) => c.id)).toEqual(['c', 'b'])
    expect(t.geral).toEqual(['gc', 'gb'])
    expect(t.secoes[0].total).toEqual(['tc', 'tb'])
    expect(t.secoes[0].linhas).toEqual([['1c', '1b']])
  })

  it('mantém total nulo', () => {
    const t = aplicarConfigColunas({ ...tabela, secoes: [{ titulo: 'S', total: null, linhas: [] }] }, { ordem: ['a', 'b', 'c'], ocultas: [] })
    expect(t.secoes[0].total).toBeNull()
  })
})
