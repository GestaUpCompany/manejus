import { describe, it, expect } from 'vitest'
import { TIPOS_PONTO, corPonto, labelPonto } from './mapaConfig'

describe('TIPOS_PONTO', () => {
  it('tem 6 tipos', () => {
    expect(TIPOS_PONTO.length).toBe(6)
  })

  it('todos tem value, label, cor e icone', () => {
    TIPOS_PONTO.forEach((t) => {
      expect(typeof t.value).toBe('string')
      expect(typeof t.label).toBe('string')
      expect(typeof t.cor).toBe('string')
      expect(typeof t.icone).toBe('string')
      expect(t.cor.startsWith('#')).toBe(true)
    })
  })

  it('values sao unicos', () => {
    const values = TIPOS_PONTO.map((t) => t.value)
    expect(new Set(values).size).toBe(values.length)
  })

  it('inclui fabrica, curral, portao, saleiro, cocho, outro', () => {
    const values = TIPOS_PONTO.map((t) => t.value)
    expect(values).toContain('fabrica')
    expect(values).toContain('curral')
    expect(values).toContain('portao')
    expect(values).toContain('saleiro')
    expect(values).toContain('cocho')
    expect(values).toContain('outro')
  })
})

describe('corPonto', () => {
  it('fabrica retorna roxo #7c3aed', () => {
    expect(corPonto('fabrica')).toBe('#7c3aed')
  })

  it('curral retorna vermelho #dc2626', () => {
    expect(corPonto('curral')).toBe('#dc2626')
  })

  it('tipo inexistente retorna cinza default #6b7280', () => {
    expect(corPonto('inexistente')).toBe('#6b7280')
  })

  it('string vazia retorna cinza default', () => {
    expect(corPonto('')).toBe('#6b7280')
  })
})

describe('labelPonto', () => {
  it('fabrica retorna "Fábrica de Ração"', () => {
    expect(labelPonto('fabrica')).toBe('Fábrica de Ração')
  })

  it('curral retorna "Curral"', () => {
    expect(labelPonto('curral')).toBe('Curral')
  })

  it('tipo inexistente retorna o proprio tipo', () => {
    expect(labelPonto('inexistente')).toBe('inexistente')
  })

  it('string vazia retorna string vazia', () => {
    expect(labelPonto('')).toBe('')
  })
})
