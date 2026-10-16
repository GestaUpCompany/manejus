import { describe, expect, it } from 'vitest'
import { CADERNETAS, CADERNETAS_EM_TESTE, FAZENDA_DE_TESTES_ID, cadernetaVisivelNaFazenda, cadernetasDaFazenda, gruposDaFazenda } from './cadernetas'

describe('cadernetas em teste (painel)', () => {
  it('só aparecem na fazenda de testes e ficam ocultas enquanto a fazenda é desconhecida', () => {
    for (const id of CADERNETAS_EM_TESTE) {
      expect(cadernetaVisivelNaFazenda(id, FAZENDA_DE_TESTES_ID)).toBe(true)
      expect(cadernetaVisivelNaFazenda(id, 'outra')).toBe(false)
      expect(cadernetaVisivelNaFazenda(id, null)).toBe(false)
    }
    expect(cadernetaVisivelNaFazenda('enfermaria', null)).toBe(true)
  })

  it('a lista e os grupos da fazenda omitem as cadernetas em teste', () => {
    const ids = (l: { id: string }[]) => l.map((c) => c.id)
    expect(ids(cadernetasDaFazenda('outra'))).not.toContain('sanidade')
    expect(ids(cadernetasDaFazenda('outra'))).not.toContain('manejo-curral')
    expect(ids(cadernetasDaFazenda('outra'))).not.toContain('reproducao')
    expect(cadernetasDaFazenda(FAZENDA_DE_TESTES_ID)).toHaveLength(CADERNETAS.length)
    const itens = gruposDaFazenda('outra').flatMap((g) => g.itens.map((i) => i.id))
    expect(itens).not.toContain('sanidade')
    expect(gruposDaFazenda(FAZENDA_DE_TESTES_ID).flatMap((g) => g.itens.map((i) => i.id))).toContain('sanidade')
  })
})
