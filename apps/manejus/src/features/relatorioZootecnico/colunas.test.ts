import { describe, expect, it } from 'vitest'
import { colunasZootecnicas, dividirPorManejo, formatarCelula, montarTabelaZootecnica } from './colunas'
import { montarLinhaGeral, montarLinha, type CategoriaZootecnica } from './agregacao'

describe('formatarCelula', () => {
  it('formata por tipo em pt-BR', () => {
    expect(formatarCelula('num2', 1234.5)).toBe('1.234,50')
    expect(formatarCelula('int', 12)).toBe('12')
    expect(formatarCelula('pct1', 54.5)).toBe('54,5%')
    expect(formatarCelula('pct2', 2.1)).toBe('2,10%')
    expect(formatarCelula('brl', 10)).toBe('R$ 10,00')
    expect(formatarCelula('data', '2026-10-14')).toBe('14/10/2026')
  })

  it('usa traço para vazio', () => {
    expect(formatarCelula('num2', null)).toBe('—')
    expect(formatarCelula('data', null)).toBe('—')
  })
})

describe('montarTabelaZootecnica', () => {
  it('gera uma célula por coluna e rotula a janela', () => {
    const geral = montarLinhaGeral([])
    const t = montarTabelaZootecnica(geral, [], 22)
    expect(t.geral).toHaveLength(colunasZootecnicas(22).length)
    expect(t.colunas.some((c) => c.grupo === 'Consumo 22 dias')).toBe(true)
    expect(t.secoes).toEqual([])
  })
})

const cat = (loteNome: string, curralNome: string | null): CategoriaZootecnica => ({
  loteNome, pastoNome: curralNome ? null : 'P1', curralNome, areaUtilHa: null, taxaLotacaoUaHa: null, categoria: null, raca: null,
  sexo: null, estrategia: null, cabecas: 10, dataPesagem: null, pesoEntradaKg: null, pesoAtualKg: null, pesoMetaKg: null,
  dataMeta: null, periodoDias: null, rcPercent: null, precoVendaArroba: null, precoCustoCab: null, consumoMetaPercentPv: null,
  teorMsPercent: null, serieGeral: [], serieJanela: [],
})

describe('dividirPorManejo', () => {
  it('separa lotes a pasto dos de curral e omite seção vazia', () => {
    const linhas = [montarLinha(cat('L1', null)), montarLinha(cat('L2', 'C1')), montarLinha(cat('L3', 'C2'))]
    const secoes = dividirPorManejo(linhas)
    expect(secoes.map((s) => s.titulo)).toEqual(['Lotes a pasto', 'Lotes em currais (confinamento)'])
    expect(secoes[1].linhas).toHaveLength(2)
    expect(secoes[1].total.cabecas).toBe(20)
    expect(secoes.map((s) => s.total.loteNome)).toEqual(['Total a pasto', 'Total em currais'])
    expect(dividirPorManejo([linhas[0]])).toHaveLength(1)
  })

  it('ordena pelo nome do curral e, sem curral, pelo nome do pasto', () => {
    const comPasto = (loteNome: string, pastoNome: string | null) => montarLinha({ ...cat(loteNome, null), pastoNome })
    const pasto = dividirPorManejo([comPasto('A', 'Pasto 10'), comPasto('B', 'Pasto 2'), comPasto('C', null), comPasto('D', 'Açude')])
    expect(pasto[0].linhas.map((l) => l.loteNome)).toEqual(['D', 'B', 'A', 'C'])

    const curral = dividirPorManejo([montarLinha(cat('X', 'Curral 3')), montarLinha(cat('Y', 'Curral 1')), montarLinha(cat('Z', 'Curral 1'))])
    expect(curral[0].linhas.map((l) => l.loteNome)).toEqual(['Y', 'Z', 'X'])
  })
})
