import { describe, expect, it } from 'vitest'
import {
  consumoDoMes,
  divergenciaDeSaldo,
  emAlerta,
  filtrarEOrdenar,
  modoBaixaEnfermaria,
  movimentoEditavel,
  movimentosComSaldo,
  rotuloBaixaEnfermaria,
  semCusto,
  sinalMovimento,
  totaisDaTela,
  validarAjuste,
  validarConteudo,
  validarEntrada,
  valorDoItem,
  type ItemEstoqueFarmacia,
  type MovimentoFarmacia,
} from './logica'

let seq = 0
function item(parcial: Partial<ItemEstoqueFarmacia>): ItemEstoqueFarmacia {
  seq += 1
  return {
    id: `i${seq}`, nome_comercial: 'Item', tipo: 'Carnes', unidade: 'kg', estoque_atual: 10, estoque_minimo: 0,
    custo_unitario: 2, custo_total_estoque: 20, controla_estoque: true, ...parcial,
  }
}

function mov(parcial: Partial<MovimentoFarmacia>): MovimentoFarmacia {
  seq += 1
  return {
    id: `m${String(seq).padStart(4, '0')}`, medicamento_id: 'i', tipo_movimentacao: 'entrada', quantidade: 0, custo_unitario: null, valor_total: null,
    data: '2026-10-01', origem: null, fornecedor: null, nota_fiscal: null, lote_produto: null, validade: null, observacao: null, unidade: 'kg', registro_origem_id: null,
    created_at: `2026-10-01T10:00:${String(seq % 60).padStart(2, '0')}Z`, ...parcial,
  }
}

describe('estoque da farmacia: alertas e totais', () => {
  it('marca alerta por saldo negativo ou mínimo, só com controle de estoque', () => {
    expect(emAlerta(item({ estoque_atual: -1 }))).toBe(true)
    expect(emAlerta(item({ estoque_atual: 5, estoque_minimo: 5 }))).toBe(true)
    expect(emAlerta(item({ estoque_atual: 6, estoque_minimo: 5 }))).toBe(false)
    expect(emAlerta(item({ estoque_atual: 0, estoque_minimo: 0 }))).toBe(false)
    expect(emAlerta(item({ estoque_atual: -9, controla_estoque: false }))).toBe(false)
  })

  it('detecta item com saldo e sem custo', () => {
    expect(semCusto(item({ custo_unitario: 0, estoque_atual: 3 }))).toBe(true)
    expect(semCusto(item({ custo_unitario: 0, estoque_atual: 0 }))).toBe(false)
    expect(semCusto(item({ custo_unitario: 1, estoque_atual: 3 }))).toBe(false)
  })

  it('valoriza o saldo sem contar negativo e totaliza só os itens controlados', () => {
    expect(valorDoItem(item({ estoque_atual: -4, custo_unitario: 6 }))).toBe(0)
    const totais = totaisDaTela([
      item({ estoque_atual: 10, custo_unitario: 2 }),
      item({ estoque_atual: -4, custo_unitario: 6 }),
      item({ estoque_atual: 5, custo_unitario: 0, estoque_minimo: 8 }),
      item({ estoque_atual: 100, custo_unitario: 9, controla_estoque: false }),
    ])
    expect(totais).toEqual({ controlados: 3, em_alerta: 2, sem_custo: 1, valor_total: 20 })
  })

  it('filtra por busca sem acento e classificação, com alertas primeiro', () => {
    const itens = [
      item({ nome_comercial: 'Café torrado', tipo: 'Não Perecíveis' }),
      item({ nome_comercial: 'Arroz', tipo: 'Não Perecíveis', estoque_atual: 1, estoque_minimo: 3 }),
      item({ nome_comercial: 'Frango', tipo: 'Carnes' }),
    ]
    expect(filtrarEOrdenar(itens, '', '').map((i) => i.nome_comercial)).toEqual(['Arroz', 'Café torrado', 'Frango'])
    expect(filtrarEOrdenar(itens, 'cafe', '').map((i) => i.nome_comercial)).toEqual(['Café torrado'])
    expect(filtrarEOrdenar(itens, '', 'Carnes').map((i) => i.nome_comercial)).toEqual(['Frango'])
  })
})

describe('estoque da farmacia: extrato', () => {
  it('define o sinal de cada tipo de lançamento', () => {
    expect(sinalMovimento({ tipo_movimentacao: 'entrada', quantidade: 3 })).toEqual({ sinal: '+', qtd: 3 })
    expect(sinalMovimento({ tipo_movimentacao: 'baixa', quantidade: 3 })).toEqual({ sinal: '−', qtd: 3 })
    expect(sinalMovimento({ tipo_movimentacao: 'estorno', quantidade: 3 })).toEqual({ sinal: '−', qtd: 3 })
    expect(sinalMovimento({ tipo_movimentacao: 'ajuste', quantidade: 7 })).toEqual({ sinal: '=', qtd: 7 })
  })

  it('reconstrói o saldo após cada lançamento, com ajuste absoluto', () => {
    const lista = movimentosComSaldo([
      mov({ tipo_movimentacao: 'baixa', quantidade: 4, data: '2026-10-02' }),
      mov({ tipo_movimentacao: 'entrada', quantidade: 10, data: '2026-10-01' }),
      mov({ tipo_movimentacao: 'ajuste', quantidade: 5, data: '2026-10-03' }),
      mov({ tipo_movimentacao: 'baixa', quantidade: 1, data: '2026-10-04' }),
    ])
    expect(lista.map((m) => m.saldo_apos)).toEqual([10, 6, 5, 4])
    expect(lista.map((m) => m.variacao)).toEqual([10, -4, -1, -1])
  })

  it('aponta divergência quando o saldo reconstruído difere do gravado', () => {
    const lista = movimentosComSaldo([mov({ tipo_movimentacao: 'entrada', quantidade: 10 })])
    expect(divergenciaDeSaldo(lista, 10)).toBeNull()
    expect(divergenciaDeSaldo(lista, 9.2)).toBe(0.8)
    expect(divergenciaDeSaldo([], 0)).toBeNull()
  })

  it('só permite editar lançamentos manuais, não os gerados por registros do aplicativo', () => {
    expect(movimentoEditavel({ registro_origem_id: null })).toBe(true)
    expect(movimentoEditavel({ registro_origem_id: 'abc' })).toBe(false)
  })

  it('soma o consumo do mês pelas baixas, descontando estornos', () => {
    const movs = [
      { tipo_movimentacao: 'baixa' as const, data: '2026-10-05', quantidade: 2, custo_unitario: 3, valor_total: null },
      { tipo_movimentacao: 'baixa' as const, data: '2026-09-30', quantidade: 9, custo_unitario: 3, valor_total: null },
      { tipo_movimentacao: 'estorno' as const, data: '2026-10-06', quantidade: 1, custo_unitario: 3, valor_total: null },
      { tipo_movimentacao: 'entrada' as const, data: '2026-10-07', quantidade: 50, custo_unitario: 3, valor_total: 150 },
    ]
    expect(consumoDoMes(movs, '2026-10-01')).toBe(3)
  })
})

describe('estoque da farmacia: formulários', () => {
  const entrada = { itemId: 'i1', quantidade: '2,5', custo: '10.50', fornecedor: '', notaFiscal: '', lote: '', validade: '', observacao: '', data: '2026-10-20' }
  const ajuste = { itemId: 'i1', saldo: '0', observacao: 'Inventário', data: '2026-10-20' }

  it('valida a entrada e aceita vírgula decimal', () => {
    expect(validarEntrada(entrada)).toEqual({ ok: true, valores: { quantidade: 2.5, custo: 10.5 } })
    expect(validarEntrada({ ...entrada, itemId: '' }).ok).toBe(false)
    expect(validarEntrada({ ...entrada, quantidade: '0' }).ok).toBe(false)
    expect(validarEntrada({ ...entrada, quantidade: 'abc' }).ok).toBe(false)
    expect(validarEntrada({ ...entrada, custo: '' }).ok).toBe(false)
    expect(validarEntrada({ ...entrada, custo: '0' }).ok).toBe(false)
    expect(validarEntrada({ ...entrada, data: '20/10/2026' }).ok).toBe(false)
  })

  it('valida o ajuste: saldo zero vale, motivo é obrigatório', () => {
    expect(validarAjuste(ajuste)).toEqual({ ok: true, valores: { saldo: 0 } })
    expect(validarAjuste({ ...ajuste, saldo: '-1' }).ok).toBe(false)
    expect(validarAjuste({ ...ajuste, saldo: '' }).ok).toBe(false)
    expect(validarAjuste({ ...ajuste, observacao: '  ' }).ok).toBe(false)
    expect(validarAjuste({ ...ajuste, itemId: '' }).ok).toBe(false)
  })
})

describe('baixa da Enfermaria (conversão de dose)', () => {
  it('mL, L, g e kg convertem direto', () => {
    for (const unidade of ['mL', 'L', 'g', 'kg']) {
      expect(modoBaixaEnfermaria({ unidade, conteudo_por_unidade: null, conteudo_unidade: null })).toBe('direta')
    }
  })

  it('frasco com conteúdo definido baixa pela embalagem; sem conteúdo não converte', () => {
    expect(modoBaixaEnfermaria({ unidade: 'frasco', conteudo_por_unidade: 500, conteudo_unidade: 'mL' })).toBe('embalagem')
    expect(modoBaixaEnfermaria({ unidade: 'frasco', conteudo_por_unidade: null, conteudo_unidade: null })).toBe('sem_conversao')
    expect(rotuloBaixaEnfermaria({ unidade: 'frasco', conteudo_por_unidade: 500, conteudo_unidade: 'mL' })).toBe('Automática (500 mL por frasco)')
    expect(rotuloBaixaEnfermaria({ unidade: 'dose', conteudo_por_unidade: null, conteudo_unidade: null })).toBe('Defina o conteúdo da embalagem')
  })

  it('valida o conteúdo da embalagem (opcional, maior que zero)', () => {
    expect(validarConteudo('')).toEqual({ ok: true, valores: { conteudo: null } })
    expect(validarConteudo('500,5')).toEqual({ ok: true, valores: { conteudo: 500.5 } })
    expect(validarConteudo('0').ok).toBe(false)
    expect(validarConteudo('abc').ok).toBe(false)
  })
})

describe('busca por SKU', () => {
  it('acha o medicamento pelo SKU, sem diferenciar maiúsculas', () => {
    const itens = [
      item({ nome_comercial: 'Draxxin 100', sku: 'MED-001' }),
      item({ nome_comercial: 'Exceller', sku: 'med-002' }),
      item({ nome_comercial: 'Penicilina', sku: null }),
    ]
    expect(filtrarEOrdenar(itens, 'med-001', '').map((i) => i.nome_comercial)).toEqual(['Draxxin 100'])
    expect(filtrarEOrdenar(itens, 'MED-002', '').map((i) => i.nome_comercial)).toEqual(['Exceller'])
    expect(filtrarEOrdenar(itens, 'med', '')).toHaveLength(2)
  })
})
