import { describe, expect, it } from 'vitest'
import type { ItemEstoque } from './agregacao'
import {
  COBERTURA_ALVO_DIAS,
  classificarSituacao,
  concentracaoABC,
  diasDoPeriodo,
  lerPeriodo,
  listaImobilizado,
  listaRepor,
  resumirDecisao,
  sugestaoReposicao,
} from './decisao'

function item(parcial: Partial<ItemEstoque>): ItemEstoque {
  return {
    item_tipo: 'insumo', nome: 'Item', tipo: 'Volumoso', unidade: 'kg', estoque_atual: 100,
    custo_unitario: 2, estoque_minimo: 0, valor_estoque: 200, negativo: false, em_alerta: false,
    saldo_final: 100, saidas: 10, saidas_valor: 20, ...parcial,
  }
}

describe('relatório de estoque: regras de decisão', () => {
  it('classifica a situação com prioridade ruptura > parado > excesso > ok', () => {
    expect(classificarSituacao(item({ negativo: true }), true)).toBe('ruptura')
    expect(classificarSituacao(item({ em_alerta: true, saidas: 0 }), true)).toBe('ruptura')
    expect(classificarSituacao(item({ cobertura_dias: 14.9 }), true)).toBe('ruptura')
    expect(classificarSituacao(item({ cobertura_dias: 15 }), true)).toBe('ok')
    expect(classificarSituacao(item({ saidas: 0, cobertura_dias: null }), true)).toBe('parado')
    expect(classificarSituacao(item({ cobertura_dias: 90 }), true)).toBe('ok')
    expect(classificarSituacao(item({ cobertura_dias: 91 }), true)).toBe('excesso')
  })

  it('não chama de parado o item sem saldo ou sem valor', () => {
    expect(classificarSituacao(item({ saldo_final: 0, valor_estoque: 0, saidas: 0 }), true)).toBe('ok')
    expect(classificarSituacao(item({ valor_estoque: 0, saidas: 0, sem_custo: true }), true)).toBe('ok')
  })

  it('sem período só vale ruptura por mínimo ou saldo negativo', () => {
    expect(classificarSituacao(item({ saidas: 0, cobertura_dias: 200 }), false)).toBe('ok')
    expect(classificarSituacao(item({ cobertura_dias: 3 }), false)).toBe('ok')
    expect(classificarSituacao(item({ em_alerta: true }), false)).toBe('ruptura')
    expect(classificarSituacao(item({ negativo: true }), false)).toBe('ruptura')
  })

  it('sugere reposição pelo maior entre o mínimo e a cobertura alvo', () => {
    // 5 kg/dia × 30 = 150; saldo 100 → 50. Mínimo pede 80 → vale 80.
    expect(sugestaoReposicao(item({ consumo_medio_dia: 5, falta_para_minimo: 80 })).quantidade).toBe(80)
    const s = sugestaoReposicao(item({ consumo_medio_dia: 5, falta_para_minimo: 10 }))
    expect(s.quantidade).toBe(5 * COBERTURA_ALVO_DIAS - 100)
    expect(s.valor).toBe(s.quantidade * 2)
    // Saldo negativo entra na conta.
    expect(sugestaoReposicao(item({ saldo_final: -20, consumo_medio_dia: 1 })).quantidade).toBe(50)
    // Sem consumo e sem mínimo: nada a sugerir. Sem custo: quantidade sem valor.
    expect(sugestaoReposicao(item({ consumo_medio_dia: null })).quantidade).toBe(0)
    expect(sugestaoReposicao(item({ consumo_medio_dia: 5, sem_custo: true })).valor).toBe(0)
  })

  it('calcula os dias do período, inclusivo', () => {
    expect(diasDoPeriodo('2026-10-01', '2026-10-31')).toBe(31)
    expect(diasDoPeriodo('2026-10-21', '2026-10-21')).toBe(1)
    expect(diasDoPeriodo(null, '2026-10-31')).toBeNull()
    // Sem fim: usa a data de geração em Cuiabá (UTC-4).
    expect(diasDoPeriodo('2026-10-01', null, '2026-10-21T02:00:00Z')).toBe(20)
  })

  it('resume capital, cobertura, giro e consumo por origem', () => {
    const itens = [
      item({ nome: 'repor', cobertura_dias: 5, valor_estoque: 100, saldo_inicial: 100, saidas: 20, saidas_valor: 40, consumo_origem: { suplementacao: 12, fabrica_confinamento: 8 }, consumo_medio_dia: 2, em_alerta: true }),
      item({ nome: 'parado', valor_estoque: 300, saldo_inicial: 150, saidas: 0, saidas_valor: 0 }),
      item({ nome: 'excesso', cobertura_dias: 200, valor_estoque: 100, saldo_inicial: 50, saidas: 10, saidas_valor: 10 }),
      item({ nome: 'ok', cobertura_dias: 40, valor_estoque: 500, saldo_inicial: 250, saidas: 10, saidas_valor: 50 }),
    ]
    const r = resumirDecisao(itens, true, 10)
    expect(r.contagem).toEqual({ ruptura: 1, parado: 1, excesso: 1, ok: 1 })
    expect(r.valorEstoque).toBe(1000)
    expect(r.valorInicial).toBe((100 + 150 + 50 + 250) * 2)
    expect(r.consumoValor).toBe(100)
    expect(r.consumoDiaValor).toBe(10)
    expect(r.capitalParadoExcesso).toBe(400)
    expect(r.pctParadoExcesso).toBe(40)
    expect(r.giro).toBeCloseTo(100 / ((1100 + 1000) / 2))
    // 20 kg a R$ 2/kg = R$ 40; 12/20 e 8/20 desse valor.
    expect(r.consumoPorOrigem.map((o) => [o.origem, Math.round(o.valor)])).toEqual([
      ['suplementacao', 24],
      ['fabrica_confinamento', 16],
    ])
    expect(r.consumoPorOrigem[0].rotulo).toBe('Suplementação')
  })

  it('sem período não inventa métricas de consumo', () => {
    const r = resumirDecisao([item({ em_alerta: true }), item({})], false, null)
    expect(r.consumoValor).toBeNull()
    expect(r.giro).toBeNull()
    expect(r.valorInicial).toBeNull()
    expect(r.contagem.ruptura).toBe(1)
    expect(r.consumoPorOrigem).toEqual([])
  })

  it('ordena a lista de repor pela urgência e a de imobilizado pelo valor', () => {
    const itens = [
      item({ nome: 'dez', cobertura_dias: 10 }),
      item({ nome: 'neg', negativo: true, cobertura_dias: null }),
      item({ nome: 'cinco', cobertura_dias: 5 }),
      item({ nome: 'p1', saidas: 0, cobertura_dias: null, valor_estoque: 50 }),
      item({ nome: 'e1', cobertura_dias: 300, valor_estoque: 900 }),
    ]
    expect(listaRepor(itens, true).map((i) => i.nome)).toEqual(['neg', 'cinco', 'dez'])
    expect(listaImobilizado(itens, true).map((i) => i.nome)).toEqual(['e1', 'p1'])
  })

  it('mede a concentração da classe A', () => {
    const itens = [item({ nome: 'a', valor_estoque: 800 }), item({ nome: 'b', valor_estoque: 150 }), item({ nome: 'c', valor_estoque: 50 })]
    const abc = { 'insumo:a': 'A', 'insumo:b': 'B', 'insumo:c': 'C' } as const
    const c = concentracaoABC(itens, abc)
    expect(c).toMatchObject({ itensA: 1, itensComValor: 3, pctValorA: 80 })
    expect(c.pctItensA).toBeCloseTo(33.3, 1)
  })

  it('escreve a leitura do período em frases', () => {
    const itens = [
      item({ nome: 'repor', em_alerta: true, saldo_final: 20, valor_estoque: 40, saldo_inicial: 100, cobertura_dias: 10, consumo_medio_dia: 2, saidas: 20, saidas_valor: 40 }),
      item({ nome: 'parado', valor_estoque: 300, saldo_inicial: 150, saidas: 0, saidas_valor: 0 }),
    ]
    const conc = concentracaoABC(itens, { 'insumo:repor': 'B', 'insumo:parado': 'A' })
    const frases = lerPeriodo(resumirDecisao(itens, true, 10), conc)
    expect(frases[0]).toContain('1 item pede reposição')
    expect(frases[0]).toContain('reposição estimada em')
    expect(frases[1]).toContain('1 item sem saída no período')
    expect(frases[1]).not.toContain('com cobertura')
    expect(frases.some((f) => f.includes('classe A'))).toBe(true)
    expect(lerPeriodo(resumirDecisao([item({})], true, 10), concentracaoABC([], {}))[0]).toBe('Nenhum item com risco de ruptura.')
  })
})
