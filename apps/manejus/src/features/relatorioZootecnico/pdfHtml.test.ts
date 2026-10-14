import { describe, expect, it } from 'vitest'

const ZOOTECNICO_PATH = '../../../api/pdf/zootecnico.js'

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
  it('divide em blocos, repete a linha Geral e pagina', async () => {
    const linhas = Array.from({ length: 30 }, (_, i) => [`Lote ${i + 1}`, '400,00', 'R$ 10,00'])
    const html = await renderZootecnicoHtml({
      fazendaNome: 'Fazenda X',
      janelaInicio: '2026-09-23',
      janelaFim: '2026-10-14',
      dias: 22,
      tabela: { colunas, geral: ['Geral', '410,00', 'R$ 99,00'], linhas },
    })
    expect(html).toContain('Identificação e desempenho')
    expect(html).toContain('Financeiro, consumo e meta')
    expect(html).toContain('Lote 30')
    expect(html).toContain('R$ 99,00')
    // 30 linhas / 13 por página = 3 páginas por bloco, 2 blocos
    expect((html.match(/<section class="page">/g) ?? []).length).toBe(6)
  })
})
