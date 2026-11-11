import { describe, expect, it } from 'vitest'
import { calcularResumoFarmacia, extratoFarmacia, type DadosRelatorioFarmacia } from './agregacao'
import type { MovimentoFarmacia } from '../estoqueFarmacia/logica'

let seq = 0
const mov = (p: Partial<MovimentoFarmacia>): MovimentoFarmacia => ({
  id: `m${String(++seq).padStart(3, '0')}`,
  medicamento_id: 'a',
  tipo_movimentacao: 'entrada',
  quantidade: 0,
  custo_unitario: null,
  valor_total: null,
  data: '2026-11-01',
  origem: null,
  fornecedor: null,
  nota_fiscal: null,
  lote_produto: null,
  validade: null,
  observacao: null,
  unidade: 'frasco',
  registro_origem_id: null,
  created_at: `2026-11-01T00:00:${String(seq % 60).padStart(2, '0')}Z`,
  ...p,
})

const item = (p = {}) => ({
  id: 'a', nome_comercial: 'Ivermectina', tipo: 'Vermífugo', unidade: 'frasco',
  estoque_atual: 7, estoque_minimo: 8, custo_unitario: 10, custo_total_estoque: 70, controla_estoque: true, ...p,
})

const base = (movs: MovimentoFarmacia[], extra: Partial<DadosRelatorioFarmacia> = {}): DadosRelatorioFarmacia => ({
  itens: [item()],
  movimentacoes: movs,
  movimentacoes_total: movs.length,
  hoje: '2026-11-10',
  data_inicio: '2026-11-05',
  data_fim: '2026-11-10',
  ...extra,
})

describe('calcularResumoFarmacia', () => {
  const movs = [
    mov({ quantidade: 10, custo_unitario: 10, data: '2026-11-01', validade: '2026-12-01', lote_produto: 'L1' }),
    mov({ tipo_movimentacao: 'entrada', quantidade: 5, custo_unitario: 10, data: '2026-11-06', validade: '2027-06-01', lote_produto: 'L2' }),
    mov({ tipo_movimentacao: 'baixa', quantidade: 8, custo_unitario: 10, valor_total: 80, data: '2026-11-07' }),
  ]

  it('separa saldo inicial, entradas e baixas do período e fecha o saldo final', () => {
    const r = calcularResumoFarmacia(base(movs)).itens[0]
    expect(r.saldo_inicial).toBe(10)
    expect(r.entradas).toBe(5)
    expect(r.baixas).toBe(8)
    expect(r.saldo_final).toBe(7)
    expect(r.valor_estoque).toBe(70)
    expect(r.divergencia).toBeNull()
  })

  it('marca item a repor, cobertura e consumo por dia', () => {
    const r = calcularResumoFarmacia(base(movs))
    expect(r.a_repor).toBe(1)
    expect(r.itens[0].falta_para_minimo).toBe(1)
    expect(r.itens[0].consumo_medio_dia).toBeCloseTo(8 / 6)
    expect(r.valor_baixas).toBe(80)
  })

  it('aponta lote que vence em breve (FEFO consome o mais próximo primeiro)', () => {
    const r = calcularResumoFarmacia(base(movs))
    expect(r.itens[0].lotes.map((l) => [l.lote, l.saldo])).toEqual([['L1', 2], ['L2', 5]])
    expect(r.validade).toHaveLength(1)
    expect(r.validade[0].situacao).toBe('vence_em_breve')
  })

  it('detecta divergência com o saldo gravado só quando o período vai até hoje', () => {
    const d = base(movs, { itens: [item({ estoque_atual: 9 })] })
    expect(calcularResumoFarmacia(d).itens[0].divergencia).toBe(-2)
    expect(calcularResumoFarmacia({ ...d, data_fim: '2026-11-08' }).itens[0].divergencia).toBeNull()
  })

  it('estorno reduz o consumo e nunca deixa negativo', () => {
    const r = calcularResumoFarmacia(base([...movs, mov({ tipo_movimentacao: 'estorno', quantidade: 20, data: '2026-11-08' })])).itens[0]
    expect(r.baixas).toBe(0)
  })

  it('curva ABC pelo valor em estoque', () => {
    const d = base(movs, {
      itens: [item(), item({ id: 'b', nome_comercial: 'Barato', custo_unitario: 0.1 })],
      movimentacoes: [...movs, mov({ medicamento_id: 'b', quantidade: 5, custo_unitario: 0.1 })],
    })
    const itens = calcularResumoFarmacia(d).itens
    expect(itens.find((i) => i.id === 'a')?.curva).toBe('A')
    expect(itens.find((i) => i.id === 'b')?.curva).toBe('C')
  })
})

describe('extratoFarmacia', () => {
  it('traz só o período, do mais recente ao mais antigo, com saldo após', () => {
    const movs = [
      mov({ quantidade: 10, data: '2026-11-01' }),
      mov({ tipo_movimentacao: 'baixa', quantidade: 3, data: '2026-11-06' }),
    ]
    const e = extratoFarmacia(base(movs))
    expect(e).toHaveLength(1)
    expect(e[0].saldo_apos).toBe(7)
  })
})

describe('baixas por origem', () => {
  it('desconta estorno da origem e omite origem zerada', () => {
    const movs = [
      mov({ quantidade: 10, custo_unitario: 10 }),
      mov({ tipo_movimentacao: 'baixa', quantidade: 4, custo_unitario: 10, valor_total: 40, data: '2026-11-06', origem: 'enfermaria' }),
      mov({ tipo_movimentacao: 'estorno', quantidade: 1, custo_unitario: 10, valor_total: 10, data: '2026-11-07', origem: 'enfermaria' }),
      mov({ tipo_movimentacao: 'baixa', quantidade: 1, custo_unitario: 10, valor_total: 10, data: '2026-11-08', origem: 'pwa_farmacia' }),
      mov({ tipo_movimentacao: 'estorno', quantidade: 1, custo_unitario: 10, valor_total: 10, data: '2026-11-09', origem: 'pwa_farmacia' }),
    ]
    const r = calcularResumoFarmacia(base(movs))
    expect(r.baixas_por_origem).toEqual([{ label: 'Enfermaria', valor: 30 }])
    expect(r.valor_baixas).toBe(30)
  })
})
