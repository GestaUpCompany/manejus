import { describe, expect, it } from 'vitest'
import { montarMovimentacoesIndividuo, mudouLocal } from './movimentacaoIndividuo'

const base = {
  fazendaId: 'faz-1',
  individuoId: 'ind-1',
  identificacao: 'BR-1',
  data: '2026-10-08',
  pesoKg: 450,
  contexto: 'realocacao' as const,
}

describe('mudouLocal', () => {
  it('detecta troca de lote, de categoria e entrada/saída de lote', () => {
    expect(mudouLocal({ loteId: 'A', categoria: 'Boi Gordo' }, { loteId: 'B', categoria: 'Boi Gordo' })).toBe(true)
    expect(mudouLocal({ loteId: 'A', categoria: 'Boi Gordo' }, { loteId: 'A', categoria: 'Boi Magro' })).toBe(true)
    expect(mudouLocal({ loteId: null, categoria: 'Boi Gordo' }, { loteId: 'A', categoria: 'Boi Gordo' })).toBe(true)
    expect(mudouLocal({ loteId: 'A', categoria: 'Boi Gordo' }, { loteId: '', categoria: 'Boi Gordo' })).toBe(true)
  })

  it('não detecta mudança quando nada mudou ou quando não há lote nos dois lados', () => {
    expect(mudouLocal({ loteId: 'A', categoria: 'Boi Gordo' }, { loteId: 'A', categoria: 'Boi Gordo' })).toBe(false)
    expect(mudouLocal({ loteId: null, categoria: 'Boi Gordo' }, { loteId: undefined, categoria: 'Boi Gordo' })).toBe(false)
  })
})

describe('montarMovimentacoesIndividuo', () => {
  it('troca de lote gera Saída do lote antigo e Entrada no novo, ambas com o lote em origem', () => {
    const linhas = montarMovimentacoesIndividuo({
      ...base,
      origem: { loteId: 'A', categoria: 'Boi Gordo' },
      destino: { loteId: 'B', categoria: 'Boi Gordo' },
    })
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toMatchObject({ motivo_movimentacao: 'Saída', lote_origem_id: 'A', lote_destino_id: null, categoria: 'Boi Gordo' })
    expect(linhas[1]).toMatchObject({ motivo_movimentacao: 'Entrada', lote_origem_id: 'B', lote_destino_id: null, categoria: 'Boi Gordo' })
    expect(linhas.every((l) => l.numero_cabecas === 1 && l.individuo_id === 'ind-1' && l.data === '2026-10-08')).toBe(true)
  })

  it('cadastro com lote gera só a Entrada', () => {
    const linhas = montarMovimentacoesIndividuo({
      ...base,
      contexto: 'cadastro',
      origem: { loteId: null, categoria: null },
      destino: { loteId: 'B', categoria: 'Boi Gordo' },
    })
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ motivo_movimentacao: 'Entrada', lote_origem_id: 'B', causa_observacao: 'Entrada de indivíduo: BR-1' })
  })

  it('remover do lote gera só a Saída', () => {
    const linhas = montarMovimentacoesIndividuo({
      ...base,
      origem: { loteId: 'A', categoria: 'Boi Gordo' },
      destino: { loteId: null, categoria: 'Boi Gordo' },
    })
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ motivo_movimentacao: 'Saída', lote_origem_id: 'A' })
  })

  it('mudança só de categoria no mesmo lote gera Saída e Entrada em categorias diferentes', () => {
    const linhas = montarMovimentacoesIndividuo({
      ...base,
      origem: { loteId: 'A', categoria: 'Boi Magro' },
      destino: { loteId: 'A', categoria: 'Boi Gordo' },
    })
    expect(linhas.map((l) => [l.motivo_movimentacao, l.categoria])).toEqual([
      ['Saída', 'Boi Magro'],
      ['Entrada', 'Boi Gordo'],
    ])
  })

  it('sem mudança de local não gera nada', () => {
    expect(
      montarMovimentacoesIndividuo({
        ...base,
        origem: { loteId: 'A', categoria: 'Boi Gordo' },
        destino: { loteId: 'A', categoria: 'Boi Gordo' },
      })
    ).toEqual([])
  })

  it('Entrada sem peso do animal usa o peso médio da categoria para não anular a média do lote', () => {
    const linhas = montarMovimentacoesIndividuo({
      ...base,
      pesoKg: null,
      pesoMedioDestinoKg: 432.5,
      origem: { loteId: 'A', categoria: 'Boi Gordo' },
      destino: { loteId: 'B', categoria: 'Boi Gordo' },
    })
    expect(linhas[0].peso_vivo_atual_kg).toBeNull()
    expect(linhas[1].peso_vivo_atual_kg).toBe(432.5)
  })

  it('Entrada com peso do animal usa o peso do animal', () => {
    const linhas = montarMovimentacoesIndividuo({
      ...base,
      pesoMedioDestinoKg: 432.5,
      origem: { loteId: null, categoria: null },
      destino: { loteId: 'B', categoria: 'Boi Gordo' },
    })
    expect(linhas[0].peso_vivo_atual_kg).toBe(450)
  })
})
