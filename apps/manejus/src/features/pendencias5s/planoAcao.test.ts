import { describe, expect, it } from 'vitest'
import { calcularPendencias5s, situacaoPlano5s, type RegistroPendencia5s } from './calculo'

// Mesmos casos do PWA (frontend/src/utils/pendencias5s.test.ts, bloco "plano de ação"): mudou um, mude o outro.
const reg = (data: string, itens: Record<string, string>, naoConformidades: Record<string, any> | null = null): RegistroPendencia5s => ({
  data,
  itens,
  naoConformidades,
})

describe('plano de ação 5S', () => {
  const plano = (descricao: string, concluida = false) => ({
    medidas: [{ id: 'm1', descricao, responsavel: 'João', prazo: '2026-10-20', concluida, concluida_em: null }],
    criado_em: '2026-10-01T10:00:00Z',
    atualizado_em: '2026-10-01T10:00:00Z',
  })

  it('N com plano abre a pendência com o plano', () => {
    const r = calcularPendencias5s([reg('2026-10-01T10:00:00Z', { limpeza_1: 'N' }, { limpeza_1: { plano_acao: plano('Retirar lixo') } })])
    expect(r.abertas[0].planoAcao).toMatchObject({ medidas: [{ descricao: 'Retirar lixo', responsavel: 'João', prazo: '2026-10-20' }] })
  })

  it('"ainda pendente" sem plano novo herda o plano anterior', () => {
    const r = calcularPendencias5s([
      reg('2026-10-01T10:00:00Z', { limpeza_1: 'N' }, { limpeza_1: { plano_acao: plano('Retirar lixo') } }),
      reg('2026-10-05T10:00:00Z', { limpeza_1: 'N' }, { limpeza_1: { observacao: '' } }),
    ])
    expect(r.abertas[0]).toMatchObject({ ocorrencias: 2, planoAcao: { medidas: [{ descricao: 'Retirar lixo' }] } })
  })

  it('plano novo na reincidência substitui o anterior', () => {
    const r = calcularPendencias5s([
      reg('2026-10-01T10:00:00Z', { limpeza_1: 'N' }, { limpeza_1: { plano_acao: plano('Retirar lixo') } }),
      reg('2026-10-05T10:00:00Z', { limpeza_1: 'N' }, { limpeza_1: { plano_acao: plano('Contratar coleta', true) } }),
    ])
    expect(r.abertas[0].planoAcao?.medidas[0]).toMatchObject({ descricao: 'Contratar coleta', concluida: true })
  })

  it('resolvida leva o último plano da sequência', () => {
    const r = calcularPendencias5s([
      reg('2026-10-01T10:00:00Z', { limpeza_1: 'N' }, { limpeza_1: { plano_acao: plano('Retirar lixo') } }),
      reg('2026-10-05T10:00:00Z', { limpeza_1: 'C' }),
    ])
    expect(r.resolvidas[0].planoAcao?.medidas[0].descricao).toBe('Retirar lixo')
  })

  it('plano inválido ou sem medidas vira null', () => {
    const r = calcularPendencias5s([reg('2026-10-01T10:00:00Z', { limpeza_1: 'N' }, { limpeza_1: { plano_acao: { medidas: [{ descricao: '   ' }] } } })])
    expect(r.abertas[0].planoAcao).toBeNull()
  })
})

describe('situacaoPlano5s', () => {
  const medida = (prazo: string | null, concluida = false) => ({ id: 'x', descricao: 'd', responsavel: null, prazo, concluida, concluida_em: null })
  const hoje = '2026-10-26T12:00:00Z'

  it('sem plano ou plano vazio', () => {
    expect(situacaoPlano5s(null, hoje)).toBe('sem_plano')
    expect(situacaoPlano5s({ medidas: [], criado_em: null, atualizado_em: null }, hoje)).toBe('sem_plano')
  })

  it('todas concluídas é concluído, mesmo com prazo vencido', () => {
    expect(situacaoPlano5s({ medidas: [medida('2026-10-01', true)], criado_em: null, atualizado_em: null }, hoje)).toBe('concluido')
  })

  it('medida aberta com prazo vencido é atrasado; sem prazo ou prazo futuro é em dia', () => {
    expect(situacaoPlano5s({ medidas: [medida('2026-10-20')], criado_em: null, atualizado_em: null }, hoje)).toBe('atrasado')
    expect(situacaoPlano5s({ medidas: [medida(null)], criado_em: null, atualizado_em: null }, hoje)).toBe('em_dia')
    expect(situacaoPlano5s({ medidas: [medida('2026-11-01')], criado_em: null, atualizado_em: null }, hoje)).toBe('em_dia')
  })
})
