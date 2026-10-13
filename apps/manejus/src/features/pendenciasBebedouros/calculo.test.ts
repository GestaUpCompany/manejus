import { describe, expect, it } from 'vitest'
import {
  calcularPendencias,
  diasEntre,
  pendenciasPorBebedouro,
  porItem,
  resumoPendencias,
  type RegistroChecklistBebedouro,
} from './calculo'

const reg = (data: string, checklist: Record<string, any> | null, localId?: string, id?: string): RegistroChecklistBebedouro => ({ data, checklist, localId, id })
const ok = (valor: boolean, extra: Record<string, unknown> = {}) => ({ valor, observacao: '', ...extra })

// Mesmos cenários de frontend/src/utils/pendenciasBebedouro.test.ts (PWA)
describe('calcularPendencias (regra compartilhada com o PWA)', () => {
  it('sem registros não há pendência', () => {
    expect(calcularPendencias([])).toEqual({ abertas: [], resolvidas: [] })
  })

  it('item com problema no último registro fica aberto, com desde e observação', () => {
    const r = calcularPendencias([reg('2026-10-01T10:00:00Z', { agua_suficiente: ok(false, { observacao: 'Caixa seca', foto_url: 'https://x/a.webp' }) }, 'a', 'id-a')])
    expect(r.abertas).toHaveLength(1)
    expect(r.abertas[0]).toMatchObject({
      chave: 'agua_suficiente',
      desde: '2026-10-01T10:00:00Z',
      observacao: 'Caixa seca',
      fotoUrl: 'https://x/a.webp',
      ocorrencias: 1,
      registroDesdeId: 'id-a',
    })
  })

  it('um true posterior resolve e entra nas resolvidas', () => {
    const r = calcularPendencias([
      reg('2026-10-01T10:00:00Z', { agua_suficiente: ok(false) }, 'a', 'id-a'),
      reg('2026-10-05T10:00:00Z', { agua_suficiente: ok(true) }, 'b', 'id-b'),
    ])
    expect(r.abertas).toEqual([])
    expect(r.resolvidas).toEqual([
      expect.objectContaining({ chave: 'agua_suficiente', abertaEm: '2026-10-01T10:00:00Z', resolvidaEm: '2026-10-05T10:00:00Z', registroAbertaId: 'id-a', registroResolvidaId: 'id-b' }),
    ])
  })

  it('"ainda pendente" sem foto/observação nova mantém a evidência da ocorrência original', () => {
    const r = calcularPendencias([
      reg('2026-10-01T10:00:00Z', { agua_suficiente: ok(false, { observacao: 'Caixa seca', foto_url: 'https://x/a.webp' }) }),
      reg('2026-10-05T10:00:00Z', { agua_suficiente: ok(false) }),
    ])
    expect(r.abertas[0]).toMatchObject({ desde: '2026-10-01T10:00:00Z', observacao: 'Caixa seca', fotoUrl: 'https://x/a.webp', ocorrencias: 2 })
  })

  it('foto ou observação nova substitui a anterior', () => {
    const r = calcularPendencias([
      reg('2026-10-01T10:00:00Z', { agua_suficiente: ok(false, { observacao: 'a', foto_url: 'https://x/a.webp' }) }),
      reg('2026-10-05T10:00:00Z', { agua_suficiente: ok(false, { observacao: 'b', foto_url: 'https://x/b.webp' }) }),
    ])
    expect(r.abertas[0]).toMatchObject({ observacao: 'b', fotoUrl: 'https://x/b.webp' })
  })

  it('vários false seguidos contam como uma pendência desde o primeiro', () => {
    const r = calcularPendencias([
      reg('2026-10-01T10:00:00Z', { agua_suficiente: ok(false, { observacao: 'a' }) }),
      reg('2026-10-03T10:00:00Z', { agua_suficiente: ok(false, { observacao: 'b' }) }),
      reg('2026-10-06T10:00:00Z', { agua_suficiente: ok(false, { observacao: 'c' }) }),
    ])
    expect(r.abertas[0]).toMatchObject({ desde: '2026-10-01T10:00:00Z', ultimaData: '2026-10-06T10:00:00Z', observacao: 'c', ocorrencias: 3 })
  })

  it('reabertura: false, true, false abre uma pendência nova desde o último false', () => {
    const r = calcularPendencias([
      reg('2026-10-01T10:00:00Z', { agua_suficiente: ok(false) }),
      reg('2026-10-03T10:00:00Z', { agua_suficiente: ok(true) }),
      reg('2026-10-08T10:00:00Z', { agua_suficiente: ok(false) }),
    ])
    expect(r.abertas[0]).toMatchObject({ desde: '2026-10-08T10:00:00Z', ocorrencias: 1 })
    expect(r.resolvidas).toHaveLength(1)
  })

  it('registro sem o item (só foto, checklist inativo) não resolve nem abre', () => {
    const r = calcularPendencias([
      reg('2026-10-01T10:00:00Z', { agua_suficiente: ok(false) }),
      reg('2026-10-03T10:00:00Z', { foto_bebedouro: ok(true, { foto_url: 'https://x/f.webp' }) }),
      reg('2026-10-04T10:00:00Z', null),
    ])
    expect(r.abertas).toHaveLength(1)
    expect(r.resolvidas).toEqual([])
  })

  it('limpou_hoje = false não é pendência do bebedouro', () => {
    expect(calcularPendencias([reg('2026-10-01T10:00:00Z', { limpou_hoje: ok(false) })]).abertas).toEqual([])
  })

  it('usa a data do evento, não a ordem de chegada', () => {
    const r = calcularPendencias([
      reg('2026-10-05T10:00:00Z', { agua_suficiente: ok(true) }, 'b'),
      reg('2026-10-01T10:00:00Z', { agua_suficiente: ok(false) }, 'a'),
    ])
    expect(r.abertas).toEqual([])
    expect(r.resolvidas).toHaveLength(1)
  })

  it('o mesmo registro duas vezes conta uma só', () => {
    const r = calcularPendencias([
      reg('2026-10-01T10:00:00Z', { agua_suficiente: ok(false) }, 'x'),
      reg('2026-10-01T10:00:00Z', { agua_suficiente: ok(false) }, 'x'),
    ])
    expect(r.abertas[0].ocorrencias).toBe(1)
  })

  it('itens independentes; abertas da mais antiga para a mais nova', () => {
    const r = calcularPendencias([
      reg('2026-10-01T10:00:00Z', { vazao_bebedouro_ideal: ok(false), agua_suficiente: ok(false) }),
      reg('2026-10-04T10:00:00Z', { vazao_bebedouro_ideal: ok(false), agua_suficiente: ok(true), boia_protecao_boas_condicoes: ok(false) }),
    ])
    expect(r.abertas.map((p) => p.chave)).toEqual(['vazao_bebedouro_ideal', 'boia_protecao_boas_condicoes'])
    expect(r.resolvidas.map((p) => p.chave)).toEqual(['agua_suficiente'])
  })

  it('valor que não é booleano é ignorado', () => {
    expect(calcularPendencias([reg('2026-10-01T10:00:00Z', { agua_suficiente: { valor: 'Não' } })]).abertas).toEqual([])
  })
})

describe('pendenciasPorBebedouro', () => {
  const com = (numeroBebedouro: string | null, data: string, checklist: Record<string, any> | null, id: string) => ({ ...reg(data, checklist, id, id), numeroBebedouro })

  it('separa por bebedouro, ignora nome vazio e junta variações de caixa/espaço', () => {
    const r = pendenciasPorBebedouro([
      com('Bebedouro 1', '2026-10-01T10:00:00Z', { agua_suficiente: ok(false) }, 'a'),
      com(' bebedouro 1 ', '2026-10-02T10:00:00Z', { agua_suficiente: ok(false) }, 'b'),
      com('Bebedouro 2', '2026-10-01T10:00:00Z', { agua_suficiente: ok(false) }, 'c'),
      com('Bebedouro 2', '2026-10-03T10:00:00Z', { agua_suficiente: ok(true) }, 'd'),
      com(null, '2026-10-01T10:00:00Z', { agua_suficiente: ok(false) }, 'e'),
    ])
    expect(r.abertas.map((p) => [p.bebedouro, p.ocorrencias])).toEqual([['bebedouro 1', 2]])
    expect(r.resolvidas.map((p) => p.bebedouro)).toEqual(['Bebedouro 2'])
  })
})

describe('resumoPendencias e porItem', () => {
  const agora = '2026-10-13T12:00:00Z'
  const dados = pendenciasPorBebedouro([
    { ...reg('2026-10-01T12:00:00Z', { agua_suficiente: ok(false), vazao_bebedouro_ideal: ok(false) }, 'a', 'a'), numeroBebedouro: 'B1' },
    { ...reg('2026-10-05T12:00:00Z', { agua_suficiente: ok(true), vazao_bebedouro_ideal: ok(false) }, 'b', 'b'), numeroBebedouro: 'B1' },
    { ...reg('2026-10-02T12:00:00Z', { agua_suficiente: ok(false) }, 'c', 'c'), numeroBebedouro: 'B2' },
  ])

  it('resume contagens, mais antiga e tempo médio de resolução', () => {
    expect(resumoPendencias(dados.abertas, dados.resolvidas, agora)).toEqual({
      abertas: 2,
      bebedourosAfetados: 2,
      maisAntigaDias: 12,
      tempoMedioResolucaoDias: 4,
      resolvidasUltimos30Dias: 1,
    })
  })

  it('sem dados: nulos e zeros', () => {
    expect(resumoPendencias([], [], agora)).toEqual({ abertas: 0, bebedourosAfetados: 0, maisAntigaDias: null, tempoMedioResolucaoDias: null, resolvidasUltimos30Dias: 0 })
  })

  it('conta por item', () => {
    const linhas = porItem(dados.abertas, dados.resolvidas)
    expect(linhas.find((l) => l.chave === 'agua_suficiente')).toMatchObject({ abertas: 1, resolvidas: 1 })
    expect(linhas.find((l) => l.chave === 'vazao_bebedouro_ideal')).toMatchObject({ abertas: 1, resolvidas: 0 })
  })
})

describe('diasEntre', () => {
  it('conta dias inteiros e nunca fica negativo', () => {
    expect(diasEntre('2026-10-01T10:00:00Z', '2026-10-04T09:00:00Z')).toBe(2)
    expect(diasEntre('2026-10-04T10:00:00Z', '2026-10-01T10:00:00Z')).toBe(0)
  })
})
