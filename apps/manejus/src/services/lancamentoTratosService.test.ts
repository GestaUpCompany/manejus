import { describe, expect, it } from 'vitest'
import { calcularTratosDoDia, limparReaisLancamento, validarLancamentosTratos, type LancamentoTratoLinha } from './lancamentoTratosService'

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

  it('limpa os valores reais sem perder os identificadores dos registros', () => {
    const linhas = [{
      curralId: 'curral',
      curralNome: 'Curral 1',
      linhaNome: null,
      loteId: 'lote',
      loteNome: 'Lote 1',
      dietaNome: null,
      quantidadeCabecas: 10,
      pesoVivoKg: 400,
      categorias: 'Boi Gordo',
      tratoAnteriorKg: null,
      leituraDia: 1,
      ajusteLeituraPct: 0,
      kgBaseDia: 100,
      consumoKgCabDia: 10,
      quantidadeTratos: 1,
      tratos: [{ ordemTrato: 1, percentual: 100, horarioSugerido: null, kgPlanejado: 100, kgReal: 98, registroId: 'registro' }],
    }]

    const limpas = limparReaisLancamento(linhas)
    expect(limpas[0].tratos[0].kgReal).toBeNull()
    expect(limpas[0].tratos[0].registroId).toBe('registro')
  })
})

function linhaBase(overrides: Partial<LancamentoTratoLinha> = {}): LancamentoTratoLinha {
  return {
    curralId: 'curral',
    curralNome: 'Curral 1',
    linhaNome: null,
    loteId: 'lote',
    loteNome: 'Lote 1',
    dietaNome: 'Dieta',
    quantidadeCabecas: 10,
    pesoVivoKg: 400,
    categorias: 'Boi Gordo',
    tratoAnteriorKg: null,
    leituraDia: null,
    ajusteLeituraPct: null,
    kgBaseDia: 100,
    consumoKgCabDia: 10,
    quantidadeTratos: 1,
    tratos: [{ ordemTrato: 1, percentual: 100, horarioSugerido: null, kgPlanejado: 100, kgReal: 50, registroId: null }],
    ...overrides,
  }
}

describe('validarLancamentosTratos', () => {
  it('rejeita valores reais negativos', () => {
    const linhas = [linhaBase({
      tratos: [{ ordemTrato: 1, percentual: 100, horarioSugerido: null, kgPlanejado: 100, kgReal: -5, registroId: null }],
    })]
    expect(validarLancamentosTratos(linhas)).toHaveLength(1)
    expect(validarLancamentosTratos(linhas)[0]).toContain('negativo')
  })

  it('rejeita linha sem lote com valor preenchido', () => {
    const linhas = [linhaBase({ loteId: null, loteNome: 'Sem lote' })]
    expect(validarLancamentosTratos(linhas)[0]).toContain('sem lote')
  })

  it('ignora linhas sem valor preenchido e aceita linhas válidas', () => {
    const semPreencher = linhaBase({
      loteId: null,
      tratos: [{ ordemTrato: 1, percentual: 100, horarioSugerido: null, kgPlanejado: 100, kgReal: null, registroId: null }],
    })
    expect(validarLancamentosTratos([semPreencher])).toHaveLength(0)
    expect(validarLancamentosTratos([linhaBase()])).toHaveLength(0)
  })
})
