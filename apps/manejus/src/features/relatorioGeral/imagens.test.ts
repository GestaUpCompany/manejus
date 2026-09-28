import { describe, expect, it } from 'vitest'
import { sanitizarNomeImagem, validarImagemCapa } from './imagens'

describe('imagens de capa', () => {
  it('aceita formatos raster e rejeita tipos não permitidos', () => {
    expect(validarImagemCapa(new File(['x'], 'capa.png', { type: 'image/png' }))).toBeNull()
    expect(validarImagemCapa(new File(['x'], 'capa.svg', { type: 'image/svg+xml' }))).toContain('PNG')
  })

  it('sanitiza o nome usado no Storage', () => {
    expect(sanitizarNomeImagem('Fazenda São José 2026.JPG')).toBe('fazenda-sao-jose-2026')
  })
})
