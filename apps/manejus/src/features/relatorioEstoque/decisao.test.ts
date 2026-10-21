import { describe, expect, it } from 'vitest'
import type { ItemEstoque } from './agregacao'
import {
  COBERTURA_ALVO_DIAS,
  classificarSituacao,
  concentracaoABC,
  diasDoPeriodo,
  lerPeriodo,
  listaAltos,
  listaParados,
  listaProgramar,
  listaRepor,
  montarDecisao,
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
  it('classifica a situação com prioridade ruptura > programar > parado > alto > ok', () => {
    expect(classificarSituacao(item({ negativo: true }), true)).toBe('ruptura')
    expect(classificarSituacao(item({ em_alerta: true, saidas: 0 }), true)).toBe('ruptura')
    expect(classificarSituacao(item({ cobertura_dias: 14.9 }), true)).toBe('ruptura')
    // Entre 15 e 30 dias: já está abaixo da meta, mas sem risco imediato.
    expect(classificarSituacao(item({ cobertura_dias: 15 }), true)).toBe('programar')
    expect(classificarSituacao(item({ cobertura_dias: 29.9 }), true)).toBe('programar')
    expect(classificarSituacao(item({ cobertura_dias: 30 }), true)).toBe('ok')
    expect(classificarSituacao(item({ saidas: 0, cobertura_dias: null }), true)).toBe('parado')
    expect(classificarSituacao(item({ cobertura_dias: 90 }), true)).toBe('ok')
    expect(classificarSituacao(item({ cobertura_dias: 91 }), true)).toBe('alto')
  })

  it('não chama de parado o item sem saldo ou sem valor', () => {
    expect(classificarSituacao(item({ saldo_final: 0, valor_estoque: 0, saidas: 0 }), true)).toBe('ok')
    expect(classificarSituacao(item({ valor_estoque: 0, saidas: 0, sem_custo: true }), true)).toBe('ok')
  })

  it('sem período só vale ruptura por mínimo ou saldo negativo', () => {
    expect(classificarSituacao(item({ saidas: 0, cobertura_dias: 200 }), false)).toBe('ok')
    expect(classificarSituacao(item({ cobertura_dias: 3 }), false)).toBe('ok')
    expect(classificarSituacao(item({ cobertura_dias: 20 }), false)).toBe('ok')
    expect(classificarSituacao(item({ em_alerta: true }), false)).toBe('ruptura')
    expect(classificarSituacao(item({ negativo: true }), false)).toBe('ruptura')
  })

  it('sugere reposição pelo maior entre o mínimo e a cobertura alvo', () => {
    // 5 kg/dia × 30 = 150; saldo 100 → 50. Mínimo pede 80 → vale 80.
    expect(sugestaoReposicao(item({ consumo_medio_dia: 5, falta_para_minimo: 80 })).quantidade).toBe(80)
    const s = sugestaoReposicao(item({ consumo_medio_dia: 5, falta_para_minimo: 10 }))
    expect(s.quantidade).toBe(5 * COBERTURA_ALVO_DIAS - 100)
    expect(s.valor).toBe(s.quantidade * 2)
    // O critério diz o que a compra cobre e a cobertura final acompanha.
    expect(sugestaoReposicao(item({ consumo_medio_dia: 5, falta_para_minimo: 80 }))).toMatchObject({ criterio: 'minimo', coberturaApos: 36 })
    expect(sugestaoReposicao(item({ consumo_medio_dia: 5, falta_para_minimo: 10 }))).toMatchObject({ criterio: 'cobertura', coberturaApos: COBERTURA_ALVO_DIAS })
    // Sem consumo no período, só o mínimo vale e não há cobertura a informar.
    expect(sugestaoReposicao(item({ consumo_medio_dia: null, falta_para_minimo: 40 }))).toMatchObject({ criterio: 'minimo', coberturaApos: null })
    expect(sugestaoReposicao(item({ consumo_medio_dia: null })).criterio).toBeNull()
    // Saldo negativo entra na conta.
    expect(sugestaoReposicao(item({ saldo_final: -20, consumo_medio_dia: 1 })).quantidade).toBe(50)
    // Item sem custo: quantidade sem valor.
    expect(sugestaoReposicao(item({ consumo_medio_dia: 5, sem_custo: true })).valor).toBe(0)
  })

  it('formulação é produção: tem quantidade, mas não vira valor de compra', () => {
    const s = sugestaoReposicao(item({ item_tipo: 'formulacao', consumo_medio_dia: 5 }))
    expect(s).toMatchObject({ acao: 'producao', valor: 0 })
    expect(s.quantidade).toBe(5 * COBERTURA_ALVO_DIAS - 100)
    expect(sugestaoReposicao(item({ consumo_medio_dia: 5 })).acao).toBe('compra')
  })

  it('calcula os dias do período, inclusivo', () => {
    expect(diasDoPeriodo('2026-10-01', '2026-10-31')).toBe(31)
    expect(diasDoPeriodo('2026-10-21', '2026-10-21')).toBe(1)
    expect(diasDoPeriodo(null, '2026-10-31')).toBeNull()
    // Sem fim: usa a data de geração em Cuiabá (UTC-4).
    expect(diasDoPeriodo('2026-10-01', null, '2026-10-21T02:00:00Z')).toBe(20)
  })

  it('resume capital por situação, compra a programar e consumo por origem', () => {
    const itens = [
      item({ nome: 'repor', cobertura_dias: 5, valor_estoque: 100, saldo_inicial: 100, saldo_final: 20, saidas: 20, saidas_valor: 40, consumo_origem: { suplementacao: 12, fabrica_confinamento: 8 }, consumo_medio_dia: 2, em_alerta: true }),
      item({ nome: 'programar', cobertura_dias: 20, valor_estoque: 50, saldo_inicial: 50, saldo_final: 20, saidas: 10, saidas_valor: 20, consumo_medio_dia: 1 }),
      item({ nome: 'parado', valor_estoque: 300, saldo_inicial: 150, saidas: 0, saidas_valor: 0 }),
      item({ nome: 'alto', cobertura_dias: 200, valor_estoque: 100, saldo_inicial: 50, saidas: 10, saidas_valor: 10 }),
      item({ nome: 'ok', cobertura_dias: 40, valor_estoque: 500, saldo_inicial: 250, saidas: 10, saidas_valor: 50 }),
      item({ item_tipo: 'formulacao', nome: 'ração', cobertura_dias: 2, valor_estoque: 10, saidas: 10, saidas_valor: 5, consumo_medio_dia: 5, saldo_final: 10 }),
    ]
    const r = resumirDecisao(itens, true, 10)
    expect(r.contagem).toEqual({ ruptura: 2, programar: 1, parado: 1, alto: 1, ok: 1 })
    expect(r.valorEstoque).toBe(1060)
    expect(r.consumoValor).toBe(125)
    expect(r.consumoDiaValor).toBe(12.5)
    expect(r.capital.parado).toBe(300)
    expect(r.capital.alto).toBe(100)
    expect(r.pctParado).toBeCloseTo((300 / 1060) * 100)
    expect(r.pctAlto).toBeCloseTo((100 / 1060) * 100)
    // Compra: só insumos. repor = 2 × 30 − 20 = 40 kg × 2; programar = 1 × 30 − 20 = 10 kg × 2. A formulação não entra.
    expect(r.reposicaoValor).toBe(80)
    expect(r.programarValor).toBe(20)
    expect(r.producaoItens).toBe(1)
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

  it('ordena cada lista: urgência para repor e programar, valor para parados e altos', () => {
    const itens = [
      item({ nome: 'dez', cobertura_dias: 10 }),
      item({ nome: 'neg', negativo: true, cobertura_dias: null }),
      item({ nome: 'cinco', cobertura_dias: 5 }),
      item({ nome: 'vinte', cobertura_dias: 20 }),
      item({ nome: 'vinteecinco', cobertura_dias: 25 }),
      item({ nome: 'p1', saidas: 0, cobertura_dias: null, valor_estoque: 50 }),
      item({ nome: 'p2', saidas: 0, cobertura_dias: null, valor_estoque: 70 }),
      item({ nome: 'a1', cobertura_dias: 300, valor_estoque: 900 }),
      item({ nome: 'a2', cobertura_dias: 120, valor_estoque: 950 }),
    ]
    expect(listaRepor(itens, true).map((i) => i.nome)).toEqual(['neg', 'cinco', 'dez'])
    expect(listaProgramar(itens, true).map((i) => i.nome)).toEqual(['vinte', 'vinteecinco'])
    expect(listaParados(itens, true).map((i) => i.nome)).toEqual(['p2', 'p1'])
    expect(listaAltos(itens, true).map((i) => i.nome)).toEqual(['a2', 'a1'])
  })

  it('mede a concentração da classe A', () => {
    const itens = [item({ nome: 'a', valor_estoque: 800 }), item({ nome: 'b', valor_estoque: 150 }), item({ nome: 'c', valor_estoque: 50 })]
    const abc = { 'insumo:a': 'A', 'insumo:b': 'B', 'insumo:c': 'C' } as const
    const c = concentracaoABC(itens, abc)
    expect(c).toMatchObject({ itensA: 1, itensComValor: 3, pctValorA: 80 })
    expect(c.pctItensA).toBeCloseTo(33.3, 1)
  })

  it('escreve a leitura com a falta primeiro e a sobra só como informação', () => {
    const itens = [
      item({ nome: 'repor', em_alerta: true, saldo_final: 20, valor_estoque: 40, saldo_inicial: 100, cobertura_dias: 10, consumo_medio_dia: 2, saidas: 20, saidas_valor: 40 }),
      item({ nome: 'programar', cobertura_dias: 20, saldo_final: 20, valor_estoque: 40, saldo_inicial: 100, consumo_medio_dia: 1, saidas: 20, saidas_valor: 40 }),
      item({ item_tipo: 'formulacao', nome: 'ração', cobertura_dias: 2, saldo_final: 10, valor_estoque: 10, consumo_medio_dia: 5, saidas: 10, saidas_valor: 5 }),
      item({ nome: 'parado', valor_estoque: 300, saldo_inicial: 150, saidas: 0, saidas_valor: 0 }),
      item({ nome: 'alto', cobertura_dias: 200, valor_estoque: 100, saldo_inicial: 50, saidas: 10, saidas_valor: 10 }),
    ]
    const conc = concentracaoABC(itens, { 'insumo:parado': 'A', 'insumo:repor': 'B' })
    const frases = lerPeriodo(resumirDecisao(itens, true, 10), conc)
    expect(frases[0]).toContain('2 itens pedem reposição urgente')
    expect(frases[0]).toContain('compra estimada de insumos em')
    expect(frases[1]).toContain('1 item está com cobertura entre 15 e 30 dias')
    expect(frases[2]).toContain('1 formulação pede produção na fábrica, não compra')
    expect(frases[3]).toContain('1 item parado')
    // Estoque alto é informação, não alarme: pede confirmação e vem depois da falta.
    expect(frases[4]).toContain('1 item com cobertura acima de 90 dias')
    expect(frases[4]).toContain('confirme se é estoque estratégico')
    expect(frases.some((f) => f.includes('classe A'))).toBe(true)
    expect(lerPeriodo(resumirDecisao([item({})], true, 10), concentracaoABC([], {}))[0]).toBe('Nenhum item com risco de ruptura.')
  })

  it('monta o payload do PDF com as listas já separadas e os limites', () => {
    const itens = [
      item({ nome: 'repor', cobertura_dias: 5, consumo_medio_dia: 2 }),
      item({ nome: 'programar', cobertura_dias: 20, consumo_medio_dia: 1 }),
      item({ nome: 'parado', saidas: 0, cobertura_dias: null }),
      item({ nome: 'alto', cobertura_dias: 200 }),
    ]
    const d = montarDecisao({ itens, tem_periodo: true, data_inicio: '2026-10-01', data_fim: '2026-10-10' }, new Map())
    expect(d.resumo.dias).toBe(10)
    expect(d.repor.map((r) => r.chave)).toEqual(['insumo:repor'])
    expect(d.programar.map((r) => r.chave)).toEqual(['insumo:programar'])
    expect(d.parados).toEqual(['insumo:parado'])
    expect(d.altos).toEqual(['insumo:alto'])
    expect(d.situacoes['insumo:alto']).toBe('alto')
    expect(d.limites).toEqual({ ruptura: 15, alvo: 30, alta: 90 })
  })
})
