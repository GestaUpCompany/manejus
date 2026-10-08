import { describe, it, expect } from 'vitest'
import { isStaging, tituloComAmbiente } from './ambiente'

describe('isStaging', () => {
  it('só liga com VITE_APP_ENV=staging', () => {
    expect(isStaging('staging')).toBe(true)
    expect(isStaging('production')).toBe(false)
    expect(isStaging('')).toBe(false)
    expect(isStaging(undefined)).toBe(false)
  })
})

describe('tituloComAmbiente', () => {
  it('prefixa o título em staging', () => {
    expect(tituloComAmbiente("Gesta'Up Cadernetas Digitais", 'staging')).toBe(
      "[STAGING] Gesta'Up Cadernetas Digitais"
    )
  })

  it('mantém o título em produção (sem a variável)', () => {
    expect(tituloComAmbiente("Gesta'Up Cadernetas Digitais", undefined)).toBe("Gesta'Up Cadernetas Digitais")
  })
})
