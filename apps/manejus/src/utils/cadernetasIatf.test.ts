import { describe, expect, it } from 'vitest'
import {
  CADERNETAS,
  CADERNETAS_EM_TESTE,
  CADERNETAS_IATF,
  CADERNETA_GRUPOS,
  FAZENDA_DE_TESTES_ID,
  cadernetaVisivel,
  cadernetasDaFazenda,
  gruposDaFazenda,
  menuControleIndividualVisivel,
} from './cadernetas'

const ids = (l: { id: string }[]) => l.map((c) => c.id)

describe('cadernetas em teste (painel): Reprodução, Sanidade e Manejo de Curral', () => {
  it('só a fazenda de testes vê; fazenda desconhecida não', () => {
    expect([...CADERNETAS_EM_TESTE].sort()).toEqual(['manejo-curral', 'reproducao', 'sanidade'])
    for (const id of CADERNETAS_EM_TESTE) {
      expect(cadernetaVisivel(id, FAZENDA_DE_TESTES_ID, false)).toBe(true)
      expect(cadernetaVisivel(id, 'outra', true)).toBe(false)
      expect(cadernetaVisivel(id, null, true)).toBe(false)
    }
    expect(menuControleIndividualVisivel(FAZENDA_DE_TESTES_ID)).toBe(true)
    expect(menuControleIndividualVisivel('outra')).toBe(false)
    expect(menuControleIndividualVisivel(undefined)).toBe(false)
  })

  it('ficam no grupo Controle Individual, fora do grupo IATF', () => {
    const grupo = CADERNETA_GRUPOS.find((g) => g.nome === 'Controle Individual')
    expect(grupo?.itens.map((i) => i.id).sort()).toEqual(['manejo-curral', 'reproducao', 'sanidade'])
  })
})

describe('cadernetas do IATF (painel): flag acesso_iatf por fazenda', () => {
  it('só a caderneta Protocolo IATF depende da flag, e existe no menu', () => {
    expect([...CADERNETAS_IATF]).toEqual(['protocolo-iatf'])
    expect(CADERNETAS.some((c) => c.id === 'protocolo-iatf')).toBe(true)
  })

  it('aparece com a flag em qualquer fazenda; sem a flag (ou desconhecida) fica oculta', () => {
    expect(cadernetaVisivel('protocolo-iatf', 'outra', true)).toBe(true)
    expect(cadernetaVisivel('protocolo-iatf', FAZENDA_DE_TESTES_ID, false)).toBe(false)
    expect(cadernetaVisivel('protocolo-iatf', FAZENDA_DE_TESTES_ID, undefined)).toBe(false)
    expect(cadernetaVisivel('enfermaria', null, undefined)).toBe(true)
  })

  it('a lista e os grupos acompanham fazenda e flag, com o IATF em grupo próprio', () => {
    expect(ids(cadernetasDaFazenda('outra', false))).not.toContain('protocolo-iatf')
    expect(ids(cadernetasDaFazenda('outra', false))).not.toContain('sanidade')
    expect(ids(cadernetasDaFazenda('outra', true))).toContain('protocolo-iatf')
    expect(cadernetasDaFazenda(FAZENDA_DE_TESTES_ID, true)).toHaveLength(CADERNETAS.length)
    const comIatf = gruposDaFazenda('outra', true)
    expect(comIatf.find((g) => g.nome === 'IATF')?.itens.map((i) => i.id)).toEqual(['protocolo-iatf'])
    expect(comIatf.some((g) => g.nome === 'Controle Individual')).toBe(false)
    expect(gruposDaFazenda('outra', false).some((g) => g.nome === 'IATF')).toBe(false)
    expect(gruposDaFazenda(FAZENDA_DE_TESTES_ID, true).map((g) => g.nome)).toEqual(expect.arrayContaining(['Controle Individual', 'IATF']))
  })
})
