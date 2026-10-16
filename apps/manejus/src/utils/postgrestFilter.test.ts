import { describe, expect, it } from 'vitest'
import { escapeLikeTerm, ilikeContainsCondition, quotePostgrestValue } from './postgrestFilter'

describe('escapeLikeTerm', () => {
  it('escapa curingas do LIKE e a barra invertida', () => {
    expect(escapeLikeTerm('50%_a\\b')).toBe('50\\%\\_a\\\\b')
  })

  it('não altera texto comum', () => {
    expect(escapeLikeTerm('BR12345')).toBe('BR12345')
  })
})

describe('quotePostgrestValue', () => {
  it('envolve em aspas e escapa aspas e barra invertida', () => {
    expect(quotePostgrestValue('a"b\\c')).toBe('"a\\"b\\\\c"')
  })

  it('mantém vírgula, ponto e parênteses dentro das aspas', () => {
    expect(quotePostgrestValue('a,b).c(')).toBe('"a,b).c("')
  })
})

describe('ilikeContainsCondition', () => {
  it('monta a condição com o termo entre curingas', () => {
    expect(ilikeContainsCondition('id_brinco', '22')).toBe('id_brinco.ilike."%22%"')
  })

  it('um termo com vírgula não vira outra condição', () => {
    // o "_" do termo também é curinga do LIKE, por isso sai escapado (duas barras: LIKE + aspas do PostgREST)
    expect(ilikeContainsCondition('id_chip', '1,id_brinco.eq.x')).toBe('id_chip.ilike."%1,id\\\\_brinco.eq.x%"')
  })

  it('o curinga digitado vira texto: a barra do LIKE sobrevive ao escape das aspas', () => {
    expect(ilikeContainsCondition('id_brinco', '5%')).toBe('id_brinco.ilike."%5\\\\%%"')
  })
})
