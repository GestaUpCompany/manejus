import { describe, expect, it } from 'vitest'
import { contarCabecasPorDieta, type CategoriaCabecas, type PlanoVigenteCabecas } from './cabecasPorDieta'

const F = 'form-1'
const OUTRA = 'form-2'

const cat = (id: string, lote: string, categoria: string, quant: number, formulacao_id: string | null = null): CategoriaCabecas => ({
  id, lote_id: lote, lote_nome: `Lote ${lote}`, categoria, quant_atual: quant, formulacao_id,
})
const planoLote = (lote_id: string, formulacao_id: string): PlanoVigenteCabecas => ({ lote_id, lote_categoria_id: null, formulacao_id })
const planoCat = (lote_categoria_id: string, formulacao_id: string): PlanoVigenteCabecas => ({ lote_id: null, lote_categoria_id, formulacao_id })

describe('contarCabecasPorDieta', () => {
  it('plano do lote vale para todas as categorias do lote', () => {
    const r = contarCabecasPorDieta(F, false, [planoLote('A', F)], [cat('1', 'A', 'garrote', 50), cat('2', 'A', 'novilha', 30)])
    expect(r.total).toBe(80)
    expect(r.lotes).toEqual([{ lote_id: 'A', nome: 'Lote A', cabecas: 80, categorias: ['garrote', 'novilha'] }])
  })

  it('plano da categoria tem precedência sobre o plano do lote', () => {
    const planos = [planoLote('A', F), planoCat('2', OUTRA)]
    const cats = [cat('1', 'A', 'garrote', 50), cat('2', 'A', 'novilha', 30)]
    expect(contarCabecasPorDieta(F, false, planos, cats).total).toBe(50)
    expect(contarCabecasPorDieta(OUTRA, false, planos, cats).total).toBe(30)
  })

  it('bezerro ao pé não herda o plano do lote', () => {
    const r = contarCabecasPorDieta(F, false, [planoLote('A', F)], [cat('1', 'A', 'vaca', 20), cat('2', 'A', 'Bezerro ao Pé', 15)])
    expect(r.total).toBe(20)
  })

  it('creep conta só categorias ao pé vinculadas à formulação', () => {
    const cats = [cat('1', 'A', 'vaca', 20, F), cat('2', 'A', 'bezerra ao pé', 12, F), cat('3', 'B', 'bezerro ao pé', 8, OUTRA)]
    const r = contarCabecasPorDieta(F, true, [], cats)
    expect(r.total).toBe(12)
    expect(r.lotes).toHaveLength(1)
  })

  it('ignora quantidade zerada e formulação sem uso', () => {
    const r = contarCabecasPorDieta(F, false, [planoLote('A', F)], [cat('1', 'A', 'garrote', 0)])
    expect(r).toEqual({ total: 0, lotes: [] })
    expect(contarCabecasPorDieta(F, false, [], [cat('1', 'A', 'garrote', 10)]).total).toBe(0)
  })

  it('ordena lotes por cabeças desc', () => {
    const r = contarCabecasPorDieta(F, false, [planoLote('A', F), planoLote('B', F)], [cat('1', 'A', 'garrote', 10), cat('2', 'B', 'garrote', 40)])
    expect(r.lotes.map((l) => l.lote_id)).toEqual(['B', 'A'])
    expect(r.total).toBe(50)
  })
})
