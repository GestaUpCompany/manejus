import { describe, expect, it } from 'vitest'
import {
  calcularLayoutFolhaTrato,
  escalaColunasInfo,
  CURRAIS_POR_FOLHA_ALVO,
  LINHA_MAX_MM,
  LINHA_MIN_MM,
} from './folhaTratoLayout'

describe('folhaTratoLayout', () => {
  it('poucos currais ficam em uma página com a linha na altura máxima', () => {
    const layout = calcularLayoutFolhaTrato(8, 2)
    expect(layout.currais).toEqual([8])
    expect(layout.alturaLinhaMm).toBe(LINHA_MAX_MM)
  })

  it('cerca de 25 currais cabem em uma página com a linha compactada', () => {
    const layout = calcularLayoutFolhaTrato(25, 2)
    expect(layout.currais).toEqual([25])
    expect(layout.alturaLinhaMm).toBeLessThan(LINHA_MAX_MM)
    expect(layout.alturaLinhaMm).toBeGreaterThanOrEqual(LINHA_MIN_MM)
  })

  it('até 50 currais cabem em uma única página, com qualquer número de tratos usual', () => {
    for (const tratos of [1, 2, 3, 4]) {
      const layout = calcularLayoutFolhaTrato(CURRAIS_POR_FOLHA_ALVO, tratos)
      expect(layout.currais).toEqual([CURRAIS_POR_FOLHA_ALVO])
      expect(layout.alturaLinhaMm).toBeGreaterThanOrEqual(LINHA_MIN_MM)
    }
  })

  it('mais currais que o limite dividem em páginas equilibradas sem ir abaixo do mínimo', () => {
    const layout = calcularLayoutFolhaTrato(80, 3)
    expect(layout.currais).toEqual([40, 40])
    expect(layout.alturaLinhaMm).toBeGreaterThanOrEqual(LINHA_MIN_MM)
    expect(layout.currais.reduce((a, b) => a + b, 0)).toBe(80)
  })

  it('a fonte diminui junto com a altura da linha', () => {
    expect(calcularLayoutFolhaTrato(8, 2).fonteTabelaPt).toBeGreaterThan(calcularLayoutFolhaTrato(50, 2).fonteTabelaPt)
  })

  it('colunas informativas só encolhem quando há muitos tratos', () => {
    expect(escalaColunasInfo(3)).toBe(1)
    expect(escalaColunasInfo(4)).toBeGreaterThan(0.9)
    expect(escalaColunasInfo(6)).toBeLessThan(escalaColunasInfo(4))
    expect(escalaColunasInfo(10)).toBeGreaterThanOrEqual(0.5)
  })

  it('sem currais não gera páginas', () => {
    expect(calcularLayoutFolhaTrato(0, 2).currais).toEqual([])
  })
})
