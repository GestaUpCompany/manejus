import { describe, expect, it } from 'vitest'
import { calcularLayoutFolhaTrato, LINHA_MAX_MM, LINHA_MIN_MM, orientacaoFolhaTrato } from './folhaTratoLayout'

describe('folhaTratoLayout', () => {
  it('usa retrato até 2 tratos e paisagem acima disso', () => {
    expect(orientacaoFolhaTrato(1)).toBe('portrait')
    expect(orientacaoFolhaTrato(2)).toBe('portrait')
    expect(orientacaoFolhaTrato(3)).toBe('landscape')
    expect(orientacaoFolhaTrato(4)).toBe('landscape')
  })

  it('poucos currais ficam em uma página com a linha na altura máxima', () => {
    const layout = calcularLayoutFolhaTrato(8, 2)
    expect(layout.currais).toEqual([8])
    expect(layout.alturaLinhaMm).toBe(LINHA_MAX_MM)
  })

  it('cerca de 25 currais em retrato cabem em uma página com a linha compactada', () => {
    const layout = calcularLayoutFolhaTrato(25, 2)
    expect(layout.currais).toEqual([25])
    expect(layout.alturaLinhaMm).toBeLessThan(LINHA_MAX_MM)
    expect(layout.alturaLinhaMm).toBeGreaterThanOrEqual(LINHA_MIN_MM)
  })

  it('mais currais que o limite dividem em páginas equilibradas sem ir abaixo do mínimo', () => {
    const layout = calcularLayoutFolhaTrato(45, 2)
    expect(layout.currais).toEqual([23, 22])
    expect(layout.alturaLinhaMm).toBeGreaterThanOrEqual(LINHA_MIN_MM)
  })

  it('com 4 tratos usa paisagem e pagina antes', () => {
    const layout = calcularLayoutFolhaTrato(25, 4)
    expect(layout.orientacao).toBe('landscape')
    expect(layout.currais.length).toBeGreaterThan(1)
    expect(layout.currais.reduce((a, b) => a + b, 0)).toBe(25)
  })

  it('sem currais não gera páginas', () => {
    expect(calcularLayoutFolhaTrato(0, 2).currais).toEqual([])
  })
})
