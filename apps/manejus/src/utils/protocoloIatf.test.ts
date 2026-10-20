import { describe, expect, it } from 'vitest'
import { situacaoTarefa, somarDias, validarNovoLote, validarProtocolo, type FormPassoIatf } from './protocoloIatf'

const passo = (p: Partial<FormPassoIatf> = {}): FormPassoIatf => ({
  dia: '0',
  rotulo: 'Implante',
  tipo: 'Aplicacao',
  medicamentoNome: '',
  dose: '',
  ...p,
})

describe('somarDias', () => {
  it('soma dias atravessando mês e ano', () => {
    expect(somarDias('2026-10-01', 10)).toBe('2026-10-11')
    expect(somarDias('2026-12-28', 8)).toBe('2027-01-05')
    expect(somarDias('2026-02-25', 5)).toBe('2026-03-02')
  })
})

describe('situacaoTarefa', () => {
  const hoje = '2026-10-10'
  it('classifica por data e execução', () => {
    expect(situacaoTarefa({ data_prevista: '2026-10-09', feita_em: null }, hoje)).toBe('atrasada')
    expect(situacaoTarefa({ data_prevista: '2026-10-10', feita_em: null }, hoje)).toBe('hoje')
    expect(situacaoTarefa({ data_prevista: '2026-10-11', feita_em: null }, hoje)).toBe('futura')
    expect(situacaoTarefa({ data_prevista: '2026-10-01', feita_em: '2026-10-02' }, hoje)).toBe('feita')
  })
})

describe('validarProtocolo', () => {
  const ia = passo({ dia: '10', rotulo: 'IA', tipo: 'Inseminacao' })
  it('aceita protocolo com uma IA', () => {
    expect(validarProtocolo({ nome: 'X', descricao: '', passos: [passo(), ia] })).toEqual([])
  })
  it('exige nome, passos e exatamente uma IA', () => {
    expect(validarProtocolo({ nome: ' ', descricao: '', passos: [] })).toHaveLength(3)
    expect(validarProtocolo({ nome: 'X', descricao: '', passos: [passo()] })).toContain(
      'O protocolo precisa ter exatamente um passo de Inseminação (IA).'
    )
    expect(validarProtocolo({ nome: 'X', descricao: '', passos: [ia, ia] })).toContain(
      'O protocolo precisa ter exatamente um passo de Inseminação (IA).'
    )
  })
  it('valida dia e descrição de cada passo', () => {
    const erros = validarProtocolo({ nome: 'X', descricao: '', passos: [passo({ dia: '31' }), passo({ dia: 'a', rotulo: '' }), ia] })
    expect(erros).toEqual([
      'Passo 1: o dia deve ser um inteiro de 0 a 30.',
      'Passo 2: o dia deve ser um inteiro de 0 a 30.',
      'Passo 2: informe a descrição.',
    ])
  })
})

describe('validarNovoLote', () => {
  it('exige protocolo, nome, D0 e fêmeas', () => {
    expect(validarNovoLote({ protocoloId: '', nome: '', dataD0: '', individuos: [] })).toHaveLength(4)
    expect(validarNovoLote({ protocoloId: 'p', nome: 'L', dataD0: '2026-10-01', individuos: ['a'] })).toEqual([])
  })
})
