import { describe, expect, it } from 'vitest'
import { buscarTodasAsPaginas } from './paginar'

const fonte = (total: number) => {
  const linhas = Array.from({ length: total }, (_, i) => ({ i }))
  const chamadas: [number, number][] = []
  return {
    chamadas,
    buscar: async (de: number, ate: number) => {
      chamadas.push([de, ate])
      return { data: linhas.slice(de, ate + 1), error: null }
    },
  }
}

describe('buscarTodasAsPaginas', () => {
  it('junta todas as páginas: 2.350 linhas com páginas de 1.000 = 3 requisições', async () => {
    const f = fonte(2350)
    const r = await buscarTodasAsPaginas(f.buscar, 1000)
    expect(r).toHaveLength(2350)
    expect(f.chamadas).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('total múltiplo exato do tamanho faz uma requisição extra vazia (e não trunca)', async () => {
    const f = fonte(2000)
    expect(await buscarTodasAsPaginas(f.buscar, 1000)).toHaveLength(2000)
    expect(f.chamadas).toHaveLength(3)
  })

  it('menos que uma página: uma requisição; vazio: lista vazia', async () => {
    const f = fonte(5)
    expect(await buscarTodasAsPaginas(f.buscar, 1000)).toHaveLength(5)
    expect(f.chamadas).toHaveLength(1)
    expect(await buscarTodasAsPaginas(fonte(0).buscar, 1000)).toEqual([])
  })

  it('erro em qualquer página interrompe e propaga', async () => {
    let n = 0
    await expect(
      buscarTodasAsPaginas(async () => (++n === 2 ? { data: null, error: { message: 'falhou' } } : { data: Array.from({ length: 10 }, () => ({})), error: null }), 10)
    ).rejects.toThrow('falhou')
  })

  it('servidor que ignora o range (sempre devolve a página cheia) não gera loop infinito', async () => {
    const r = await buscarTodasAsPaginas(async () => ({ data: Array.from({ length: 10 }, () => ({})), error: null }), 10)
    expect(r.length).toBe(1000)
  })
})
