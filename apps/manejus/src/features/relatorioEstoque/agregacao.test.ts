import { describe, expect, it } from 'vitest'
import {
  chaveItem,
  classificarABC,
  filtrarItens,
  itensDeAtencao,
  ordenarItens,
  rotuloUnidadeCusto,
  textoCobertura,
  totaisDoGrupo,
  type ItemEstoque,
} from './agregacao'

function item(parcial: Partial<ItemEstoque>): ItemEstoque {
  return {
    item_tipo: 'insumo', nome: 'Item', tipo: 'Volumoso', unidade: 'kg', estoque_atual: 0,
    custo_unitario: 1, estoque_minimo: 0, valor_estoque: 0, negativo: false, em_alerta: false,
    ...parcial,
  }
}

describe('relatório de estoque de insumos: agregação', () => {
  it('totaliza o grupo com os indicadores de qualidade', () => {
    const totais = totaisDoGrupo([
      item({ valor_estoque: 100, em_alerta: true, falta_para_minimo: 5, entradas_valor: 40, saidas_valor: 10 }),
      item({ valor_estoque: 0, negativo: true, sem_custo: true }),
      item({ valor_estoque: 50 }),
    ])
    expect(totais.valor_total).toBe(150)
    expect(totais.total_itens).toBe(3)
    expect(totais.em_alerta).toBe(1)
    expect(totais.negativos).toBe(1)
    expect(totais.sem_custo).toBe(1)
    expect(totais.a_repor).toBe(1)
    expect(totais.valor_entradas).toBe(40)
    expect(totais.valor_saidas).toBe(10)
  })

  it('classifica a curva ABC por grupo e ignora itens sem valor', () => {
    const itens = [
      item({ nome: 'A1', valor_estoque: 800 }),
      item({ nome: 'B1', valor_estoque: 150 }),
      item({ nome: 'C1', valor_estoque: 50 }),
      item({ nome: 'Zero', valor_estoque: 0 }),
      item({ nome: 'Form', item_tipo: 'formulacao', valor_estoque: 10 }),
    ]
    const abc = classificarABC(itens)
    expect(abc.get(chaveItem(itens[0]))).toBe('A')
    expect(abc.get(chaveItem(itens[1]))).toBe('B')
    expect(abc.get(chaveItem(itens[2]))).toBe('C')
    expect(abc.has(chaveItem(itens[3]))).toBe(false)
    // A formulação é outro grupo: sozinha, é classe A.
    expect(abc.get(chaveItem(itens[4]))).toBe('A')
  })

  it('filtra por busca sem acento e por indicador', () => {
    const itens = [
      item({ nome: 'Núcleo Mineral', em_alerta: true }),
      item({ nome: 'Milho', sem_custo: true }),
      item({ nome: 'Ureia', negativo: true, tipo: 'Proteico' }),
    ]
    expect(filtrarItens(itens, 'nucleo', 'todos').map((i) => i.nome)).toEqual(['Núcleo Mineral'])
    expect(filtrarItens(itens, 'proteico', 'todos').map((i) => i.nome)).toEqual(['Ureia'])
    expect(filtrarItens(itens, '', 'alerta')).toHaveLength(1)
    expect(filtrarItens(itens, '', 'sem_custo').map((i) => i.nome)).toEqual(['Milho'])
    expect(filtrarItens(itens, '', 'negativo').map((i) => i.nome)).toEqual(['Ureia'])
  })

  it('ordena e mantém valores nulos no fim nas duas direções', () => {
    const itens = [
      item({ nome: 'sem', cobertura_dias: null }),
      item({ nome: 'dez', cobertura_dias: 10 }),
      item({ nome: 'cinco', cobertura_dias: 5 }),
    ]
    expect(ordenarItens(itens, 'cobertura_dias', 'asc').map((i) => i.nome)).toEqual(['cinco', 'dez', 'sem'])
    expect(ordenarItens(itens, 'cobertura_dias', 'desc').map((i) => i.nome)).toEqual(['dez', 'cinco', 'sem'])
    expect(ordenarItens(itens, 'nome', 'asc').map((i) => i.nome)).toEqual(['cinco', 'dez', 'sem'])
  })

  it('formata cobertura e unidade do custo', () => {
    expect(textoCobertura({ cobertura_dias: 12.4, consumo_medio_dia: 3 })).toBe('12 d')
    expect(textoCobertura({ cobertura_dias: 800, consumo_medio_dia: 1 })).toBe('mais de 1 ano')
    expect(textoCobertura({ cobertura_dias: null, consumo_medio_dia: null })).toBe('—')
    expect(textoCobertura({ cobertura_dias: 0, consumo_medio_dia: 5 })).toBe('Sem saldo')
    expect(rotuloUnidadeCusto({ unidade: null })).toBe('R$/kg')
    expect(rotuloUnidadeCusto({ unidade: 'saco' })).toBe('R$/saco')
  })

  it('lista só os itens que pedem atenção, do mais grave ao menos grave', () => {
    const itens = [
      item({ nome: 'ok' }),
      item({ nome: 'semcusto', sem_custo: true }),
      item({ nome: 'min', em_alerta: true }),
      item({ nome: 'neg', negativo: true }),
    ]
    expect(itensDeAtencao(itens).map((i) => i.nome)).toEqual(['neg', 'min', 'semcusto'])
  })
})
