import { describe, expect, it } from 'vitest'
import { ordenarArquivosPop, tipoEntradaPop, validarProporcaoPop } from './pops'

describe('pops', () => {
  it('aceita retrato A4 e recusa paisagem ou quadrado', () => {
    expect(validarProporcaoPop(1240, 1755)).toBeNull()
    expect(validarProporcaoPop(1755, 1240)).not.toBeNull()
    expect(validarProporcaoPop(1000, 1000)).not.toBeNull()
    expect(validarProporcaoPop(0, 0)).not.toBeNull()
  })

  it('identifica o tipo de entrada', () => {
    expect(tipoEntradaPop({ type: 'application/pdf', name: 'a.pdf' })).toBe('pdf')
    expect(tipoEntradaPop({ type: '', name: 'A.PDF' })).toBe('pdf')
    expect(tipoEntradaPop({ type: 'image/jpeg', name: 'a.jpg' })).toBe('imagem')
    expect(tipoEntradaPop({ type: 'image/gif', name: 'a.gif' })).toBeNull()
  })

  it('ordena arquivos numericamente pelo nome', () => {
    const nomes = ordenarArquivosPop([{ name: 'POP_10.jpg' }, { name: 'POP_2.jpg' }, { name: 'POP_1.jpg' }]).map((f) => f.name)
    expect(nomes).toEqual(['POP_1.jpg', 'POP_2.jpg', 'POP_10.jpg'])
  })
})
