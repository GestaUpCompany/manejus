import { describe, expect, it } from 'vitest'
import {
  calculateCompletenessScore,
  categoriasFemea,
  categoriasMacho,
  getSyncStatusFromScore,
  statusEditaveis,
  statusList,
  validateIndividuo,
} from './individualValidation'

const formValido = {
  id_brinco: '123',
  sexo: 'Macho',
  categoria: 'Garrote',
  raca: 'Nelore',
  data_nascimento: '2024-01-01',
  peso_nascimento_kg: 30,
  status: 'Vivo',
}

describe('validateIndividuo', () => {
  it('aceita um formulário completo', () => {
    expect(validateIndividuo(formValido)).toEqual({})
  })

  it('exige ao menos uma identificação', () => {
    const errors = validateIndividuo({ ...formValido, id_brinco: '  ' })
    expect(errors.identificacao).toBeDefined()
  })

  it('aceita identificação só por ID provisório', () => {
    const errors = validateIndividuo({ ...formValido, id_brinco: '', id_provisorio_cria: 'P1' })
    expect(errors.identificacao).toBeUndefined()
  })

  it.each(['Bezerro', 'Boi Gordo', 'Tourinho'])('aceita %s para macho', (categoria) => {
    expect(validateIndividuo({ ...formValido, categoria }).categoria).toBeUndefined()
  })

  it.each(['Bezerra', 'Vaca', 'Tropa'])('aceita %s para fêmea', (categoria) => {
    expect(validateIndividuo({ ...formValido, sexo: 'Fêmea', categoria }).categoria).toBeUndefined()
  })

  it('rejeita categoria feminina para macho e vice-versa', () => {
    expect(validateIndividuo({ ...formValido, categoria: 'Vaca' }).categoria).toBeDefined()
    expect(validateIndividuo({ ...formValido, sexo: 'Fêmea', categoria: 'Touro' }).categoria).toBeDefined()
  })

  it('bloqueia status Morto', () => {
    expect(validateIndividuo({ ...formValido, status: 'Morto' }).status).toBeDefined()
  })

  it('rejeita data de nascimento futura', () => {
    const futuro = new Date()
    futuro.setFullYear(futuro.getFullYear() + 1)
    const errors = validateIndividuo({ ...formValido, data_nascimento: futuro.toISOString().slice(0, 10) })
    expect(errors.data_nascimento).toBeDefined()
  })

  it('aceita pesos no formato pt-BR emitido pelo NumericInput', () => {
    const errors = validateIndividuo({ ...formValido, peso_nascimento_kg: '32,000', pv_entrada_kg: '250,500' })
    expect(errors.peso_nascimento_kg).toBeUndefined()
    expect(errors.pv_entrada_kg).toBeUndefined()
  })

  it('rejeita peso inválido ou negativo em texto', () => {
    expect(validateIndividuo({ ...formValido, peso_nascimento_kg: 'abc' }).peso_nascimento_kg).toBeDefined()
    expect(validateIndividuo({ ...formValido, peso_nascimento_kg: '-3,5' }).peso_nascimento_kg).toBeDefined()
  })

  it('rejeita entrada anterior ao nascimento e valores negativos', () => {
    const errors = validateIndividuo({
      ...formValido,
      data_entrada_fazenda: '2023-01-01',
      pv_entrada_kg: -5,
    })
    expect(errors.data_entrada_fazenda).toBeDefined()
    expect(errors.pv_entrada_kg).toBeDefined()
  })
})

describe('enums', () => {
  it('categorias de macho e fêmea não se sobrepõem', () => {
    expect(categoriasMacho.filter((c) => categoriasFemea.includes(c))).toEqual([])
  })

  it('statusEditaveis exclui apenas Morto', () => {
    expect(statusEditaveis).not.toContain('Morto')
    expect(statusEditaveis).toHaveLength(statusList.length - 1)
    expect(statusEditaveis).not.toContain('Vendido')
  })
})

describe('completude', () => {
  it('formulário completo vale 100 e é manual_completo', () => {
    const score = calculateCompletenessScore(formValido)
    expect(score).toBe(100)
    expect(getSyncStatusFromScore(score)).toBe('manual_completo')
  })

  it('sem peso de nascimento fica incompleto', () => {
    const score = calculateCompletenessScore({ ...formValido, peso_nascimento_kg: '' })
    expect(score).toBeLessThan(100)
    expect(getSyncStatusFromScore(score)).toBe('manual_incompleto')
  })
})
