import { describe, expect, it } from 'vitest'
import { dietaAtual, dietasAnteriores, eventosDeDietaDoLote, type PlanoDoLote } from './dietaDoLote'

const plano = (o: Partial<PlanoDoLote>): PlanoDoLote => ({
  id: 'p',
  nome: 'Confina',
  lote_id: 'L',
  lote_categoria_id: null,
  ativo: true,
  data_inicio: '2026-09-01',
  data_fim: null,
  gmd_planejado: null,
  peso_meta_kg: null,
  formulacao: 'Confina Completo',
  ...o,
})

const hoje = '2026-10-16'

describe('dietaAtual', () => {
  it('devolve o plano vigente mais recente', () => {
    const antigo = plano({ id: 'a', data_inicio: '2026-08-01', data_fim: null })
    const novo = plano({ id: 'b', data_inicio: '2026-10-01' })
    expect(dietaAtual([antigo, novo], hoje)?.id).toBe('b')
  })

  it('ignora plano inativo sem fim, que ainda não começou ou que já terminou', () => {
    expect(dietaAtual([plano({ ativo: false })], hoje)).toBeNull()
    expect(dietaAtual([plano({ data_inicio: '2026-11-01' })], hoje)).toBeNull()
    expect(dietaAtual([plano({ ativo: false, data_fim: '2026-10-10' })], hoje)).toBeNull()
  })

  it('plano com fim futuro ou igual a hoje ainda vale', () => {
    expect(dietaAtual([plano({ ativo: false, data_fim: '2026-10-16' })], hoje)?.id).toBe('p')
  })
})

describe('dietasAnteriores', () => {
  it('lista só as encerradas, da mais recente para a mais antiga', () => {
    const r = dietasAnteriores(
      [
        plano({ id: 'x', ativo: false, data_fim: '2026-07-01' }),
        plano({ id: 'y', ativo: false, data_fim: '2026-09-15' }),
        plano({ id: 'z' }),
      ],
      hoje
    )
    expect(r.map((p) => p.id)).toEqual(['y', 'x'])
  })
})

describe('eventosDeDietaDoLote', () => {
  const planos = [
    plano({ id: 'a', nome: 'Adaptação', data_inicio: '2026-08-01', data_fim: '2026-09-01', ativo: false }),
    plano({ id: 'b', nome: 'Terminação', data_inicio: '2026-09-01', formulacao: 'Terminação Boi' }),
  ]

  it('só inclui mudanças depois que o animal entrou no lote e até a saída ou hoje', () => {
    const r = eventosDeDietaDoLote(planos, '2026-08-15', hoje)
    expect(r.map((e) => [e.data, e.titulo])).toEqual([
      ['2026-09-01', 'Dieta do lote iniciada: Terminação'],
      ['2026-09-01', 'Dieta do lote encerrada: Adaptação'],
    ])
    expect(eventosDeDietaDoLote(planos, '2026-08-15', '2026-08-31')).toHaveLength(0)
  })

  it('sem data de entrada conhecida inclui tudo até a data limite; plano sem data não gera evento', () => {
    expect(eventosDeDietaDoLote(planos, null, hoje)).toHaveLength(3)
    expect(eventosDeDietaDoLote([plano({ data_inicio: null })], null, hoje)).toHaveLength(0)
  })
})
