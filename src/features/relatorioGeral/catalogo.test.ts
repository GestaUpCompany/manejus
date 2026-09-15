import { describe, expect, it } from 'vitest'
import { moverRelatorio, RELATORIOS_GERAIS } from './catalogo'

describe('catálogo do relatório geral', () => {
  it('mantém os quatro relatórios na ordem padrão', () => {
    expect(RELATORIOS_GERAIS.map((item) => item.id)).toEqual([
      'abastecimento',
      'consumo',
      'bebedouros',
      'morte',
    ])
  })

  it('move itens sem ultrapassar os limites', () => {
    const ids = RELATORIOS_GERAIS.map((item) => item.id)
    expect(moverRelatorio(ids, 'consumo', -1)).toEqual([
      'consumo',
      'abastecimento',
      'bebedouros',
      'morte',
    ])
    expect(moverRelatorio(ids, 'abastecimento', -1)).toBe(ids)
    expect(moverRelatorio(ids, 'morte', 1)).toBe(ids)
  })
})
