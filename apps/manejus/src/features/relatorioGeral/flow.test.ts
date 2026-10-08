import { describe, expect, it } from 'vitest'

const FLOW_PATH = '../../../api/pdf/_shared/flowEngine.js'

type Bloco = {
  kind: 'fixed' | 'table'
  h?: number
  mb?: number
  breakBefore?: boolean
  keepNext?: boolean
  titleH?: number
  headH?: number
  rowsH?: number[]
  minRows?: number
}
type Entrada = { i: number; from?: number; to?: number }

async function pack(capacity: number, blocks: Bloco[]): Promise<Entrada[][]> {
  const module = await import(FLOW_PATH)
  return module.packFlow(capacity, blocks)
}

const fixo = (h: number, extra: Partial<Bloco> = {}): Bloco => ({ kind: 'fixed', h, mb: 0, ...extra })
const tabela = (n: number, rowH = 10, extra: Partial<Bloco> = {}): Bloco => ({ kind: 'table', titleH: 20, headH: 20, rowsH: Array(n).fill(rowH), mb: 0, minRows: 2, ...extra })

describe('paginador de fluxo', () => {
  it('não gera páginas quando não há blocos nem linhas', async () => {
    expect(await pack(100, [])).toEqual([])
    expect(await pack(100, [tabela(0)])).toEqual([])
  })

  it('agrupa vários blocos pequenos numa só página', async () => {
    const paginas = await pack(130, [fixo(30), fixo(30), tabela(2, 10)])
    expect(paginas).toHaveLength(1)
    expect(paginas[0]).toHaveLength(3)
  })

  it('abre nova página quando o bloco indivisível não cabe', async () => {
    const paginas = await pack(100, [fixo(60), fixo(60)])
    expect(paginas.map((p) => p.length)).toEqual([1, 1])
  })

  it('bloco maior que a página fica sozinho (sem loop infinito)', async () => {
    const paginas = await pack(100, [fixo(250), fixo(10)])
    expect(paginas).toHaveLength(2)
  })

  it('divide a tabela por espaço, repetindo cabeçalho em cada fatia e cobrindo todas as linhas', async () => {
    const paginas = await pack(100, [tabela(20, 10)])
    const fatias = paginas.flat()
    expect(fatias.length).toBeGreaterThan(1)
    let esperado = 0
    for (const f of fatias) {
      expect(f.from).toBe(esperado)
      expect(f.to! - f.from!).toBeGreaterThan(0)
      // título + cabeçalho (40) + linhas (10) cabem em 100
      expect(40 + (f.to! - f.from!) * 10).toBeLessThanOrEqual(100)
      esperado = f.to!
    }
    expect(esperado).toBe(20)
  })

  it('várias tabelas pequenas dividem a mesma página', async () => {
    const paginas = await pack(200, [tabela(2, 10), tabela(2, 10), tabela(2, 10)])
    expect(paginas).toHaveLength(1)
  })

  it('nunca começa uma tabela sem espaço para título, cabeçalho e as primeiras linhas', async () => {
    // sobra 55: título+cabeçalho (40) + 1 linha (10) caberia, mas o mínimo é 2 linhas (60)
    const paginas = await pack(100, [fixo(45), tabela(5, 10)])
    expect(paginas).toHaveLength(2)
    expect(paginas[1][0]).toMatchObject({ i: 1, from: 0 })
  })

  it('tabela de linha única cabe com minRows maior que o total', async () => {
    const paginas = await pack(100, [fixo(30), tabela(1, 10, { minRows: 3 })])
    expect(paginas).toHaveLength(1)
  })

  it('respeita quebra de página forçada', async () => {
    const paginas = await pack(300, [fixo(10), fixo(10, { breakBefore: true })])
    expect(paginas).toHaveLength(2)
  })

  it('keepNext não deixa a introdução sozinha no fim da página', async () => {
    const paginas = await pack(100, [fixo(70), fixo(10, { keepNext: true }), fixo(30)])
    // 70 + 10 + 30 > 100: a introdução vai junto com o bloco seguinte
    expect(paginas).toHaveLength(2)
    expect(paginas[1].map((e) => e.i)).toEqual([1, 2])
  })

  it('o total de linhas distribuídas é sempre o total de linhas (propriedade)', async () => {
    for (const n of [1, 2, 3, 7, 18, 19, 40, 123]) {
      for (const cap of [90, 130, 400]) {
        const paginas = await pack(cap, [fixo(25), tabela(n, 9.5), fixo(15)])
        const soma = paginas.flat().filter((e) => e.i === 1).reduce((s, e) => s + (e.to! - e.from!), 0)
        expect(soma).toBe(n)
      }
    }
  })
})
