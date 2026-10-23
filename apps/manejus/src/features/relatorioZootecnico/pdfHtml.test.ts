import { describe, expect, it } from 'vitest'

const ZOOTECNICO_PATH = '../../../api/pdf/_relatorios/zootecnico.js'

async function renderZootecnicoHtml(input: unknown): Promise<string> {
  const module = await import(ZOOTECNICO_PATH)
  return module.renderZootecnicoHtml(input)
}

const colunas = [
  { grupo: 'Identificação', header: 'Lote', tipo: 'texto' },
  { grupo: 'Desempenho', header: 'Peso atual (kg)', tipo: 'num2' },
  { grupo: 'Financeiro', header: 'Valor estoque (R$)', tipo: 'brl' },
]

describe('HTML do PDF zootécnico', () => {
  it('divide em seções e blocos para o motor de fluxo', async () => {
    const linhas = Array.from({ length: 30 }, (_, i) => [`Lote ${i + 1}`, '400,00', 'R$ 10,00'])
    const html = await renderZootecnicoHtml({
      fazendaNome: 'Fazenda X',
      janelaInicio: '2026-09-23',
      janelaFim: '2026-10-14',
      dias: 22,
      tabela: {
        colunas,
        geral: ['Geral', '410,00', 'R$ 99,00'],
        secoes: [
          { titulo: 'Lotes a pasto', total: ['Total', '1,00', 'R$ 1,00'], linhas },
          { titulo: 'Lotes em currais (confinamento)', total: ['Total', '2,00', 'R$ 2,00'], linhas: linhas.slice(0, 2) },
        ],
      },
    })
    expect(html).toContain('Identificação e desempenho')
    expect(html).toContain('Financeiro, consumo e meta')
    expect(html).toContain('Lote 30')
    expect(html).toContain('R$ 99,00')
    expect(html).toContain('Lotes em currais (confinamento)')
    // 2 seções x 2 blocos, paginados no Chromium pelo motor de fluxo
    expect((html.match(/fb fb-table/g) ?? []).length).toBe(4)
    expect(html).toContain('data-flow-head')
    // Geral e total no thead (repetem em cada página)
    expect(html).toMatch(/<thead>.*zoo-geral.*zoo-total.*<\/thead>/s)
  })
})
