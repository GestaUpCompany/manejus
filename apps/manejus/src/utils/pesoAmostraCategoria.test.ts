import { describe, expect, it } from 'vitest'
import { resumirAmostraDePeso } from './pesoAmostraCategoria'

const hoje = '2026-10-16'

describe('resumirAmostraDePeso', () => {
  it('devolve null sem pesagem utilizável', () => {
    expect(resumirAmostraDePeso([], hoje)).toBeNull()
    expect(resumirAmostraDePeso([{ peso_atual_kg: null, peso_atual_data: '2026-10-10' }], hoje)).toBeNull()
    expect(resumirAmostraDePeso([{ peso_atual_kg: 400, peso_atual_data: null }], hoje)).toBeNull()
  })

  it('faz a média simples e usa a pesagem mais recente como data de referência', () => {
    const r = resumirAmostraDePeso(
      [
        { peso_atual_kg: 400, peso_atual_data: '2026-10-01' },
        { peso_atual_kg: 440, peso_atual_data: '2026-10-12' },
      ],
      hoje,
      10
    )
    expect(r).toMatchObject({ animais: 2, media: 420, dataReferencia: '2026-10-12', dataMaisAntiga: '2026-10-01', cobertura: 0.2 })
  })

  it('ignora pesos fora da janela, futuros, zerados ou negativos', () => {
    const r = resumirAmostraDePeso(
      [
        { peso_atual_kg: 500, peso_atual_data: '2026-08-01' },
        { peso_atual_kg: 500, peso_atual_data: '2026-10-20' },
        { peso_atual_kg: 0, peso_atual_data: '2026-10-10' },
        { peso_atual_kg: -5, peso_atual_data: '2026-10-10' },
        { peso_atual_kg: 380, peso_atual_data: '2026-10-10' },
      ],
      hoje
    )
    expect(r).toMatchObject({ animais: 1, media: 380 })
  })

  it('a cobertura não passa de 100% e fica nula sem contagem do agregado', () => {
    const p = [{ peso_atual_kg: 300, peso_atual_data: '2026-10-10' }, { peso_atual_kg: 310, peso_atual_data: '2026-10-10' }]
    expect(resumirAmostraDePeso(p, hoje, 1)?.cobertura).toBe(1)
    expect(resumirAmostraDePeso(p, hoje, 0)?.cobertura).toBeNull()
    expect(resumirAmostraDePeso(p, hoje)?.cobertura).toBeNull()
  })
})
