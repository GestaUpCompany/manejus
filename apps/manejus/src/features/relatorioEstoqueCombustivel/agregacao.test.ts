import { describe, expect, it } from 'vitest'
import { agruparPorCombustivel, totaisDosTanques, type TanqueEstoqueCombustivel } from './agregacao'

function tanque(parcial: Partial<TanqueEstoqueCombustivel>): TanqueEstoqueCombustivel {
  return {
    id: 't', nome: 'Tanque', combustivel: 'Diesel S10', capacidade_l: 1000, limite_alerta_l: 100,
    saldo_inicial_l: 0, entradas_l: 0, entradas_valor: 0, baixas_l: 0, baixas_valor: 0,
    ajustes_l: 0, qtd_ajustes: 0, saldo_final_l: 0, saldo_atual_l: 0, custo_medio_l: 0,
    valor_estoque: 0, pct_capacidade: null, negativo: false, abaixo_limite: false,
    ...parcial,
  }
}

describe('agregação do estoque de combustível', () => {
  it('soma os totais e conta alertas e negativos', () => {
    const totais = totaisDosTanques([
      tanque({ saldo_inicial_l: 100, entradas_l: 500, baixas_l: 50, saldo_final_l: 550, valor_estoque: 3300, abaixo_limite: true }),
      tanque({ saldo_inicial_l: 0, entradas_l: 200, baixas_l: 300, saldo_final_l: -100, negativo: true }),
    ])
    expect(totais.saldo_inicial_l).toBe(100)
    expect(totais.entradas_l).toBe(700)
    expect(totais.baixas_l).toBe(350)
    expect(totais.saldo_final_l).toBe(450)
    expect(totais.valor_estoque).toBe(3300)
    expect(totais.total_tanques).toBe(2)
    expect(totais.abaixo_limite).toBe(1)
    expect(totais.negativos).toBe(1)
  })

  it('agrupa por combustível em ordem alfabética', () => {
    const grupos = agruparPorCombustivel([
      tanque({ id: 'a', combustivel: 'Diesel S10', saldo_final_l: 10 }),
      tanque({ id: 'b', combustivel: 'Diesel Comum', saldo_final_l: 20 }),
      tanque({ id: 'c', combustivel: 'Diesel S10', saldo_final_l: 30 }),
    ])
    expect(grupos.map((g) => g.combustivel)).toEqual(['Diesel Comum', 'Diesel S10'])
    expect(grupos[1].tanques).toHaveLength(2)
    expect(grupos[1].totais.saldo_final_l).toBe(40)
  })
})
