import { describe, expect, it } from 'vitest'
import { calcularPendencias5s, pendenciasPorSetor, resumoPendencias5s, type RegistroPendencia5s } from './calculo'

// Mesmos casos de teste do PWA (frontend/src/utils/pendencias5s.test.ts): mudou um, mude o outro.
const reg = (
  data: string,
  itens: Record<string, string>,
  naoConformidades: Record<string, any> | null = null,
  localId?: string
): RegistroPendencia5s => ({ data, itens, naoConformidades, localId })

describe('calcularPendencias5s', () => {
  it('sem registros não há pendência', () => {
    expect(calcularPendencias5s([])).toEqual({ abertas: [], resolvidas: [] })
  })

  it('N abre a pendência com desde, observação, foto, texto e pilar', () => {
    const r = calcularPendencias5s([
      reg('2026-10-01T10:00:00Z', { utilizacao_1: 'N' }, { utilizacao_1: { observacao: 'Pneus velhos', foto_url: 'https://x/a.webp' } }),
    ])
    expect(r.abertas).toHaveLength(1)
    expect(r.abertas[0]).toMatchObject({
      chave: 'utilizacao_1',
      label: 'Há material em desuso no local.',
      secao: 'Utilização',
      desde: '2026-10-01T10:00:00Z',
      observacao: 'Pneus velhos',
      fotoUrl: 'https://x/a.webp',
      ocorrencias: 1,
    })
  })

  it('C posterior resolve e entra nas resolvidas', () => {
    const r = calcularPendencias5s([
      reg('2026-10-01T10:00:00Z', { limpeza_1: 'N' }),
      reg('2026-10-05T10:00:00Z', { limpeza_1: 'C' }),
    ])
    expect(r.abertas).toEqual([])
    expect(r.resolvidas).toEqual([
      expect.objectContaining({ chave: 'limpeza_1', abertaEm: '2026-10-01T10:00:00Z', resolvidaEm: '2026-10-05T10:00:00Z' }),
    ])
  })

  it('NA e item ausente não resolvem nem abrem', () => {
    const r = calcularPendencias5s([
      reg('2026-10-01T10:00:00Z', { limpeza_1: 'N' }),
      reg('2026-10-03T10:00:00Z', { limpeza_1: 'NA' }),
      reg('2026-10-05T10:00:00Z', {}),
    ])
    expect(r.abertas).toHaveLength(1)
    expect(r.abertas[0]).toMatchObject({ desde: '2026-10-01T10:00:00Z', ocorrencias: 1 })
    expect(r.resolvidas).toEqual([])
    expect(calcularPendencias5s([reg('2026-10-01T10:00:00Z', { limpeza_1: 'NA' })]).abertas).toEqual([])
  })

  it('"ainda pendente" sem observação/foto nova mantém a evidência original', () => {
    const r = calcularPendencias5s([
      reg('2026-10-01T10:00:00Z', { limpeza_1: 'N' }, { limpeza_1: { observacao: 'Chão sujo', foto_url: 'https://x/a.webp' } }),
      reg('2026-10-05T10:00:00Z', { limpeza_1: 'N' }, { limpeza_1: { observacao: '', pendencia: { situacao: 'mantida', desde: '2026-10-01T10:00:00Z' } } }),
    ])
    expect(r.abertas[0]).toMatchObject({ desde: '2026-10-01T10:00:00Z', observacao: 'Chão sujo', fotoUrl: 'https://x/a.webp', ocorrencias: 2, ultimaData: '2026-10-05T10:00:00Z' })
  })

  it('observação ou foto nova substitui a anterior', () => {
    const r = calcularPendencias5s([
      reg('2026-10-01T10:00:00Z', { limpeza_1: 'N' }, { limpeza_1: { observacao: 'a', foto_url: 'https://x/a.webp' } }),
      reg('2026-10-05T10:00:00Z', { limpeza_1: 'N' }, { limpeza_1: { observacao: 'b', foto_url: 'https://x/b.webp' } }),
    ])
    expect(r.abertas[0]).toMatchObject({ observacao: 'b', fotoUrl: 'https://x/b.webp' })
  })

  it('reabertura: N, C, N abre pendência nova desde o último N', () => {
    const r = calcularPendencias5s([
      reg('2026-10-01T10:00:00Z', { limpeza_1: 'N' }),
      reg('2026-10-03T10:00:00Z', { limpeza_1: 'C' }),
      reg('2026-10-08T10:00:00Z', { limpeza_1: 'N' }),
    ])
    expect(r.abertas[0]).toMatchObject({ desde: '2026-10-08T10:00:00Z', ocorrencias: 1 })
    expect(r.resolvidas).toHaveLength(1)
  })

  it('registros que chegam fora de ordem são ordenados por data', () => {
    const r = calcularPendencias5s([
      reg('2026-10-05T10:00:00Z', { limpeza_1: 'C' }),
      reg('2026-10-01T10:00:00Z', { limpeza_1: 'N' }),
    ])
    expect(r.abertas).toEqual([])
    expect(r.resolvidas).toHaveLength(1)
  })

  it('o mesmo registro vindo do servidor e do aparelho conta uma vez (dedupe por localId)', () => {
    const r = calcularPendencias5s([
      reg('2026-10-01T10:00:00Z', { limpeza_1: 'N' }, null, 'abc'),
      reg('2026-10-01T10:00:00Z', { limpeza_1: 'N' }, null, 'abc'),
    ])
    expect(r.abertas[0].ocorrencias).toBe(1)
  })

  it('legado: N sem nao_conformidades abre pendência sem evidência', () => {
    const r = calcularPendencias5s([reg('2026-10-01T10:00:00Z', { disciplina_2: 'N' }, null)])
    expect(r.abertas[0]).toMatchObject({ chave: 'disciplina_2', observacao: '', fotoUrl: null })
  })

  it('itens independentes e ordenação: a mais antiga primeiro', () => {
    const r = calcularPendencias5s([
      reg('2026-10-01T10:00:00Z', { limpeza_1: 'N' }),
      reg('2026-10-02T10:00:00Z', { utilizacao_1: 'N', limpeza_1: 'C' }),
    ])
    expect(r.abertas.map((p) => p.chave)).toEqual(['utilizacao_1'])
    expect(r.resolvidas.map((p) => p.chave)).toEqual(['limpeza_1'])
  })
})

describe('pendenciasPorSetor e resumo', () => {
  const regSetor = (setor: string, setorId: string | null, data: string, itens: Record<string, string>, id: string) => ({
    id,
    setor,
    setorId,
    data,
    itens,
    naoConformidades: null,
  })

  it('setores diferentes não se misturam: C em outro setor não resolve', () => {
    const r = pendenciasPorSetor([
      regSetor('Oficina', 's1', '2026-10-01T10:00:00Z', { limpeza_1: 'N' }, 'r1'),
      regSetor('Curral', 's2', '2026-10-05T10:00:00Z', { limpeza_1: 'C' }, 'r2'),
    ])
    expect(r.abertas).toHaveLength(1)
    expect(r.abertas[0]).toMatchObject({ setor: 'Oficina', registroDesdeId: 'r1' })
    expect(r.resolvidas).toEqual([])
  })

  it('setor renomeado (mesmo setor_id) continua o mesmo histórico, com o nome mais recente', () => {
    const r = pendenciasPorSetor([
      regSetor('Oficina', 's1', '2026-10-01T10:00:00Z', { limpeza_1: 'N' }, 'r1'),
      regSetor('Oficina Central', 's1', '2026-10-05T10:00:00Z', { limpeza_1: 'C' }, 'r2'),
    ])
    expect(r.abertas).toEqual([])
    expect(r.resolvidas[0]).toMatchObject({ setor: 'Oficina Central', registroResolvidaId: 'r2' })
  })

  it('resumo: abertas, setores afetados, mais antiga e tempo médio de resolução', () => {
    const { abertas, resolvidas } = pendenciasPorSetor([
      regSetor('Oficina', 's1', '2026-10-01T10:00:00Z', { limpeza_1: 'N', utilizacao_1: 'N' }, 'r1'),
      regSetor('Oficina', 's1', '2026-10-05T10:00:00Z', { limpeza_1: 'C' }, 'r2'),
    ])
    const resumo = resumoPendencias5s(abertas, resolvidas, '2026-10-11T10:00:00Z')
    expect(resumo).toEqual({ abertas: 1, setoresAfetados: 1, maisAntigaDias: 10, tempoMedioResolucaoDias: 4, resolvidasUltimos30Dias: 1 })
  })
})
