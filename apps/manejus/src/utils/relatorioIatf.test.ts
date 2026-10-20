import { describe, expect, it } from 'vitest'
import { agruparTentativas, tentativasIatf, totalIatf, type EventoDaFemeaIatf, type InseminacaoIatf } from './relatorioIatf'

const ia = (id: string, fem: string, data: string, p: Partial<InseminacaoIatf> = {}): InseminacaoIatf => ({
  id,
  individuo_id: fem,
  data,
  touro_nome: 'Touro A',
  semen_partida: 'P1',
  tecnico: 'Vet 1',
  protocolo_lote_id: 'l1',
  lote_nome: 'Lote 1',
  protocolo_nome: 'Clássico',
  ...p,
})
const evIa = (i: InseminacaoIatf): EventoDaFemeaIatf => ({ id: i.id, individuo_id: i.individuo_id, tipo: 'Inseminação', data: i.data, resultado: null })
const diag = (id: string, fem: string, data: string, resultado: string): EventoDaFemeaIatf => ({ id, individuo_id: fem, tipo: 'Diagnóstico de gestação', data, resultado })

describe('tentativasIatf', () => {
  it('atribui o diagnóstico mais recente depois da IA, antes do próximo ciclo', () => {
    const a = ia('a', 'f1', '2026-01-10')
    const b = ia('b', 'f1', '2026-03-01', { protocolo_lote_id: 'l2' })
    const eventos = [evIa(a), evIa(b), diag('d1', 'f1', '2026-02-10', 'Vazia'), diag('d2', 'f1', '2026-04-10', 'Prenha')]
    const t = tentativasIatf([a, b], eventos)
    expect(t.map((x) => x.resultado)).toEqual(['Vazia', 'Prenha'])
  })

  it('fica sem diagnóstico quando só há diagnóstico anterior à IA', () => {
    const a = ia('a', 'f1', '2026-02-01')
    const t = tentativasIatf([a], [evIa(a), diag('d0', 'f1', '2026-01-15', 'Prenha')])
    expect(t[0].resultado).toBe('Sem diagnóstico')
  })

  it('usa o mais recente quando há dois diagnósticos no ciclo e trata inconclusivo à parte', () => {
    const a = ia('a', 'f1', '2026-01-10')
    const t1 = tentativasIatf([a], [evIa(a), diag('d1', 'f1', '2026-02-10', 'Vazia'), diag('d2', 'f1', '2026-02-20', 'Prenha')])
    expect(t1[0].resultado).toBe('Prenha')
    const t2 = tentativasIatf([a], [evIa(a), diag('d1', 'f1', '2026-02-10', 'Inconclusivo')])
    expect(t2[0].resultado).toBe('Inconclusivo')
  })

  it('não mistura fêmeas', () => {
    const a = ia('a', 'f1', '2026-01-10')
    const t = tentativasIatf([a], [evIa(a), diag('d1', 'f2', '2026-02-10', 'Prenha')])
    expect(t[0].resultado).toBe('Sem diagnóstico')
  })
})

describe('agruparTentativas', () => {
  const a = ia('a', 'f1', '2026-01-10')
  const b = ia('b', 'f2', '2026-01-10')
  const c = ia('c', 'f3', '2026-01-10', { touro_nome: 'Touro B' })
  const d = ia('d', 'f4', '2026-01-10', { touro_nome: null })
  const eventos = [a, b, c, d].map(evIa).concat([
    diag('d1', 'f1', '2026-02-10', 'Prenha'),
    diag('d2', 'f2', '2026-02-10', 'Vazia'),
    diag('d3', 'f3', '2026-02-10', 'Prenha'),
  ])
  const tentativas = tentativasIatf([a, b, c, d], eventos)

  it('agrupa por touro com "Não informado" por último e calcula as taxas', () => {
    const linhas = agruparTentativas(tentativas, 'touro')
    expect(linhas.map((l) => l.chave)).toEqual(['Touro A', 'Touro B', 'Não informado'])
    expect(linhas[0]).toMatchObject({ inseminadas: 2, prenhes: 1, vazias: 1, taxaSobreInseminadas: 50, taxaSobreDiagnosticadas: 50 })
    expect(linhas[1]).toMatchObject({ inseminadas: 1, prenhes: 1, taxaSobreInseminadas: 100 })
    expect(linhas[2]).toMatchObject({ inseminadas: 1, semDiagnostico: 1, taxaSobreDiagnosticadas: null })
  })

  it('total soma tudo e arredonda a uma casa', () => {
    const t = totalIatf(tentativas)
    expect(t).toMatchObject({ inseminadas: 4, prenhes: 2, vazias: 1, semDiagnostico: 1, taxaSobreInseminadas: 50, taxaSobreDiagnosticadas: 66.7 })
  })

  it('agrupa por protocolo e por inseminador', () => {
    expect(agruparTentativas(tentativas, 'protocolo').map((l) => [l.chave, l.inseminadas])).toEqual([['Clássico', 4]])
    expect(agruparTentativas(tentativas, 'tecnico')[0].chave).toBe('Vet 1')
  })
})
