import { describe, expect, it } from 'vitest'
import { planejarConfirmacao } from './confirmacaoLocalizacao'

describe('planejarConfirmacao', () => {
  it('agrupa por lote só os animais com localização incerta', () => {
    const plano = planejarConfirmacao([
      { id: 'a', lote_atual: 'L1', localizacao_incerta_desde: '2026-10-16' },
      { id: 'b', lote_atual: 'L1', localizacao_incerta_desde: '2026-10-16' },
      { id: 'c', lote_atual: 'L2', localizacao_incerta_desde: '2026-10-15' },
    ])
    expect(plano.grupos).toEqual([
      { loteId: 'L1', ids: ['a', 'b'] },
      { loteId: 'L2', ids: ['c'] },
    ])
    expect(plano.semLote).toBe(0)
    expect(plano.jaConfirmados).toBe(0)
  })

  it('separa quem já está confirmado e quem não tem lote', () => {
    const plano = planejarConfirmacao([
      { id: 'a', lote_atual: 'L1', localizacao_incerta_desde: null },
      { id: 'b', lote_atual: null, localizacao_incerta_desde: '2026-10-16' },
      { id: 'c', lote_atual: 'L1', localizacao_incerta_desde: '2026-10-16' },
    ])
    expect(plano).toEqual({ grupos: [{ loteId: 'L1', ids: ['c'] }], semLote: 1, jaConfirmados: 1 })
  })

  it('lista vazia não gera grupos', () => {
    expect(planejarConfirmacao([]).grupos).toEqual([])
  })
})
