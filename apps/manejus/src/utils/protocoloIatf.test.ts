import { describe, expect, it } from 'vitest'
import {
  avisosReprodutivosIatf,
  femeasEmOutroLoteIatf,
  individuosComIa,
  passosAnterioresPendentes,
  situacaoTarefa,
  somarDias,
  validarNovoLote,
  validarProtocolo,
  type FormPassoIatf,
} from './protocoloIatf'

describe('femeasEmOutroLoteIatf', () => {
  it('mapeia só as fêmeas ativas de lotes em andamento', () => {
    const mapa = femeasEmOutroLoteIatf([
      { nome: 'A', status: 'Em andamento', femeas: [{ individuo_id: 'x', status: 'Ativa' }, { individuo_id: 'y', status: 'Descartada' }] },
      { nome: 'B', status: 'Concluído', femeas: [{ individuo_id: 'z', status: 'Ativa' }] },
      { nome: 'C', status: 'Cancelado', femeas: [{ individuo_id: 'w', status: 'Ativa' }] },
    ])
    expect([...mapa.entries()]).toEqual([['x', 'A']])
  })
})

describe('passosAnterioresPendentes', () => {
  it('lista só os passos de dia anterior ainda não feitos, em ordem de dia', () => {
    const tarefas = [
      { dia: 10, feita_em: null, rotulo: 'IA' },
      { dia: 8, feita_em: null, rotulo: 'Retirada' },
      { dia: 0, feita_em: '2026-10-01', rotulo: 'Implante' },
      { dia: 3, feita_em: null, rotulo: 'Reforço' },
    ]
    expect(passosAnterioresPendentes(tarefas, 10).map((t) => t.rotulo)).toEqual(['Reforço', 'Retirada'])
    expect(passosAnterioresPendentes(tarefas, 0)).toEqual([])
  })
})

describe('avisosReprodutivosIatf', () => {
  it('avisa só de prenha e de coberta sem diagnóstico', () => {
    const avisos = avisosReprodutivosIatf([
      { rotulo: 'A', status: 'Prenha' },
      { rotulo: 'B', status: 'Coberta' },
      { rotulo: 'C', status: 'Coberta' },
      { rotulo: 'D', status: 'Parida' },
      { rotulo: 'E', status: 'Sem registro' },
    ])
    expect(avisos).toEqual(['Prenha (diagnóstico positivo): A.', 'Coberta/inseminada sem diagnóstico: B, C.'])
    expect(avisosReprodutivosIatf([{ rotulo: 'D', status: 'Vazia' }])).toEqual([])
  })
})

describe('individuosComIa', () => {
  it('considera só Inseminação não excluída', () => {
    const ids = individuosComIa([
      { individuo_id: 'a', tipo: 'Inseminação', deleted_at: null },
      { individuo_id: 'b', tipo: 'Inseminação', deleted_at: '2026-10-20T10:00:00Z' },
      { individuo_id: 'c', tipo: 'Diagnóstico de gestação', deleted_at: null },
    ])
    expect([...ids]).toEqual(['a'])
  })
})

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
