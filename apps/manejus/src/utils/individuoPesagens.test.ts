import { describe, expect, it } from 'vitest'
import { calcularEvolucaoPeso, calcularIdade, escalaPeso, gmdPeriodo } from './individuoPesagens'

describe('calcularEvolucaoPeso', () => {
  it('ordena por data e calcula ganho e GMD entre pesagens', () => {
    const evolucao = calcularEvolucaoPeso([
      { id: 'b', data: '2026-02-01T12:00:00Z', peso_kg: 330 },
      { id: 'a', data: '2026-01-01T12:00:00Z', peso_kg: '300' },
    ])
    expect(evolucao.map((e) => e.id)).toEqual(['a', 'b'])
    expect(evolucao[0]).toMatchObject({ dias: null, ganhoKg: null, gmdKgDia: null })
    expect(evolucao[1].dias).toBe(31)
    expect(evolucao[1].ganhoKg).toBe(30)
    expect(evolucao[1].gmdKgDia).toBeCloseTo(30 / 31, 5)
  })

  it('descarta pesos inválidos e aceita ganho negativo', () => {
    const evolucao = calcularEvolucaoPeso([
      { id: 'a', data: '2026-01-01T12:00:00Z', peso_kg: 300 },
      { id: 'x', data: '2026-01-10T12:00:00Z', peso_kg: null },
      { id: 'y', data: '2026-01-11T12:00:00Z', peso_kg: 0 },
      { id: 'b', data: '2026-01-11T12:00:00Z', peso_kg: 290 },
    ])
    expect(evolucao.map((e) => e.id)).toEqual(['a', 'b'])
    expect(evolucao[1].ganhoKg).toBe(-10)
    expect(evolucao[1].gmdKgDia).toBe(-1)
  })

  it('GMD fica nulo para pesagens no mesmo dia', () => {
    const evolucao = calcularEvolucaoPeso([
      { id: 'a', data: '2026-01-01T10:00:00Z', peso_kg: 300 },
      { id: 'b', data: '2026-01-01T15:00:00Z', peso_kg: 301 },
    ])
    expect(evolucao[1].dias).toBe(0)
    expect(evolucao[1].gmdKgDia).toBeNull()
  })

  it('lista vazia devolve lista vazia', () => {
    expect(calcularEvolucaoPeso([])).toEqual([])
  })
})

describe('gmdPeriodo', () => {
  it('calcula do primeiro ao último ponto', () => {
    const evolucao = calcularEvolucaoPeso([
      { id: 'a', data: '2026-01-01T12:00:00Z', peso_kg: 300 },
      { id: 'b', data: '2026-01-11T12:00:00Z', peso_kg: 310 },
      { id: 'c', data: '2026-01-21T12:00:00Z', peso_kg: 340 },
    ])
    expect(gmdPeriodo(evolucao)).toBe(2)
  })

  it('é nulo com menos de duas pesagens', () => {
    expect(gmdPeriodo(calcularEvolucaoPeso([{ id: 'a', data: '2026-01-01T12:00:00Z', peso_kg: 300 }]))).toBeNull()
  })
})

describe('calcularIdade', () => {
  const hoje = new Date('2026-10-08T12:00:00')

  it('calcula dias e meses completos', () => {
    expect(calcularIdade('2026-07-08', hoje)).toEqual({ dias: 92, meses: 3 })
    expect(calcularIdade('2026-07-09', hoje)?.meses).toBe(2)
  })

  it('retorna nulo para ausente, inválida ou futura', () => {
    expect(calcularIdade(null, hoje)).toBeNull()
    expect(calcularIdade('lixo', hoje)).toBeNull()
    expect(calcularIdade('2027-01-01', hoje)).toBeNull()
  })
})

describe('escalaPeso', () => {
  it('gera marcas com passo constante e redondo que cobrem o intervalo', () => {
    const e = escalaPeso(290, 510)
    const passos = e.marcas.slice(1).map((m, i) => m - e.marcas[i])
    expect(new Set(passos).size).toBe(1)
    expect([10, 20, 50, 100]).toContain(passos[0])
    expect(e.marcas.every((m) => m % passos[0] === 0)).toBe(true)
    expect(e.min).toBeLessThanOrEqual(290)
    expect(e.max).toBeGreaterThanOrEqual(510)
    expect(e.marcas.length).toBeGreaterThanOrEqual(3)
    expect(e.marcas.length).toBeLessThanOrEqual(8)
  })

  it('funciona com um único peso e nunca desce de zero', () => {
    const e = escalaPeso(30, 30)
    expect(e.min).toBeGreaterThanOrEqual(0)
    expect(e.marcas.length).toBeGreaterThan(1)
    expect(e.max).toBeGreaterThanOrEqual(30)
  })
})
