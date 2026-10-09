import { describe, expect, it } from 'vitest'
import { cabecasNoDia, efeitoMovimentacao, type MovimentacaoSaldo } from './saldoCabecasNaData'

const LOTE = 'lote-a'
const OUTRO = 'lote-b'

function mov(parcial: Partial<MovimentacaoSaldo>): MovimentacaoSaldo {
  return {
    data: '2026-10-06T20:20:00.000Z',
    lote_origem_id: LOTE,
    lote_destino_id: null,
    categoria: 'garrote',
    numero_cabecas: 10,
    motivo_movimentacao: 'Saída',
    tipo_saida: null,
    tipo_entrada: null,
    subtipo: null,
    ...parcial,
  }
}

const dia6 = { inicioDia: '2026-10-06T04:00:00.000Z', fimDia: '2026-10-07T04:00:00.000Z' }
const dia7 = { inicioDia: '2026-10-07T04:00:00.000Z', fimDia: '2026-10-08T04:00:00.000Z' }
const categoria = (quant: number) => [{ lote_id: LOTE, categoria: 'garrote', quant_atual: quant, peso_vivo_atual_kg_cab: 300 }]

describe('efeitoMovimentacao', () => {
  it('classifica como o calculate_quant_atual', () => {
    expect(efeitoMovimentacao(mov({ motivo_movimentacao: 'Entrada' }), LOTE)).toBe(10)
    expect(efeitoMovimentacao(mov({ motivo_movimentacao: 'Saída' }), LOTE)).toBe(-10)
    expect(efeitoMovimentacao(mov({ motivo_movimentacao: 'Doação' }), LOTE)).toBe(-10)
    expect(efeitoMovimentacao(mov({ motivo_movimentacao: 'Saída', tipo_saida: 'Transferência', lote_destino_id: OUTRO }), LOTE)).toBe(-10)
    expect(efeitoMovimentacao(mov({ motivo_movimentacao: 'Saída', tipo_saida: 'Transferência', lote_destino_id: OUTRO }), OUTRO)).toBe(10)
    expect(efeitoMovimentacao(mov({ motivo_movimentacao: 'Entrevero', lote_destino_id: OUTRO }), OUTRO)).toBe(10)
    expect(efeitoMovimentacao(mov({ motivo_movimentacao: 'Entrevero' }), LOTE)).toBe(-10)
  })

  it('ignora entrada de Novo Lote no destino', () => {
    expect(efeitoMovimentacao(mov({ lote_destino_id: OUTRO, tipo_entrada: 'Transferência', subtipo: 'Novo Lote' }), OUTRO)).toBe(0)
  })
})

describe('cabecasNoDia', () => {
  const saida219 = mov({ numero_cabecas: 219 })

  it('conta lote que saiu durante o dia da folha (ainda foi tratado de manhã)', () => {
    const r = cabecasNoDia({ loteId: LOTE, categorias: categoria(0), movimentacoes: [saida219], mortes: [], ...dia6 })
    expect(r.quantidade).toBe(219)
    expect(r.pesoTotal).toBe(219 * 300)
  })

  it('não conta lote já esvaziado no dia seguinte', () => {
    const r = cabecasNoDia({ loteId: LOTE, categorias: categoria(0), movimentacoes: [saida219], mortes: [], ...dia7 })
    expect(r.quantidade).toBe(0)
  })

  it('desfaz saída posterior em dia passado anterior à saída', () => {
    const dia5 = { inicioDia: '2026-10-05T04:00:00.000Z', fimDia: '2026-10-06T04:00:00.000Z' }
    const r = cabecasNoDia({ loteId: LOTE, categorias: categoria(0), movimentacoes: [saida219], mortes: [], ...dia5 })
    expect(r.quantidade).toBe(219)
  })

  it('sem eventos devolve o quant_atual', () => {
    const r = cabecasNoDia({ loteId: LOTE, categorias: categoria(134), movimentacoes: [], mortes: [], ...dia6 })
    expect(r.quantidade).toBe(134)
  })

  it('desfaz mortes posteriores e conta entradas que chegaram no dia', () => {
    const r = cabecasNoDia({
      loteId: LOTE,
      categorias: categoria(95),
      movimentacoes: [mov({ motivo_movimentacao: 'Entrada', numero_cabecas: 5 })],
      mortes: [{ data: '2026-10-08T12:00:00.000Z', lote_id: LOTE, categoria: 'Garrote' }],
      ...dia6,
    })
    // início do dia 6: 95 + 1 (morte posterior) - 5 = 91; fim: 96 - 5 + 5... máximo entre os dois
    expect(r.quantidade).toBe(96)
  })

  it('conta categoria encerrada por recategorização no mesmo dia (caso Canastra 1)', () => {
    const categorias = [
      { lote_id: LOTE, categoria: 'boi magro', quant_atual: 0, ativo: false, created_at: '2026-08-25T20:55:00.000Z', data_fim: '2026-10-06T20:01:00.000Z' },
      { lote_id: LOTE, categoria: 'novilha', quant_atual: null, ativo: true, created_at: '2026-10-06T20:01:00.000Z', data_fim: null },
    ]
    const movimentacoes = [
      mov({ categoria: 'boi magro', numero_cabecas: 3, data: '2026-10-06T19:28:00.000Z' }),
      mov({ categoria: 'boi magro', numero_cabecas: 120, data: '2026-10-06T19:58:00.000Z' }),
    ]
    const r = cabecasNoDia({ loteId: LOTE, categorias, movimentacoes, mortes: [], ...dia6 })
    expect(r.quantidade).toBe(123)
    expect(r.categorias).toEqual(['boi magro'])
    expect(cabecasNoDia({ loteId: LOTE, categorias, movimentacoes, mortes: [], ...dia7 }).quantidade).toBe(0)
  })

  it('não conta duas vezes o gado que mudou de categoria na recategorização', () => {
    const categorias = [
      { lote_id: LOTE, categoria: 'garrote', quant_atual: 100, ativo: false, created_at: '2026-08-01T12:00:00.000Z', data_fim: '2026-10-06T15:00:00.000Z' },
      { lote_id: LOTE, categoria: 'boi magro', quant_atual: 100, ativo: true, created_at: '2026-10-06T15:00:00.000Z', data_fim: null },
    ]
    const r = cabecasNoDia({ loteId: LOTE, categorias, movimentacoes: [], mortes: [], ...dia6 })
    expect(r.quantidade).toBe(100)
  })

  it('não mistura categorias nem lotes', () => {
    const r = cabecasNoDia({
      loteId: LOTE,
      categorias: categoria(10),
      movimentacoes: [mov({ categoria: 'novilha', numero_cabecas: 50 }), mov({ lote_origem_id: OUTRO, numero_cabecas: 50 })],
      mortes: [],
      ...dia6,
    })
    expect(r.quantidade).toBe(10)
  })
})
