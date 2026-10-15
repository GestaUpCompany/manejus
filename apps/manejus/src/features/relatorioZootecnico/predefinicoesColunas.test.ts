import { describe, expect, it } from 'vitest'
import { mesmaConfig, salvarPredefinicao } from './predefinicoesColunas'

describe('predefinições de colunas', () => {
  const cfg = { ordem: ['b', 'a'], ocultas: ['c'] }

  it('cria, substitui pelo mesmo nome e ignora nome vazio', () => {
    const a = salvarPredefinicao([], '  Campo ', cfg)!
    expect(a.lista).toHaveLength(1)
    expect(a.lista[0]).toMatchObject({ nome: 'Campo', ordem: ['b', 'a'], ocultas: ['c'] })
    const b = salvarPredefinicao(a.lista, 'campo', { ordem: ['a', 'b'], ocultas: [] })!
    expect(b.lista).toHaveLength(1)
    expect(b.id).toBe(a.id)
    expect(b.lista[0].ordem).toEqual(['a', 'b'])
    expect(salvarPredefinicao(a.lista, '   ', cfg)).toBeNull()
  })

  it('compara configurações ignorando a ordem das ocultas', () => {
    expect(mesmaConfig({ ordem: ['a', 'b'], ocultas: ['x', 'y'] }, { ordem: ['a', 'b'], ocultas: ['y', 'x'] })).toBe(true)
    expect(mesmaConfig({ ordem: ['a', 'b'], ocultas: [] }, { ordem: ['b', 'a'], ocultas: [] })).toBe(false)
  })
})
