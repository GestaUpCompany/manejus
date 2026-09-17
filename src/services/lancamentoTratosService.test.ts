import { describe, expect, it } from 'vitest'
import { calcularTratosDoDia } from './lancamentoTratosService'

const percentuais = [
  { ordem_trato: 1, percentual: 30, horario_sugerido: '07:00' },
  { ordem_trato: 2, percentual: 20, horario_sugerido: '10:00' },
  { ordem_trato: 3, percentual: 20, horario_sugerido: '14:00' },
  { ordem_trato: 4, percentual: 30, horario_sugerido: '17:00' },
]

describe('calcularTratosDoDia', () => {
  it('distribui o primeiro dia pelo kg da programação', () => {
    const resultado = calcularTratosDoDia({
      quantidadeTratos: 4,
      percentuais,
      kgMnDia: 100,
      totalRealDiaAnterior: null,
      leituraDia: null,
      ajusteLeituraPct: null,
      registrosDoDia: [],
      programacaoId: 'programacao',
    })

    expect(resultado.kgBaseDia).toBe(100)
    expect(resultado.tratos.map((trato) => trato.kgPlanejado)).toEqual([30, 20, 20, 30])
  })

  it('mantém a distribuição percentual no dia seguinte enquanto nenhum trato foi realizado', () => {
    const resultado = calcularTratosDoDia({
      quantidadeTratos: 4,
      percentuais,
      kgMnDia: 100,
      totalRealDiaAnterior: 100,
      leituraDia: 2,
      ajusteLeituraPct: -5,
      registrosDoDia: [],
      programacaoId: 'programacao',
    })

    expect(resultado.kgBaseDia).toBe(95)
    expect(resultado.tratos.map((trato) => trato.kgPlanejado)).toEqual([28.5, 19, 19, 28.5])
  })

  it('aplica ajuste do cocho e fecha o último trato com o saldo', () => {
    const resultado = calcularTratosDoDia({
      quantidadeTratos: 4,
      percentuais,
      kgMnDia: 100,
      totalRealDiaAnterior: 100,
      leituraDia: 2,
      ajusteLeituraPct: -5,
      registrosDoDia: [
        { id: '1', curral_id: 'curral', lote_id: 'lote', data: '2026-09-17T07:00:00Z', ordem_trato: 1, kg_planejado: 28.5, kg_ofertado_real: 30 },
        { id: '2', curral_id: 'curral', lote_id: 'lote', data: '2026-09-17T10:00:00Z', ordem_trato: 2, kg_planejado: 19, kg_ofertado_real: 18 },
      ],
      programacaoId: 'programacao',
    })

    expect(resultado.kgBaseDia).toBe(95)
    expect(resultado.tratos[0].kgPlanejado).toBe(28.5)
    expect(resultado.tratos[1].kgPlanejado).toBe(19)
    expect(resultado.tratos[3].kgPlanejado).toBe(47)
    expect(resultado.tratos[0].kgReal).toBe(30)
  })
})
