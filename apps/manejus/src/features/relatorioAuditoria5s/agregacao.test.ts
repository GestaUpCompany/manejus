import { describe, expect, it } from 'vitest'
import { SECOES_5S } from './itens'
import {
  evolucao,
  porPilar,
  porSetor,
  rankingItens,
  resultadoRegistro,
  resumoGeral,
  setoresSemAuditoria,
  type RegistroAuditoria5s,
} from './agregacao'

const chaves = SECOES_5S.flatMap((s) => s.itens.map((i) => i.chave))
const itens = (naoConformes: string[] = []) => Object.fromEntries(chaves.map((c) => [c, naoConformes.includes(c) ? 'N' : 'C']))

const reg = (extra: Partial<RegistroAuditoria5s> = {}): RegistroAuditoria5s => ({
  id: Math.random().toString(36).slice(2),
  data: '2026-10-12T14:00:00+00:00',
  setor: 'Oficina',
  setor_id: 'setor-1',
  responsavel: 'João',
  itens: itens(),
  observacoes: null,
  ...extra,
})

describe('resultadoRegistro', () => {
  it('tudo conforme = 100% e cada pilar 100%', () => {
    const r = resultadoRegistro(reg())
    expect(r).toMatchObject({ conformes: 25, naoConformes: 0, percentual: 100 })
    expect(r.secoes.every((s) => s.percentual === 100)).toBe(true)
  })

  it('itens nulos não geram percentual', () => {
    expect(resultadoRegistro({ itens: null }).percentual).toBeNull()
  })

  it('calcula por pilar', () => {
    const r = resultadoRegistro(reg({ itens: itens(['utilizacao_1', 'utilizacao_2', 'disciplina_5']) }))
    expect(r.percentual).toBe(88)
    expect(r.secoes[0]).toMatchObject({ id: 'utilizacao', percentual: 60 })
  })
})

describe('resumoGeral', () => {
  it('pondera pelos itens e conta setores distintos', () => {
    const registros = [
      reg({ itens: itens(['utilizacao_1']) }),
      reg({ setor: 'Curral', setor_id: 'setor-2' }),
      reg({ setor: 'Curral', setor_id: 'setor-2' }),
    ]
    expect(resumoGeral(registros)).toEqual({ auditorias: 3, percentual: 98.67, itensNaoConformes: 1, setoresAuditados: 2 })
  })

  it('sem registros', () => {
    expect(resumoGeral([])).toEqual({ auditorias: 0, percentual: null, itensNaoConformes: 0, setoresAuditados: 0 })
  })
})

describe('porSetor', () => {
  it('ordena do pior para o melhor e guarda a última data', () => {
    const linhas = porSetor([
      reg({ setor: 'Oficina', data: '2026-10-01T10:00:00Z' }),
      reg({ setor: 'Oficina', data: '2026-10-10T10:00:00Z' }),
      reg({ setor: 'Curral', itens: itens(['limpeza_1', 'limpeza_2']) }),
    ])
    expect(linhas.map((l) => l.setor)).toEqual(['Curral', 'Oficina'])
    expect(linhas[0].percentual).toBe(92)
    expect(linhas[1]).toMatchObject({ auditorias: 2, ultimaData: '2026-10-10T10:00:00Z' })
  })
})

describe('porPilar', () => {
  it('devolve os 5 pilares na ordem da ficha', () => {
    const pilares = porPilar([reg({ itens: itens(['limpeza_1']) })])
    expect(pilares.map((p) => p.id)).toEqual(['utilizacao', 'organizacao', 'limpeza', 'padronizacao', 'disciplina'])
    expect(pilares.find((p) => p.id === 'limpeza')?.percentual).toBe(80)
  })
})

describe('rankingItens', () => {
  it('lista só itens com N, do mais frequente ao menos', () => {
    const ranking = rankingItens([
      reg({ itens: itens(['limpeza_1', 'utilizacao_1']) }),
      reg({ itens: itens(['limpeza_1']) }),
    ])
    expect(ranking.map((i) => [i.chave, i.naoConformes])).toEqual([
      ['limpeza_1', 2],
      ['utilizacao_1', 1],
    ])
    expect(ranking[0]).toMatchObject({ secao: 'Limpeza', percentualNaoConforme: 100, negativa: 'O ambiente não está limpo ou em boas condições de uso.' })
  })
})

describe('evolucao', () => {
  const registros = [
    reg({ data: '2026-09-30T12:00:00Z' }),
    reg({ data: '2026-10-05T12:00:00Z', itens: itens(['limpeza_1']) }),
    reg({ data: '2026-10-11T12:00:00Z' }),
  ]

  it('agrupa por mês', () => {
    expect(evolucao(registros, 'mes').map((p) => [p.periodo, p.auditorias, p.percentual])).toEqual([
      ['2026-09', 1, 100],
      ['2026-10', 2, 98],
    ])
  })

  it('agrupa por semana (segunda-feira)', () => {
    // 05/10/2026 e 11/10/2026 caem na semana que começa na segunda 05/10
    expect(evolucao(registros, 'semana').map((p) => [p.periodo, p.auditorias])).toEqual([
      ['2026-09-28', 1],
      ['2026-10-05', 2],
    ])
  })
})

describe('setoresSemAuditoria', () => {
  it('cobre por id e por nome', () => {
    const cadastrados = [
      { id: 'setor-1', nome: 'Oficina' },
      { id: 'setor-2', nome: 'Curral' },
      { id: 'setor-3', nome: 'Sede' },
    ]
    expect(setoresSemAuditoria(cadastrados, [{ setor_id: 'setor-1', setor: 'Oficina' }, { setor_id: null, setor: ' curral ' }])).toEqual(['Sede'])
  })
})
