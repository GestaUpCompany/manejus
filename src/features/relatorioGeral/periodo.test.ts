import { describe, expect, it } from 'vitest'
import { contarDiasInclusivos, formatarPeriodoCapa, validarPeriodoRelatorio } from './periodo'

describe('período do relatório geral', () => {
  it('conta dias de forma inclusiva', () => {
    expect(contarDiasInclusivos('2026-08-01', '2026-08-01')).toBe(1)
    expect(contarDiasInclusivos('2026-08-01', '2026-08-29')).toBe(29)
    expect(contarDiasInclusivos('2026-08-01', '2026-08-31')).toBe(31)
  })

  it('valida datas obrigatórias, ordem e limite', () => {
    expect(validarPeriodoRelatorio('', '')).toContain('Informe')
    expect(validarPeriodoRelatorio('2026-09-02', '2026-09-01')).toContain('posterior')
    expect(validarPeriodoRelatorio('2026-08-01', '2026-09-01')).toContain('31 dias')
    expect(validarPeriodoRelatorio('2026-08-01', '2026-08-31')).toBeNull()
  })

  it('formata mês e ano para a capa', () => {
    expect(formatarPeriodoCapa('2026-09-01', '2026-09-29')).toBe('Setembro de 2026')
    expect(formatarPeriodoCapa('2026-08-20', '2026-09-10')).toBe('Agosto a Setembro de 2026')
    expect(formatarPeriodoCapa('2026-12-20', '2027-01-10')).toBe('Dezembro de 2026 a Janeiro de 2027')
  })
})
