import { describe, expect, it } from 'vitest'
import { calcularEvolucaoPeso, calcularIdade, escalaPeso, gmdPeriodo, pesoAjustado205 } from './individuoPesagens'

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

describe('pesoAjustado205', () => {
  const pesagem = (data: string, pesoKg: number) => ({ id: data, data, pesoKg, dias: null, ganhoKg: null, gmdKgDia: null })

  it('estima o peso aos 205 dias pela pesagem na janela', () => {
    // nasceu em 01/01 com 30 kg; aos 200 dias pesou 230 kg: GMD (230-30)/200 = 1,0 kg/dia, P205 = 30 + 205 = 235
    const r = pesoAjustado205(30, '2026-01-01', [pesagem('2026-07-20T12:00:00Z', 230)])
    expect(r?.pesagem.idadeDias).toBe(200)
    expect(r?.gmdNascimentoKgDia).toBeCloseTo(1, 5)
    expect(r?.pesoKg).toBeCloseTo(235, 5)
  })

  it('escolhe a pesagem mais perto dos 205 dias', () => {
    const r = pesoAjustado205(30, '2026-01-01', [
      pesagem('2026-05-02T12:00:00Z', 150), // 121 dias
      pesagem('2026-07-25T12:00:00Z', 240), // 205 dias
      pesagem('2026-10-20T12:00:00Z', 330), // 292 dias
    ])
    expect(r?.pesagem.idadeDias).toBe(205)
  })

  it('ignora pesagem fora da janela de 120 a 300 dias', () => {
    expect(pesoAjustado205(30, '2026-01-01', [pesagem('2026-03-01T12:00:00Z', 90)])).toBeNull()
    expect(pesoAjustado205(30, '2026-01-01', [pesagem('2026-12-01T12:00:00Z', 400)])).toBeNull()
  })

  it('devolve null sem peso ou data de nascimento, ou com peso da pesagem não maior que o do nascimento', () => {
    expect(pesoAjustado205(null, '2026-01-01', [pesagem('2026-07-20T12:00:00Z', 230)])).toBeNull()
    expect(pesoAjustado205(30, null, [pesagem('2026-07-20T12:00:00Z', 230)])).toBeNull()
    expect(pesoAjustado205(30, '2026-01-01', [pesagem('2026-07-20T12:00:00Z', 30)])).toBeNull()
    expect(pesoAjustado205(30, '2026-01-01', [])).toBeNull()
  })
})
