import { describe, it, expect } from 'vitest'
import {
  filtrarConciliacao,
  qualificacaoPorLote,
  resumirConciliacao,
  resumirQualificacao,
  situacaoConciliacao,
  type LinhaConciliacao,
} from './conciliacaoIdentificacao'

const linha = (o: Partial<LinhaConciliacao>): LinhaConciliacao => ({
  lote_categoria_id: 'lc',
  lote_id: 'l',
  lote_nome: 'Lote A',
  categoria: 'vaca',
  quant_atual: 10,
  identificados: 0,
  incertos: 0,
  nao_identificados: 10,
  confirmados: 0,
  divergencia: false,
  ...o,
})

describe('conciliacaoIdentificacao', () => {
  it('divergência prevalece sobre incerteza; sem nenhuma é ok', () => {
    expect(situacaoConciliacao(linha({ divergencia: true, incertos: 2 }))).toBe('divergente')
    expect(situacaoConciliacao(linha({ incertos: 2 }))).toBe('incerta')
    expect(situacaoConciliacao(linha({}))).toBe('ok')
  })

  it('só lista linhas com identificados, divergentes primeiro', () => {
    const linhas = [
      linha({ lote_nome: 'B', identificados: 3 }),
      linha({ lote_nome: 'A', identificados: 0 }),
      linha({ lote_nome: 'C', identificados: 5, divergencia: true }),
      linha({ lote_nome: 'D', identificados: 4, incertos: 4 }),
    ]
    expect(filtrarConciliacao(linhas, 'todos').map((l) => l.lote_nome)).toEqual(['C', 'D', 'B'])
  })

  it('filtra divergentes e com incertos', () => {
    const linhas = [
      linha({ lote_nome: 'C', identificados: 5, divergencia: true }),
      linha({ lote_nome: 'D', identificados: 4, incertos: 4 }),
      linha({ lote_nome: 'B', identificados: 3 }),
    ]
    expect(filtrarConciliacao(linhas, 'divergentes').map((l) => l.lote_nome)).toEqual(['C'])
    expect(filtrarConciliacao(linhas, 'incertos').map((l) => l.lote_nome)).toEqual(['D'])
  })

  it('resume só o que tem identificados', () => {
    const linhas = [
      linha({ identificados: 5, divergencia: true }),
      linha({ identificados: 4, incertos: 4 }),
      linha({ identificados: 0 }),
    ]
    expect(resumirConciliacao(linhas)).toEqual({ categoriasComIdentificados: 2, identificados: 9, divergentes: 1, incertos: 4 })
  })
})

describe('qualificacaoPorLote', () => {
  it('sem nenhum identificado o lote fica só no agregado', () => {
    const [l] = qualificacaoPorLote([linha({ quant_atual: 10 })])
    expect(l).toMatchObject({ nivel: 'agregado', cabecas: 10, qualificadas: 0 })
  })

  it('é parcial enquanto alguma categoria com cabeças não está inteiramente confirmada', () => {
    const [l] = qualificacaoPorLote([
      linha({ lote_categoria_id: 'a', categoria: 'vaca', quant_atual: 10, identificados: 10, confirmados: 10 }),
      linha({ lote_categoria_id: 'b', categoria: 'bezerro', quant_atual: 8, identificados: 0 }),
    ])
    expect(l).toMatchObject({ nivel: 'parcial', cabecas: 18, qualificadas: 10 })
  })

  it('é completo quando toda categoria com cabeças tem confirmados >= quant_atual; categoria com 0 cabeças não conta', () => {
    const [l] = qualificacaoPorLote([
      linha({ lote_categoria_id: 'a', quant_atual: 5, identificados: 5, confirmados: 5 }),
      linha({ lote_categoria_id: 'b', categoria: 'novilha', quant_atual: 0, identificados: 0 }),
    ])
    expect(l.nivel).toBe('completo')
  })

  it('lote com divergência não é completo, mesmo com as categorias com cabeças confirmadas', () => {
    const [l] = qualificacaoPorLote([
      linha({ lote_categoria_id: 'a', quant_atual: 1, identificados: 1, confirmados: 1 }),
      linha({ lote_categoria_id: 'b', categoria: 'novilha', quant_atual: 0, identificados: 1, confirmados: 1, divergencia: true }),
    ])
    expect(l).toMatchObject({ nivel: 'parcial', divergente: true })
  })

  it('identificados incertos não completam o lote, e excesso confirmado não passa da contagem', () => {
    const [incerto] = qualificacaoPorLote([linha({ quant_atual: 5, identificados: 5, confirmados: 3, incertos: 2 })])
    expect(incerto).toMatchObject({ nivel: 'parcial', qualificadas: 3, incertos: 2 })
    const [excesso] = qualificacaoPorLote([linha({ quant_atual: 4, identificados: 6, confirmados: 6, divergencia: true })])
    expect(excesso).toMatchObject({ qualificadas: 4, divergente: true })
  })

  it('resume a fazenda: fração de cabeças qualificadas e lotes por nível', () => {
    const lotes = qualificacaoPorLote([
      linha({ lote_id: 'x', lote_categoria_id: '1', quant_atual: 10, identificados: 10, confirmados: 10 }),
      linha({ lote_id: 'y', lote_categoria_id: '2', quant_atual: 30 }),
    ])
    const r = resumirQualificacao(lotes)
    expect(r).toMatchObject({ cabecas: 40, qualificadas: 10, lotesPorNivel: { agregado: 1, parcial: 0, completo: 1 } })
    expect(r.fracao).toBeCloseTo(0.25)
    expect(resumirQualificacao([]).fracao).toBe(0)
  })
})
