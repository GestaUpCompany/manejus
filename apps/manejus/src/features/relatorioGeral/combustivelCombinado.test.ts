import { describe, expect, it } from 'vitest'

// O combinado de combustível (PDF individual e Infográfico) tem uma definição só: api/pdf/_shared/combustivelCombinado.js.
// Estes testes garantem que o Infográfico, que renderiza pelo registro, segue a mesma regra do individual.
const REGISTRY_PATH = '../../../api/pdf/_shared/reportRegistry.js'
const COMBINADO_PATH = '../../../api/pdf/_shared/combustivelCombinado.js'

const abastecimento = {
  titulo: 'Relatório de Abastecimento',
  fazendaNome: 'Fazenda Teste',
  logoGestao: '',
  logoFazenda: '',
  filtros: { dataInicio: '2026-11-01', dataFim: '2026-11-09', maquinas: [], combustiveis: [], operacoes: [] },
  porMaquina: [{ label: 'Trator A', valor: 300 }],
  porCombustivel: [{ label: 'Diesel S-10', valor: 300 }],
  porOperacao: [{ label: 'Plantio', valor: 300 }],
  totalLitros: 300,
  totalRegistros: 2,
  detalhesPorMaquina: [{
    maquina: 'Trator A', totalLitros: 300, numAbastecimentos: 2, mediaLitros: 150, maiorAbastecimento: 200,
    primeiraData: '2026-11-02', ultimaData: '2026-11-05', combustiveis: ['Diesel S-10'], operadores: ['Operador Um'], placas: [],
    horimetroInicial: null, horimetroFinal: null, unidadeTrabalho: null, totalTrabalho: null, consumoMedio: null,
  }],
  tanques: [{ nome: 'Tanque Diesel', combustivel: 'Diesel S-10', saldo_final_l: 1000 }],
  geradoEm: '2026-11-09T12:00:00Z',
}

const estoque = {
  fazendaNome: 'Fazenda Teste',
  logoGestao: '',
  logoFazenda: '',
  data_inicio: '2026-11-01',
  data_fim: '2026-11-09',
  tanques: [{
    nome: 'Tanque Diesel', combustivel: 'Diesel S-10', saldo_inicial_l: 1500, entradas_l: 0, baixas_l: 300, ajustes_l: 0,
    saldo_final_l: 1200, pct_capacidade: 60, custo_medio_l: 7.1, valor_estoque: 8520, abaixo_limite: false, negativo: false,
  }],
  movimentacoes: [{
    data: '2026-11-04', tanque: 'Tanque Diesel', tipo: 'baixa', origem: 'abastecimento', maquina: 'Trator A',
    variacao_l: -300, preco_por_litro: 7.1, valor: 2130, saldo_apos_l: 1200,
  }],
}

describe('combustível combinado: Infográfico segue o PDF individual', () => {
  it('abastecimento do Infográfico não traz detalhamento por máquina, operacional nem tabela de tanques', async () => {
    const { REPORT_REGISTRY } = await import(REGISTRY_PATH)
    const html: string = await REPORT_REGISTRY.abastecimento.render(abastecimento)
    expect(html).toContain('Litros por Máquina/Veículo')
    expect(html).not.toContain('Detalhamento por Máquina')
    expect(html).not.toContain('Detalhamento Operacional')
    expect(html).not.toContain('Saldo por tanque')
  })

  it('estoque do Infográfico não traz o extrato de movimentações', async () => {
    const { REPORT_REGISTRY } = await import(REGISTRY_PATH)
    const html: string = await REPORT_REGISTRY.estoque_combustivel.render(estoque)
    expect(html).toContain('Posição por tanque')
    expect(html).not.toContain('Extrato de movimentações')
  })

  it('ordena estoque antes do abastecimento sem mexer nas demais seções', async () => {
    const { ordenarSecoesCombustivel } = await import(COMBINADO_PATH)
    const tipos = (lista: Array<{ tipo: string }>) => lista.map((r) => r.tipo)
    expect(tipos(ordenarSecoesCombustivel([{ tipo: 'abastecimento' }, { tipo: 'estoque_combustivel' }, { tipo: 'consumo' }]))).toEqual(['estoque_combustivel', 'abastecimento', 'consumo'])
    expect(tipos(ordenarSecoesCombustivel([{ tipo: 'consumo' }, { tipo: 'estoque_combustivel' }, { tipo: 'abastecimento' }]))).toEqual(['consumo', 'estoque_combustivel', 'abastecimento'])
    const jaOrdenado = [{ tipo: 'estoque_combustivel' }, { tipo: 'abastecimento' }]
    expect(ordenarSecoesCombustivel(jaOrdenado)).toBe(jaOrdenado)
    const semAbastecimento = [{ tipo: 'consumo' }, { tipo: 'estoque_combustivel' }]
    expect(ordenarSecoesCombustivel(semAbastecimento)).toBe(semAbastecimento)
  })
})
