import { describe, expect, it } from 'vitest'
import {
  calcularPendencias,
  diasEntre,
  pendenciasPorLote,
  porItem,
  resumoPendencias,
  type RegistroDiagnosticoRodeio,
} from './calculo'

const reg = (data: string, diagnosticos: Record<string, any> | null, localId?: string, id?: string): RegistroDiagnosticoRodeio => ({ data, diagnosticos, localId, id })
const item = (valor: string | boolean, extra: Record<string, unknown> = {}) => ({ valor, observacao: '', ...extra })

// Mesmos cenários de frontend/src/utils/pendenciasRodeio.test.ts (PWA)
describe('calcularPendencias (regra compartilhada com o PWA)', () => {
  it('sem registros não há pendência', () => {
    expect(calcularPendencias([])).toEqual({ abertas: [], resolvidas: [] })
  })

  it("'N' é problema: fica aberto com desde, observação e foto", () => {
    const r = calcularPendencias([reg('2026-10-01T10:00:00Z', { cercasCochosPorteiras: item('N', { observacao: 'Arame solto', foto_url: 'https://x/a.webp' }) }, 'a', 'id-a')])
    expect(r.abertas).toHaveLength(1)
    expect(r.abertas[0]).toMatchObject({
      chave: 'cercasCochosPorteiras',
      desde: '2026-10-01T10:00:00Z',
      observacao: 'Arame solto',
      fotoUrl: 'https://x/a.webp',
      ocorrencias: 1,
      registroDesdeId: 'id-a',
    })
  })

  it("um 'S' posterior resolve e entra nas resolvidas", () => {
    const r = calcularPendencias([
      reg('2026-10-01T10:00:00Z', { bebedourosCochos: item('N') }, 'a', 'id-a'),
      reg('2026-10-05T10:00:00Z', { bebedourosCochos: item('S') }, 'b', 'id-b'),
    ])
    expect(r.abertas).toEqual([])
    expect(r.resolvidas).toEqual([
      expect.objectContaining({ chave: 'bebedourosCochos', abertaEm: '2026-10-01T10:00:00Z', resolvidaEm: '2026-10-05T10:00:00Z', registroResolvidaId: 'id-b' }),
    ])
  })

  it('"ainda pendente" sem foto/observação nova mantém a evidência original', () => {
    const r = calcularPendencias([
      reg('2026-10-01T10:00:00Z', { bebedourosCochos: item('N', { observacao: 'Cocho quebrado', foto_url: 'https://x/a.webp' }) }),
      reg('2026-10-05T10:00:00Z', { bebedourosCochos: item('N') }),
    ])
    expect(r.abertas[0]).toMatchObject({ desde: '2026-10-01T10:00:00Z', observacao: 'Cocho quebrado', fotoUrl: 'https://x/a.webp', ocorrencias: 2 })
  })

  it('reabertura: N, S, N abre pendência nova desde o último N', () => {
    const r = calcularPendencias([
      reg('2026-10-01T10:00:00Z', { bebedourosCochos: item('N') }),
      reg('2026-10-03T10:00:00Z', { bebedourosCochos: item('S') }),
      reg('2026-10-08T10:00:00Z', { bebedourosCochos: item('N') }),
    ])
    expect(r.abertas[0]).toMatchObject({ desde: '2026-10-08T10:00:00Z', ocorrencias: 1 })
    expect(r.resolvidas).toHaveLength(1)
  })

  it('valor vazio, nulo ou ausente não resolve nem abre', () => {
    const r = calcularPendencias([
      reg('2026-10-01T10:00:00Z', { bebedourosCochos: item('N') }),
      reg('2026-10-03T10:00:00Z', { bebedourosCochos: item('') }),
      reg('2026-10-04T10:00:00Z', null),
    ])
    expect(r.abertas).toHaveLength(1)
    expect(r.resolvidas).toEqual([])
  })

  it('itens fora da lista não geram pendência', () => {
    expect(calcularPendencias([reg('2026-10-01T10:00:00Z', { animalMorto: item('S'), carrapatosMoscas: item('S') })]).abertas).toEqual([])
  })

  it('usa a data do evento, não a ordem de chegada', () => {
    const r = calcularPendencias([
      reg('2026-10-05T10:00:00Z', { bebedourosCochos: item('S') }, 'b'),
      reg('2026-10-01T10:00:00Z', { bebedourosCochos: item('N') }, 'a'),
    ])
    expect(r.abertas).toEqual([])
    expect(r.resolvidas).toHaveLength(1)
  })

  it('o mesmo rodeio vindo duas vezes conta uma só', () => {
    const r = calcularPendencias([
      reg('2026-10-01T10:00:00Z', { bebedourosCochos: item('N') }, 'x'),
      reg('2026-10-01T10:00:00Z', { bebedourosCochos: item('N') }, 'x'),
    ])
    expect(r.abertas[0].ocorrencias).toBe(1)
  })

  it('aceita booleano legado (true = conforme)', () => {
    const r = calcularPendencias([
      reg('2026-10-01T10:00:00Z', { bebedourosCochos: item('N') }),
      reg('2026-10-02T10:00:00Z', { bebedourosCochos: item(true) }),
    ])
    expect(r.abertas).toEqual([])
    expect(r.resolvidas).toHaveLength(1)
  })
})

describe('pendenciasPorLote', () => {
  const l = (loteId: string | null, lote: string | null, r: RegistroDiagnosticoRodeio) => ({ ...r, loteId, lote })

  it('agrupa por lote_id: um lote resolvido não apaga a pendência de outro', () => {
    const r = pendenciasPorLote([
      l('L1', 'Lote 1', reg('2026-10-01T10:00:00Z', { bebedourosCochos: item('N') }, 'a')),
      l('L2', 'Lote 2', reg('2026-10-02T10:00:00Z', { bebedourosCochos: item('S') }, 'b')),
    ])
    expect(r.abertas.map((p) => p.lote)).toEqual(['Lote 1'])
    expect(r.resolvidas).toEqual([])
  })

  it('renomear o lote não quebra o histórico (mesmo lote_id)', () => {
    const r = pendenciasPorLote([
      l('L1', 'Lote velho', reg('2026-10-01T10:00:00Z', { bebedourosCochos: item('N') }, 'a')),
      l('L1', 'Lote novo', reg('2026-10-05T10:00:00Z', { bebedourosCochos: item('S') }, 'b')),
    ])
    expect(r.abertas).toEqual([])
    expect(r.resolvidas[0].lote).toBe('Lote novo')
  })

  it('sem lote_id agrupa pelo nome sem caixa; sem id e sem nome ignora', () => {
    const r = pendenciasPorLote([
      l(null, 'Lote 1', reg('2026-10-01T10:00:00Z', { bebedourosCochos: item('N') }, 'a')),
      l(null, ' lote 1 ', reg('2026-10-05T10:00:00Z', { bebedourosCochos: item('S') }, 'b')),
      l(null, null, reg('2026-10-06T10:00:00Z', { bebedourosCochos: item('N') }, 'c')),
    ])
    expect(r.abertas).toEqual([])
    expect(r.resolvidas).toHaveLength(1)
  })
})

describe('resumo e por item', () => {
  it('conta abertas, lotes afetados, mais antiga e tempo médio', () => {
    const { abertas, resolvidas } = pendenciasPorLote([
      { loteId: 'L1', lote: 'Lote 1', ...reg('2026-10-01T10:00:00Z', { bebedourosCochos: item('N'), pastagensTaxaLotacao: item('N') }, 'a') },
      { loteId: 'L1', lote: 'Lote 1', ...reg('2026-10-04T10:00:00Z', { bebedourosCochos: item('S'), pastagensTaxaLotacao: item('N') }, 'b') },
    ])
    const r = resumoPendencias(abertas, resolvidas, '2026-10-11T10:00:00Z')
    expect(r).toMatchObject({ abertas: 1, lotesAfetados: 1, maisAntigaDias: 10, tempoMedioResolucaoDias: 3, resolvidasUltimos30Dias: 1 })
    expect(porItem(abertas, resolvidas).find((i) => i.chave === 'bebedourosCochos')).toMatchObject({ abertas: 0, resolvidas: 1 })
  })

  it('diasEntre nunca fica negativo', () => {
    expect(diasEntre('2026-10-04T10:00:00Z', '2026-10-01T10:00:00Z')).toBe(0)
  })
})
