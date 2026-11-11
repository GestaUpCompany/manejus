import { describe, expect, it } from 'vitest'
import { calcularResumoMaternidade, criaMorta, rotuloMes, type RegistroMaternidade } from './agregacao'

function reg(parcial: Partial<RegistroMaternidade> & { id: string }): RegistroMaternidade {
  return {
    data: '2026-10-05',
    pasto: null,
    lote: null,
    sexo: 'Macho',
    raca: 'Nelore',
    peso_cria_kg: null,
    tipo_parto: ['Normal'],
    categoria_mae: 'Multípara',
    escore_matriz: null,
    docilidade_matriz: null,
    tratamento: null,
    medicamentos: [],
    mae: null,
    cria: null,
    parto_vinculo_id: null,
    mae_adotiva: null,
    observacao: null,
    responsavel: null,
    ...parcial,
  }
}

describe('calcularResumoMaternidade', () => {
  it('período vazio devolve zeros e nulos sem quebrar', () => {
    const r = calcularResumoMaternidade([])
    expect(r.partos).toBe(0)
    expect(r.crias).toBe(0)
    expect(r.peso_medio_kg).toBeNull()
    expect(r.taxa_perda).toBeNull()
    expect(r.por_mes).toEqual([])
    expect(r.matrizes).toEqual([])
  })

  it('gêmeos com o mesmo parto_vinculo_id contam como 1 parto e 2 crias', () => {
    const r = calcularResumoMaternidade([
      reg({ id: 'a', parto_vinculo_id: 'p1', tipo_parto: ['Normal', 'Gêmeos'], mae: 'M1' }),
      reg({ id: 'b', parto_vinculo_id: 'p1', tipo_parto: ['Normal', 'Gêmeos'], mae: 'M1', sexo: 'Fêmea' }),
      reg({ id: 'c', mae: 'M2' }),
    ])
    expect(r.partos).toBe(2)
    expect(r.crias).toBe(3)
    expect(r.partos_gemeos).toBe(1)
    expect(r.matrizes_distintas).toBe(2)
  })

  it('aborto e natimorto não contam como cria viva nem no peso médio', () => {
    const registros = [
      reg({ id: 'a', peso_cria_kg: 30 }),
      reg({ id: 'b', peso_cria_kg: 40 }),
      reg({ id: 'c', tipo_parto: ['Natimorto'], peso_cria_kg: 10 }),
      reg({ id: 'd', tipo_parto: ['Aborto'], sexo: null }),
    ]
    expect(criaMorta(registros[2])).toBe(true)
    const r = calcularResumoMaternidade(registros)
    expect(r.crias).toBe(4)
    expect(r.crias_vivas).toBe(2)
    expect(r.crias_mortas).toBe(2)
    expect(r.taxa_perda).toBe(0.5)
    expect(r.peso_medio_kg).toBe(35)
    expect(r.pesadas).toBe(2)
    expect(r.partos_com_intercorrencia).toBe(2)
  })

  it('agrupa nascimentos por mês e ordena do mais antigo ao mais novo', () => {
    const r = calcularResumoMaternidade([
      reg({ id: 'a', data: '2026-10-20' }),
      reg({ id: 'b', data: '2026-09-02' }),
      reg({ id: 'c', data: '2026-10-01' }),
    ])
    expect(r.por_mes).toEqual([
      { mes: '2026-09', partos: 1, crias: 1 },
      { mes: '2026-10', partos: 2, crias: 2 },
    ])
  })

  it('escore aceita vírgula e ignora vazios; tratamentos separam por vírgula', () => {
    const r = calcularResumoMaternidade([
      reg({ id: 'a', escore_matriz: '3,5', tratamento: 'Cura Umbigo, Vermífugo' }),
      reg({ id: 'b', escore_matriz: '2.5', tratamento: 'Cura Umbigo' }),
      reg({ id: 'c', escore_matriz: null }),
    ])
    expect(r.escore_medio).toBe(3)
    expect(r.tratamentos[0]).toEqual({ label: 'Cura Umbigo', valor: 2 })
    expect(r.partos_medicados).toBe(2)
  })

  it('ranking de matrizes prioriza intercorrências e conta medicamentos', () => {
    const r = calcularResumoMaternidade([
      reg({ id: 'a', mae: 'M1' }),
      reg({ id: 'b', mae: 'M2', tipo_parto: ['Cesárea'], medicamentos: [{ nomeComercial: 'Penicilina' }] }),
    ])
    expect(r.matrizes[0].mae).toBe('M2')
    expect(r.matrizes[0].intercorrencias).toBe(1)
    expect(r.matrizes[0].medicamentos).toBe(1)
    expect(r.medicamentos).toEqual([{ label: 'Penicilina', valor: 1 }])
  })

  it('campos vazios caem em "Não informado"', () => {
    const r = calcularResumoMaternidade([reg({ id: 'a', pasto: null })])
    expect(r.por_pasto).toEqual([{ label: 'Não informado', valor: 1 }])
  })
})

describe('rotuloMes', () => {
  it('formata YYYY-MM', () => {
    expect(rotuloMes('2026-10')).toBe('out/26')
  })
})
