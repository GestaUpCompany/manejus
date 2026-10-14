import { describe, expect, it } from 'vitest'
import { montarLinha, montarLinhaGeral, resumirConsumo, type CategoriaZootecnica } from './agregacao'

function cat(parcial: Partial<CategoriaZootecnica> = {}): CategoriaZootecnica {
  return {
    loteNome: 'L',
    pastoNome: null,
    curralNome: null,
    areaUtilHa: null,
    taxaLotacaoUaHa: null,
    categoria: null,
    raca: null,
    sexo: null,
    estrategia: null,
    cabecas: 10,
    dataPesagem: null,
    pesoEntradaKg: 300,
    pesoAtualKg: 450,
    pesoMetaKg: null,
    dataMeta: null,
    periodoDias: null,
    rcPercent: 50,
    precoVendaArroba: 300,
    precoCustoCab: 3000,
    consumoMetaPercentPv: null,
    teorMsPercent: 50,
    serieGeral: [],
    serieJanela: [],
    ...parcial,
  }
}

describe('relatorioZootecnico/agregacao', () => {
  it('resumirConsumo calcula médias e MS pelo teor', () => {
    const r = resumirConsumo(
      [
        { trato_kg_cab_dia: 10, consumo_percent_pv: 2, custo_reais_cab_dia: 6 },
        { trato_kg_cab_dia: 14, consumo_percent_pv: 3, custo_reais_cab_dia: null },
      ],
      50,
    )
    expect(r).toEqual({ mnKgCabDia: 12, msKgCabDia: 6, percentPv: 2.5, custoCabDia: 6 })
  })

  it('resumirConsumo devolve null sem dados (não 0)', () => {
    expect(resumirConsumo([], 50).mnKgCabDia).toBeNull()
  })

  it('valor de estoque usa RC, @ de carcaça e cabeças; null sem preço', () => {
    expect(montarLinha(cat()).valorEstoque).toBeCloseTo((450 * 0.5) / 15 * 300 * 10)
    expect(montarLinha(cat({ precoVendaArroba: null })).valorEstoque).toBeNull()
    expect(montarLinha(cat({ rcPercent: 0.5 })).rcPercent).toBe(50)
  })

  it('linha Geral soma cabeças e pondera por cabeças', () => {
    const a = montarLinha(cat({ cabecas: 10, pesoAtualKg: 400 }))
    const b = montarLinha(cat({ cabecas: 30, pesoAtualKg: 500 }))
    const g = montarLinhaGeral([a, b])
    expect(g.cabecas).toBe(40)
    expect(g.pesoAtualKg).toBe(475)
    expect(g.capitalAtual).toBe(120000)
  })

  it('linha Geral conta a área de cada pasto uma única vez', () => {
    const a = montarLinha(cat({ pastoNome: 'P1', areaUtilHa: 10 }))
    const b = montarLinha(cat({ pastoNome: 'P1', areaUtilHa: 10 }))
    const c = montarLinha(cat({ pastoNome: 'P2', areaUtilHa: 5 }))
    expect(montarLinhaGeral([a, b, c]).areaUtilHa).toBe(15)
  })
})

describe('relatorioZootecnico/custo', () => {
  it('custo 0 na série não vira custo real', () => {
    const r = resumirConsumo([{ trato_kg_cab_dia: 10, consumo_percent_pv: 2, custo_reais_cab_dia: 0 }], 50)
    expect(r.custoCabDia).toBeNull()
  })
})
