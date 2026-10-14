import { describe, expect, it } from 'vitest'
import { colunasZootecnicas, formatarCelula, montarTabelaZootecnica } from './colunas'
import { montarLinhaGeral } from './agregacao'

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
    expect(t.linhas).toEqual([])
  })
})
