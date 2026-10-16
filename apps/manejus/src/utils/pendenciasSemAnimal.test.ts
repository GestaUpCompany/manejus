import { describe, expect, it } from 'vitest'
import type { LinhaConciliacao } from './conciliacaoIdentificacao'
import { apartacoesSemAnimalSugeridas, mortesSemAnimalSugeridas } from './pendenciasSemAnimal'

const linha = (o: Partial<LinhaConciliacao>): LinhaConciliacao => ({
  lote_categoria_id: 'lc',
  lote_id: 'L1',
  lote_nome: 'Lote 1',
  categoria: 'vaca',
  quant_atual: 10,
  identificados: 0,
  incertos: 0,
  nao_identificados: 10,
  confirmados: 0,
  divergencia: false,
  ...o,
})

describe('mortesSemAnimalSugeridas', () => {
  const morte = (o: object) => ({ id: 'm', data: '2026-10-10', lote_id: 'L1', categoria: 'Vaca', individuo_id: null, ...o })

  it('sugere só mortes sem animal, em lote e categoria que têm identificados', () => {
    const linhas = [linha({ identificados: 3 })]
    expect(mortesSemAnimalSugeridas([morte({})], linhas)).toHaveLength(1)
    expect(mortesSemAnimalSugeridas([morte({ individuo_id: 'x' })], linhas)).toHaveLength(0)
    expect(mortesSemAnimalSugeridas([morte({ categoria: 'garrote' })], linhas)).toHaveLength(0)
    expect(mortesSemAnimalSugeridas([morte({ lote_id: 'L2' })], linhas)).toHaveLength(0)
  })

  it('lote sem nenhum identificado (só agregado) não gera pendência', () => {
    expect(mortesSemAnimalSugeridas([morte({})], [linha({ identificados: 0 })])).toHaveLength(0)
  })
})

describe('apartacoesSemAnimalSugeridas', () => {
  const mov = (o: object) => ({ id: 'a', data: '2026-10-10', lote_origem_id: 'L1', lote_destino_id: 'L2', categoria: 'vaca', numero_cabecas: 5, ...o })

  it('sugere quando origem ou destino tem incertos na categoria e faltam animais informados', () => {
    const linhas = [linha({ identificados: 4, incertos: 2 })]
    expect(apartacoesSemAnimalSugeridas([mov({})], linhas, new Map())).toHaveLength(1)
    expect(apartacoesSemAnimalSugeridas([mov({ lote_origem_id: 'L2', lote_destino_id: 'L1' })], linhas, new Map())).toHaveLength(1)
  })

  it('não sugere sem incertos, com todos os animais informados ou fora do padrão de apartação', () => {
    const comIncertos = [linha({ identificados: 4, incertos: 2 })]
    expect(apartacoesSemAnimalSugeridas([mov({})], [linha({ identificados: 4 })], new Map())).toHaveLength(0)
    expect(apartacoesSemAnimalSugeridas([mov({})], comIncertos, new Map([['a', 5]]))).toHaveLength(0)
    expect(apartacoesSemAnimalSugeridas([mov({ lote_destino_id: 'L1' })], comIncertos, new Map())).toHaveLength(0)
    expect(apartacoesSemAnimalSugeridas([mov({ numero_cabecas: 0 })], comIncertos, new Map())).toHaveLength(0)
  })
})
