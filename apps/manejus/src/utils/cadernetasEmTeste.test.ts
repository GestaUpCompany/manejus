import { describe, expect, it } from 'vitest'
import { CADERNETAS, CADERNETAS_EM_TESTE, FAZENDA_DE_TESTES_ID, cadernetaVisivelNaFazenda, cadernetasDaFazenda, gruposDaFazenda, menuControleIndividualVisivel } from './cadernetas'

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

describe('protocolo de IATF (painel)', () => {
  it('está em teste: só a fazenda de testes libera (páginas, diagnóstico por lote de protocolo e menu)', () => {
    expect(CADERNETAS_EM_TESTE).toContain('protocolo-iatf')
    expect(cadernetaVisivelNaFazenda('protocolo-iatf', FAZENDA_DE_TESTES_ID)).toBe(true)
    expect(cadernetaVisivelNaFazenda('protocolo-iatf', 'outra')).toBe(false)
    expect(cadernetaVisivelNaFazenda('protocolo-iatf', null)).toBe(false)
    expect(cadernetaVisivelNaFazenda('protocolo-iatf', undefined)).toBe(false)
    expect(cadernetasDaFazenda('outra').map((c) => c.id)).not.toContain('protocolo-iatf')
    expect(cadernetasDaFazenda(FAZENDA_DE_TESTES_ID).map((c) => c.id)).toContain('protocolo-iatf')
  })
})

describe('menu Controle Individual (painel)', () => {
  it('só a fazenda de testes vê; outra fazenda ou fazenda desconhecida não', () => {
    expect(menuControleIndividualVisivel(FAZENDA_DE_TESTES_ID)).toBe(true)
    expect(menuControleIndividualVisivel('outra')).toBe(false)
    expect(menuControleIndividualVisivel(null)).toBe(false)
    expect(menuControleIndividualVisivel(undefined)).toBe(false)
  })
})
