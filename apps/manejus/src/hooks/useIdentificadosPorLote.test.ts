import { describe, expect, it } from 'vitest'
import { agruparIdentificadosPorLote } from './useIdentificadosPorLote'

describe('agruparIdentificadosPorLote', () => {
  it('conta identificados e incertos por lote', () => {
    const resultado = agruparIdentificadosPorLote([
      { lote_atual: 'a', localizacao_incerta_desde: null },
      { lote_atual: 'a', localizacao_incerta_desde: '2026-10-15' },
      { lote_atual: 'a', localizacao_incerta_desde: '2026-10-10' },
      { lote_atual: 'b', localizacao_incerta_desde: null },
    ])
    expect(resultado).toEqual({
      a: { identificados: 3, incertos: 2 },
      b: { identificados: 1, incertos: 0 },
    })
  })

  it('ignora animais sem lote', () => {
    expect(agruparIdentificadosPorLote([{ lote_atual: null, localizacao_incerta_desde: null }])).toEqual({})
  })

  it('lista vazia devolve objeto vazio', () => {
    expect(agruparIdentificadosPorLote([])).toEqual({})
  })
})
