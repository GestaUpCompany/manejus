import { describe, expect, it } from 'vitest'
import {
  classificarABC,
  filtrarItens,
  itensDeAtencao,
  ordenarItens,
  rotuloUnidadeCusto,
  textoCobertura,
  totaisDosItens,
  type ItemCantina,
} from './agregacao'

let seq = 0
function item(parcial: Partial<ItemCantina>): ItemCantina {
  seq += 1
  return {
    id: `i${seq}`, nome: 'Item', classificacao: 'Não Perecíveis', unidade: 'kg', estoque_minimo: 0,
    saldo_inicial: 0, entradas: 0, entradas_valor: 0, baixas: 0, baixas_valor: 0, ajustes: 0, qtd_ajustes: 0,
    saldo_final: 0, estoque_atual: 0, custo_unitario: 1, valor_estoque: 0, negativo: false, em_alerta: false,
    falta_para_minimo: 0, consumo_medio_dia: null, cobertura_dias: null, sem_custo: false, divergencia: null,
    ...parcial,
  }
}

describe('relatório de cantina: agregação', () => {
  it('totaliza os itens com os indicadores de qualidade', () => {
    const totais = totaisDosItens([
      item({ valor_estoque: 100, em_alerta: true, falta_para_minimo: 5, entradas_valor: 40, baixas_valor: 10 }),
      item({ negativo: true, sem_custo: true, divergencia: -3 }),
      item({ valor_estoque: 50 }),
    ])
    expect(totais.valor_total).toBe(150)
    expect(totais.total_itens).toBe(3)
    expect(totais.em_alerta).toBe(1)
    expect(totais.negativos).toBe(1)
    expect(totais.sem_custo).toBe(1)
    expect(totais.a_repor).toBe(1)
    expect(totais.divergencias).toBe(1)
    expect(totais.valor_entradas).toBe(40)
    expect(totais.valor_baixas).toBe(10)
  })

  it('classifica a curva ABC e ignora itens sem valor', () => {
    const itens = [
      item({ valor_estoque: 800 }),
      item({ valor_estoque: 150 }),
      item({ valor_estoque: 50 }),
      item({ valor_estoque: 0 }),
    ]
    const abc = classificarABC(itens)
    expect(abc.get(itens[0].id)).toBe('A')
    expect(abc.get(itens[1].id)).toBe('B')
    expect(abc.get(itens[2].id)).toBe('C')
    expect(abc.has(itens[3].id)).toBe(false)
  })

  it('filtra por busca sem acento e por indicador', () => {
    const itens = [
      item({ nome: 'Café torrado', em_alerta: true }),
      item({ nome: 'Arroz', sem_custo: true, classificacao: 'Hortifruti' }),
      item({ nome: 'Ovos', negativo: true }),
    ]
    expect(filtrarItens(itens, 'cafe', 'todos').map((i) => i.nome)).toEqual(['Café torrado'])
    expect(filtrarItens(itens, 'hortifruti', 'todos').map((i) => i.nome)).toEqual(['Arroz'])
    expect(filtrarItens(itens, '', 'alerta')).toHaveLength(1)
    expect(filtrarItens(itens, '', 'sem_custo').map((i) => i.nome)).toEqual(['Arroz'])
    expect(filtrarItens(itens, '', 'negativo').map((i) => i.nome)).toEqual(['Ovos'])
    expect(filtrarItens(itens, '', 'divergencia')).toHaveLength(0)
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

  it('formata a cobertura conforme saldo e consumo', () => {
    expect(textoCobertura({ saldo_final: 10, cobertura_dias: 12.4 })).toBe('12 d')
    expect(textoCobertura({ saldo_final: 10, cobertura_dias: null })).toBe('Sem consumo')
    expect(textoCobertura({ saldo_final: 0, cobertura_dias: null })).toBe('Sem saldo')
    expect(textoCobertura({ saldo_final: -2, cobertura_dias: 0 })).toBe('Sem saldo')
    expect(textoCobertura({ saldo_final: 10, cobertura_dias: 800 })).toBe('1 ano ou mais')
  })

  it('rotula a unidade do custo', () => {
    expect(rotuloUnidadeCusto({ unidade: null })).toBe('R$/un')
    expect(rotuloUnidadeCusto({ unidade: 'kg' })).toBe('R$/kg')
  })

  it('lista só os itens que pedem atenção, do mais grave ao menos grave', () => {
    const itens = [
      item({ nome: 'ok' }),
      item({ nome: 'semcusto', sem_custo: true }),
      item({ nome: 'div', divergencia: 2 }),
      item({ nome: 'min', em_alerta: true }),
      item({ nome: 'neg', negativo: true }),
    ]
    expect(itensDeAtencao(itens).map((i) => i.nome)).toEqual(['neg', 'min', 'div', 'semcusto'])
  })
})
