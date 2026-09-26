import { describe, expect, it } from 'vitest'
import { parseValorBR } from './parseValorBR'

describe('parseValorBR', () => {
  it('aceita milhar com ponto e decimal com vírgula', () => {
    expect(parseValorBR('152.340,50')).toBe(152340.5)
    expect(parseValorBR('R$ 1.234.567,89')).toBe(1234567.89)
  })

  it('trata ponto sem vírgula no padrão de milhar como milhar', () => {
    // Antes: replace(',', '.') transformava "1.500" em 1.5
    expect(parseValorBR('1.500')).toBe(1500)
    expect(parseValorBR('12.345.678')).toBe(12345678)
  })

  it('aceita decimal simples', () => {
    expect(parseValorBR('980,5')).toBe(980.5)
    expect(parseValorBR('1500.5')).toBe(1500.5)
    expect(parseValorBR('2000')).toBe(2000)
  })

  it('rejeita entradas inválidas', () => {
    expect(parseValorBR('')).toBeNaN()
    expect(parseValorBR('abc')).toBeNaN()
    expect(parseValorBR('1,2,3')).toBeNaN()
  })
})
