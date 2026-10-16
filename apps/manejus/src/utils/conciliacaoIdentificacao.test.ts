import { describe, it, expect } from 'vitest'
import {
  filtrarConciliacao,
  resumirConciliacao,
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
