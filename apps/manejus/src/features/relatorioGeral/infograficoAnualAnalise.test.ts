import { describe, expect, it } from 'vitest'

const ANALISE = '../../../api/pdf/_relatorios/anual/analise.js'
const COMUM = '../../../api/pdf/_relatorios/anual/comum.js'
const SECOES = '../../../api/pdf/_relatorios/anual/secoes.js'

const mensal = (valores: number[], campo = 'mortes') => valores.map((v, i) => ({ mes: i + 1, [campo]: v }))

describe('Infográfico Anual: análise', () => {
  it('variação: tom pelo sentido bom da métrica e "sem base" sem ano anterior', async () => {
    const { variacao } = await import(COMUM)
    expect(variacao(12, 10, { bom: 'baixo', anoAnterior: 2025 })).toEqual({ texto: '▲ +20% vs 2025', tom: 'ruim' })
    expect(variacao(8, 10, { bom: 'baixo', anoAnterior: 2025 })).toEqual({ texto: '▼ −20% vs 2025', tom: 'bom' })
    expect(variacao(12, 10, { bom: 'neutro', anoAnterior: 2025 }).tom).toBe('neutro')
    expect(variacao(5, 0, { anoAnterior: 2025 })).toEqual({ texto: 'sem base em 2025', tom: 'sem' })
    expect(variacao(3.4, 3.1, { bom: 'alto', anoAnterior: 2025, absoluta: true, unidade: 'pt', casas: 1 }).texto).toBe('▲ +0,3 pt vs 2025')
  })

  it('compara no mesmo período: o ano anterior é recortado até o último mês do ano atual', async () => {
    const { comparador } = await import(ANALISE)
    const atual = { ano: 2026, ultimo_mes: 3, mensal: mensal([1, 1, 1]) }
    // 2025 teve 3 mortes até março e 100 depois: a comparação usa só jan–mar.
    const anterior = { mensal: mensal([1, 1, 1, 50, 50, 0, 0, 0, 0, 0, 0, 0]) }
    const cmp = comparador('morte', { ...atual, __anterior: anterior })
    expect(cmp.atual('mortes')).toBe(3)
    expect(cmp.anterior('mortes')).toBe(3)
    expect(cmp.delta('mortes')).toEqual({ texto: '= 2025', tom: 'neutro' })
    expect(comparador('morte', atual).delta('mortes')).toBeNull()
  })

  it('regras de exceção', async () => {
    const { mesForaDoPadrao, concentracao, lacuna, variacaoForte, comparador } = await import(ANALISE)
    expect(mesForaDoPadrao([2, 2, 3, 10, 0], { nome: 'mortes' })).toBe('Abril concentrou 10 de mortes, 4,0× a mediana dos meses com registro.')
    expect(mesForaDoPadrao([2, 0, 3])).toBeNull()
    expect(concentracao([{ rotulo: 'Lote A', valor: 60 }, { rotulo: 'Lote B', valor: 40 }], 100, { oque: 'do custo' })).toBe('Lote A responde por 60% do custo.')
    expect(concentracao([{ rotulo: 'Lote A', valor: 40 }, { rotulo: 'Lote B', valor: 60 }], 200, { oque: 'do custo' })).toBeNull()
    expect(lacuna([0, 0, 5, 0, 0], 5, { oque: 'rodeio lançado' })).toMatch(/^Sem rodeio lançado em 4 de 5 meses/)
    expect(lacuna([0, 0, 0], 3, { oque: 'x' })).toBeNull()
    const cmp = comparador('morte', { ano: 2026, ultimo_mes: 2, mensal: mensal([10, 10]), __anterior: { mensal: mensal([5, 5]) } })
    expect(variacaoForte(cmp, 'mortes')).toBe('Mortes 100% acima do mesmo período de 2025.')
  })

  it('PDF da seção mostra selo, tendência com o ano anterior e pontos de atenção', async () => {
    const { renderMorteAnual } = await import(SECOES)
    const d = {
      ano: 2026,
      ultimo_mes: 4,
      kpis: { mortes: 20, taxa_mortalidade: 4, rebanho_medio: 500, perda_estimada: 0, peso_total: 0, mortes_com_peso: 0, causa_principal: 'Cobra' },
      mensal: [1, 2, 3, 4].map((mes) => ({ mes, mortes: 5, rebanho: 500, taxa: 1, perda: 0 })),
      por_causa: [{ label: 'Cobra', valor: 15 }, { label: 'Raio', valor: 5 }],
      por_categoria: [],
      matriz: [],
      __anterior: { mensal: [1, 2, 3, 4].map((mes) => ({ mes, mortes: 2, rebanho: 500, perda: 0 })) },
      __marca: { fazendaNome: 'F', logoGestao: '', logoFazenda: '' },
    }
    const html = await renderMorteAnual(d)
    expect(html).toContain('▲ +150% vs 2025')
    expect(html).toContain('ak-d-ruim')
    expect(html).toContain('Tendência')
    expect(html).toContain('Pontos de atenção')
    expect(html).toContain('Cobra responde por 75% das mortes do ano.')
  })
})
