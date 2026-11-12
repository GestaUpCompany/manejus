import { describe, expect, it } from 'vitest'
import { chavePrecoCategoria, normalizarCategoria, PRECO_KG_FALLBACK, precoKgCategoria, rotuloCategoria } from './categorias'

describe('categorias do relatório de mortalidade', () => {
  it('normaliza caixa, acento e espaços', () => {
    expect(normalizarCategoria('  Bezerro  ao Pé ')).toBe('bezerro ao pe')
    expect(normalizarCategoria(null)).toBe('')
  })

  it('agrupa variações no mesmo rótulo', () => {
    expect(rotuloCategoria('boi gordo')).toBe('Boi Gordo')
    expect(rotuloCategoria('BOI GORDO')).toBe('Boi Gordo')
    expect(rotuloCategoria('bezerro ao pe')).toBe('Bezerro ao pé')
    expect(rotuloCategoria('matriz descarte')).toBe('Matriz descarte')
    expect(rotuloCategoria('')).toBeNull()
  })

  it('busca o preço da fazenda ignorando caixa', () => {
    expect(precoKgCategoria('boi gordo', { 'Boi Gordo': 13 })).toBe(13)
  })

  it('usa o padrão quando a fazenda não tem preço e a reserva para categoria desconhecida', () => {
    expect(precoKgCategoria('vaca', {})).toBe(10.83)
    expect(precoKgCategoria('matriz descarte', {})).toBe(PRECO_KG_FALLBACK)
  })

  it('bezerro(a) ao pé usa o preço de bezerro(a)', () => {
    expect(chavePrecoCategoria('Bezerra ao pé')).toBe('bezerra')
    expect(precoKgCategoria('bezerro ao pé', { Bezerro: 14 })).toBe(14)
    expect(precoKgCategoria('bezerra ao pe', {})).toBe(11.5)
  })
})
