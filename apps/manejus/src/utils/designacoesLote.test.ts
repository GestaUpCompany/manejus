import { describe, expect, it } from 'vitest'
import { agruparDesignacoes, identificacaoDoAnimal, linhasParaDesignacoes, type DesignacaoPendente, type LinhaDesignacao } from './designacoesLote'

const d = (id: string, over: Partial<DesignacaoPendente> = {}): DesignacaoPendente => ({
  id,
  individuo_id: `i-${id}`,
  identificacao: id,
  categoria: 'Boi Gordo',
  lote_origem_id: 'A',
  lote_origem_nome: 'Lote A',
  lote_destino_id: 'T',
  lote_destino_nome: 'Teste 3',
  created_at: '2026-10-16',
  ...over,
})

describe('agruparDesignacoes', () => {
  it('junta animais com mesma origem, destino e categoria (ignorando caixa e espaços)', () => {
    const g = agruparDesignacoes([d('1'), d('2', { categoria: ' boi  gordo ' }), d('3')])
    expect(g).toHaveLength(1)
    expect(g[0].pendencias.map((p) => p.id)).toEqual(['1', '2', '3'])
  })

  it('separa por categoria, origem e destino', () => {
    const g = agruparDesignacoes([
      d('1'),
      d('2', { categoria: 'Garrote' }),
      d('3', { lote_origem_id: 'B', lote_origem_nome: 'Lote B' }),
      d('4', { lote_destino_id: 'U', lote_destino_nome: 'Lote U' }),
    ])
    expect(g).toHaveLength(4)
  })

  it('ordena por destino, origem e categoria', () => {
    const g = agruparDesignacoes([d('1', { lote_destino_nome: 'Z', lote_destino_id: 'z' }), d('2', { lote_destino_nome: 'A', lote_destino_id: 'a' })])
    expect(g.map((x) => x.lote_destino_nome)).toEqual(['A', 'Z'])
  })

  it('lista vazia não gera grupo', () => {
    expect(agruparDesignacoes([])).toEqual([])
  })
})

describe('linhasParaDesignacoes', () => {
  const linha = (over: Partial<LinhaDesignacao> = {}): LinhaDesignacao => ({
    id: 'p1',
    individuo_id: 'i1',
    lote_origem_id: 'A',
    lote_destino_id: 'T',
    created_at: '2026-10-16',
    individuo: { id_brinco: 'B-1', id_chip: null, id_manejo: null, id_provisorio_cria: null, categoria: 'Boi Gordo' },
    origem: { nome: 'Lote A' },
    destino: { nome: 'Teste 3' },
    ...over,
  })

  it('converte e ignora pendência sem lote de origem', () => {
    const r = linhasParaDesignacoes([linha(), linha({ id: 'p2', lote_origem_id: null })])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: 'p1', identificacao: 'B-1', categoria: 'Boi Gordo', lote_origem_nome: 'Lote A', lote_destino_nome: 'Teste 3' })
  })

  it('usa textos padrão quando faltam joins', () => {
    const r = linhasParaDesignacoes([linha({ individuo: null, origem: null, destino: null })])
    expect(r[0]).toMatchObject({ identificacao: 'Animal sem identificação', categoria: 'Sem categoria', lote_origem_nome: 'Origem', lote_destino_nome: 'Destino' })
  })
})

describe('identificacaoDoAnimal', () => {
  it('prefere manejo, depois brinco, chip e provisório', () => {
    expect(identificacaoDoAnimal({ id_manejo: 'M', id_brinco: 'B', id_chip: 'C', id_provisorio_cria: 'P', categoria: null })).toBe('M')
    expect(identificacaoDoAnimal({ id_manejo: null, id_brinco: null, id_chip: null, id_provisorio_cria: 'P', categoria: null })).toBe('P')
  })
})
