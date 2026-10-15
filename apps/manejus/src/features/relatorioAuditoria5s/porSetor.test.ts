import { describe, expect, it } from 'vitest'
import { SECOES_5S } from './itens'
import type { RegistroAuditoria5s } from './agregacao'
import {
  agruparPorSetor,
  chaveSetor,
  evolucaoPilaresSetor,
  itensRecorrentesSetor,
  linhasDosSetores,
  matrizSetorPilar,
  ordenarLinhas,
  pilaresSetorVsFazenda,
  resumirSetor,
  serieMultiSetor,
  serieSetor,
  setoresPadraoComparacao,
  setoresPorItem,
} from './porSetor'

const chaves = SECOES_5S.flatMap((s) => s.itens.map((i) => i.chave))
const itens = (naoConformes: string[] = []) => Object.fromEntries(chaves.map((c) => [c, naoConformes.includes(c) ? 'N' : 'C']))
const AGORA = '2026-10-15T12:00:00Z'

let seq = 0
const reg = (extra: Partial<RegistroAuditoria5s> = {}): RegistroAuditoria5s => ({
  id: `r${++seq}`,
  data: '2026-10-01T14:00:00+00:00',
  setor: 'Oficina',
  setor_id: 's1',
  responsavel: 'João',
  itens: itens(),
  observacoes: null,
  nota_geral: null,
  nao_conformidades: null,
  ...extra,
})

describe('chaveSetor e agruparPorSetor', () => {
  it('usa setor_id; sem id, o nome em minúsculas sem espaços nas pontas', () => {
    expect(chaveSetor({ setor_id: 's1', setor: 'Oficina' })).toBe('s1')
    expect(chaveSetor({ setor_id: null, setor: '  Oficina ' })).toBe('oficina')
    expect(chaveSetor({ setor_id: null, setor: null })).toBe('sem-setor')
  })

  it('dois setores com o mesmo nome e ids diferentes ficam separados', () => {
    const g = agruparPorSetor([reg({ setor_id: 'a', setor: 'Oficina' }), reg({ setor_id: 'b', setor: 'Oficina' })])
    expect(g).toHaveLength(2)
  })

  it('setor renomeado (mesmo id) vira um grupo só, com o nome mais recente e registros em ordem de data', () => {
    const g = agruparPorSetor([
      reg({ setor: 'Oficina Central', data: '2026-10-10T10:00:00Z' }),
      reg({ setor: 'Oficina', data: '2026-10-01T10:00:00Z' }),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].nome).toBe('Oficina Central')
    expect(g[0].registros.map((r) => r.data)).toEqual(['2026-10-01T10:00:00Z', '2026-10-10T10:00:00Z'])
  })
})

describe('resumirSetor', () => {
  it('nota média, última nota, delta e tendência', () => {
    const [g] = agruparPorSetor([
      reg({ data: '2026-10-01T10:00:00Z', nota_geral: 2 }),
      reg({ data: '2026-10-08T10:00:00Z', nota_geral: 4 }),
    ])
    expect(resumirSetor(g, AGORA)).toMatchObject({ auditorias: 2, notaMedia: 3, ultimaNota: 4, notaAnterior: 2, delta: 2, tendencia: 'alta', diasDesdeUltima: 7 })
  })

  it('queda e estabilidade', () => {
    const baixa = resumirSetor(agruparPorSetor([reg({ data: '2026-10-01T10:00:00Z', nota_geral: 4 }), reg({ data: '2026-10-08T10:00:00Z', nota_geral: 3 })])[0], AGORA)
    expect(baixa).toMatchObject({ delta: -1, tendencia: 'baixa' })
    const estavel = resumirSetor(agruparPorSetor([reg({ data: '2026-10-01T10:00:00Z', nota_geral: 3 }), reg({ data: '2026-10-08T10:00:00Z', nota_geral: 3 })])[0], AGORA)
    expect(estavel).toMatchObject({ delta: 0, tendencia: 'estavel' })
  })

  it('nota 0 conta (não é tratada como ausente)', () => {
    const r = resumirSetor(agruparPorSetor([reg({ data: '2026-10-01T10:00:00Z', nota_geral: 3 }), reg({ data: '2026-10-08T10:00:00Z', nota_geral: 0 })])[0], AGORA)
    expect(r).toMatchObject({ ultimaNota: 0, notaMedia: 1.5, delta: -3, tendencia: 'baixa' })
  })

  it('uma só auditoria: sem tendência; auditoria antiga sem nota entra na conformidade mas não na nota', () => {
    const uma = resumirSetor(agruparPorSetor([reg({ nota_geral: 4 })])[0], AGORA)
    expect(uma).toMatchObject({ auditorias: 1, ultimaNota: 4, notaAnterior: null, delta: null, tendencia: null })
    const mista = resumirSetor(agruparPorSetor([reg({ data: '2026-10-01T10:00:00Z', nota_geral: null, itens: itens(['limpeza_1']) }), reg({ data: '2026-10-08T10:00:00Z', nota_geral: 5 })])[0], AGORA)
    expect(mista).toMatchObject({ auditorias: 2, notaMedia: 5, ultimaNota: 5, delta: null, naoConformes: 1 })
    expect(mista.percentual).toBe(98) // 49 C de 50 avaliados
  })
})

describe('linhasDosSetores e ordenarLinhas', () => {
  const registros = [
    reg({ setor: 'Oficina', setor_id: 's1', data: '2026-10-01T10:00:00Z', nota_geral: 4 }),
    reg({ setor: 'Oficina', setor_id: 's1', data: '2026-10-08T10:00:00Z', nota_geral: 5 }),
    reg({ setor: 'Curral', setor_id: 's2', data: '2026-09-01T10:00:00Z', nota_geral: 1 }),
    reg({ setor: 'Gado', setor_id: 's3', data: '2026-10-10T10:00:00Z', nota_geral: null }),
  ]

  it('inclui pendências, série para o mini-gráfico e os cadastrados sem auditoria (esmaecidos)', () => {
    const linhas = linhasDosSetores(registros, AGORA, {
      pendenciasPorChave: new Map([['s2', 3]]),
      cadastrados: [
        { id: 's1', nome: 'Oficina' },
        { id: 's9', nome: 'Fábrica' },
      ],
    })
    expect(linhas).toHaveLength(4)
    expect(linhas.find((l) => l.chave === 's2')).toMatchObject({ pendenciasAbertas: 3, serieNotas: [1], diasDesdeUltima: 44 })
    expect(linhas.find((l) => l.chave === 's9')).toMatchObject({ semAuditoria: true, auditorias: 0, ultimaNota: null })
    expect(linhas.find((l) => l.chave === 's1')?.serieNotas).toEqual([4, 5])
  })

  it('não duplica o cadastrado que já aparece nos registros (por id ou por nome)', () => {
    const linhas = linhasDosSetores(registros, AGORA, { cadastrados: [{ id: 'outro', nome: 'curral' }] })
    expect(linhas).toHaveLength(3)
  })

  it('ordena por pior nota (sem nota por último), mais pendências, mais antiga e nome', () => {
    const linhas = linhasDosSetores(registros, AGORA, { pendenciasPorChave: new Map([['s2', 3], ['s1', 1]]) })
    expect(ordenarLinhas(linhas, 'pior-nota').map((l) => l.nome)).toEqual(['Curral', 'Oficina', 'Gado'])
    expect(ordenarLinhas(linhas, 'mais-pendencias').map((l) => l.nome)).toEqual(['Curral', 'Oficina', 'Gado'])
    expect(ordenarLinhas(linhas, 'mais-antiga').map((l) => l.nome)).toEqual(['Curral', 'Oficina', 'Gado'])
    expect(ordenarLinhas(linhas, 'nome').map((l) => l.nome)).toEqual(['Curral', 'Gado', 'Oficina'])
  })

  it('pontos do mini-gráfico limitados às últimas N notas', () => {
    const muitos = Array.from({ length: 12 }, (_, i) => reg({ data: `2026-09-${String(i + 1).padStart(2, '0')}T10:00:00Z`, nota_geral: i % 6 }))
    expect(linhasDosSetores(muitos, AGORA, { pontosSparkline: 5 })[0].serieNotas).toHaveLength(5)
  })
})

describe('serieSetor', () => {
  it('um ponto por auditoria, em ordem de data, com nota nula nas antigas', () => {
    const s = serieSetor([
      reg({ id: 'b', data: '2026-10-08T10:00:00Z', nota_geral: 0 }),
      reg({ id: 'a', data: '2026-10-01T10:00:00Z', nota_geral: null, itens: itens(['limpeza_1']) }),
    ])
    expect(s.map((p) => p.id)).toEqual(['a', 'b'])
    expect(s[0]).toMatchObject({ nota: null, naoConformes: 1 })
    expect(s[1]).toMatchObject({ nota: 0, percentual: 100 })
  })
})

describe('serieMultiSetor', () => {
  const registros = [
    reg({ setor: 'Oficina', setor_id: 's1', data: '2026-09-10T10:00:00Z', nota_geral: 2 }),
    reg({ setor: 'Oficina', setor_id: 's1', data: '2026-09-20T10:00:00Z', nota_geral: 4 }),
    reg({ setor: 'Curral', setor_id: 's2', data: '2026-10-05T10:00:00Z', nota_geral: 0 }),
    reg({ setor: 'Oficina', setor_id: 's1', data: '2026-10-06T10:00:00Z', nota_geral: 5 }),
    reg({ setor: 'Gado', setor_id: 's3', data: '2026-10-07T10:00:00Z', nota_geral: null }),
  ]

  it('média por mês e setor; setor sem dado no período fica null; média da fazenda inclui só quem tem nota', () => {
    const { setores, pontos } = serieMultiSetor(registros, 'mes', 'nota')
    expect(setores.map((s) => s.chave).sort()).toEqual(['s1', 's2', 's3'])
    expect(pontos).toEqual([
      { periodo: '2026-09', media: 3, s1: 3, s2: null, s3: null },
      { periodo: '2026-10', media: 2.5, s1: 5, s2: 0, s3: null },
    ])
  })

  it('métrica conformidade usa o percentual de cada auditoria (ponto de nota ausente ainda conta)', () => {
    const { pontos } = serieMultiSetor([reg({ data: '2026-10-01T10:00:00Z', itens: itens(['limpeza_1']) })], 'mes', 'percentual')
    expect(pontos[0]).toMatchObject({ periodo: '2026-10', s1: 96 })
  })

  it('agrupa por semana (segunda-feira)', () => {
    const { pontos } = serieMultiSetor([reg({ data: '2026-10-14T10:00:00Z', nota_geral: 3 }), reg({ data: '2026-10-12T10:00:00Z', nota_geral: 5 })], 'semana', 'nota')
    expect(pontos).toHaveLength(1)
    expect(pontos[0]).toMatchObject({ periodo: '2026-10-12', s1: 4 })
  })

  it('sem registros', () => {
    expect(serieMultiSetor([], 'mes', 'nota')).toEqual({ setores: [], pontos: [] })
  })
})

describe('setoresPadraoComparacao', () => {
  const linha = (chave: string, notaMedia: number | null, semAuditoria = false) => ({ chave, notaMedia, percentual: null, semAuditoria })
  it('todos se couberem; ignora os sem auditoria', () => {
    expect(setoresPadraoComparacao([linha('a', 3), linha('b', 4), linha('c', null, true)], 6)).toEqual(['a', 'b'])
  })
  it('acima do limite, os de pior nota média (limite - 1)', () => {
    const lista = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((c, i) => linha(c, i))
    expect(setoresPadraoComparacao(lista, 4)).toEqual(['a', 'b', 'c'])
  })
})

describe('pilares', () => {
  it('evolucaoPilaresSetor: percentual de cada pilar por auditoria', () => {
    const e = evolucaoPilaresSetor([reg({ itens: itens(['limpeza_1', 'limpeza_2']) })])
    expect(e[0]).toMatchObject({ utilizacao: 100, limpeza: 60 })
  })

  it('matrizSetorPilar: uma linha por setor, pior primeiro, pilares na ordem de SECOES_5S', () => {
    const m = matrizSetorPilar([
      reg({ setor: 'Oficina', setor_id: 's1' }),
      reg({ setor: 'Curral', setor_id: 's2', itens: itens(['limpeza_1']) }),
    ])
    expect(m.map((l) => l.nome)).toEqual(['Curral', 'Oficina'])
    expect(m[0].pilares).toEqual([100, 100, 80, 100, 100])
  })

  it('pilaresSetorVsFazenda: atual (última auditoria), média do setor e média da fazenda', () => {
    const doSetor = [
      reg({ data: '2026-10-01T10:00:00Z', itens: itens(['limpeza_1', 'limpeza_2']) }),
      reg({ data: '2026-10-08T10:00:00Z', itens: itens(['limpeza_1']) }),
    ]
    const fazenda = [...doSetor, reg({ setor: 'Curral', setor_id: 's2' })]
    const limpeza = pilaresSetorVsFazenda(doSetor, fazenda).find((p) => p.id === 'limpeza')
    expect(limpeza).toEqual({ id: 'limpeza', titulo: 'Limpeza', atual: 80, mediaSetor: 70, mediaFazenda: 80 })
  })
})

describe('itensRecorrentesSetor', () => {
  const registros = [
    reg({ data: '2026-10-01T10:00:00Z', itens: itens(['limpeza_1', 'utilizacao_1']), nao_conformidades: { limpeza_1: { observacao: 'Chão sujo', foto_url: 'https://x/a.webp' } } }),
    reg({ data: '2026-10-08T10:00:00Z', itens: itens(['limpeza_1']), nao_conformidades: { limpeza_1: { observacao: '' } } }),
  ]

  it('conta ocorrências, mantém a evidência mais recente e cruza com as pendências abertas', () => {
    const r = itensRecorrentesSetor(registros, [{ chave: 'limpeza_1', desde: '2026-10-01T10:00:00Z' }])
    expect(r[0]).toMatchObject({
      chave: 'limpeza_1',
      naoConformes: 2,
      avaliacoes: 2,
      percentualNaoConforme: 100,
      ultimaOcorrencia: '2026-10-08T10:00:00Z',
      situacao: 'aberta',
      desde: '2026-10-01T10:00:00Z',
      observacao: 'Chão sujo',
      fotoUrl: 'https://x/a.webp',
    })
    expect(r[1]).toMatchObject({ chave: 'utilizacao_1', naoConformes: 1, situacao: 'resolvida', desde: null })
  })

  it('sem N no período, lista vazia', () => {
    expect(itensRecorrentesSetor([reg()], [])).toEqual([])
  })
})

describe('setoresPorItem', () => {
  it('conta setores distintos afetados por cada item N', () => {
    const m = setoresPorItem([
      reg({ setor_id: 's1', itens: itens(['limpeza_1']) }),
      reg({ setor_id: 's1', itens: itens(['limpeza_1']) }),
      reg({ setor_id: 's2', itens: itens(['limpeza_1', 'utilizacao_1']) }),
    ])
    expect(m.get('limpeza_1')).toBe(2)
    expect(m.get('utilizacao_1')).toBe(1)
  })
})
