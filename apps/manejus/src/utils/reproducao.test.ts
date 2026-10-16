import { describe, expect, it } from 'vitest'
import { camposDoTipo, formVazioEvento, montarEventoParaGravar, pendenciasDaFemea, textoPrevisaoParto, validarEstacao, validarEvento } from './reproducao'

const HOJE = '2026-10-16'
const form = (over = {}) => ({ ...formVazioEvento(HOJE), ...over })

describe('validarEvento', () => {
  it('cobertura válida não tem erro; data futura e vazia são recusadas', () => {
    expect(validarEvento(form(), HOJE)).toEqual([])
    expect(validarEvento(form({ data: '2026-10-17' }), HOJE)).toContain('A data do evento não pode ser futura')
    expect(validarEvento(form({ data: '' }), HOJE)).toContain('Informe a data do evento')
  })

  it('diagnóstico exige resultado; idade da gestação de 0 a 300 inteiros', () => {
    expect(validarEvento(form({ tipo: 'Diagnóstico de gestação' }), HOJE)).toContain('Informe o resultado do diagnóstico')
    expect(validarEvento(form({ tipo: 'Diagnóstico de gestação', resultado: 'Prenha', idadeGestacaoDias: '301' }), HOJE)).toHaveLength(1)
    expect(validarEvento(form({ tipo: 'Diagnóstico de gestação', resultado: 'Prenha', idadeGestacaoDias: '45,5' }), HOJE)).toHaveLength(1)
    expect(validarEvento(form({ tipo: 'Diagnóstico de gestação', resultado: 'Prenha', idadeGestacaoDias: '45' }), HOJE)).toEqual([])
    expect(validarEvento(form({ tipo: 'Diagnóstico de gestação', resultado: 'Vazia', idadeGestacaoDias: '999' }), HOJE)).toEqual([])
  })

  it('cobertura referenciada precisa ser anterior ao evento', () => {
    const f = form({ tipo: 'Diagnóstico de gestação', resultado: 'Prenha', data: '2026-09-01', eventoCoberturaId: 'c1' })
    expect(validarEvento(f, HOJE, '2026-09-10')).toContain('A cobertura escolhida deve ser anterior ao evento')
    expect(validarEvento(f, HOJE, '2026-08-20')).toEqual([])
  })
})

describe('montarEventoParaGravar', () => {
  it('inseminação leva touro, sêmen e técnico; não leva campos de diagnóstico', () => {
    const r = montarEventoParaGravar(
      form({ tipo: 'Inseminação', touroNome: ' Touro X ', semenPartida: 'P-9', tecnico: 'Zé', resultado: 'Prenha', metodoDiagnostico: 'Ultrassom', estacaoId: 'e1' }),
      'faz', 'ind', 'Victor'
    )
    expect(r).toMatchObject({ tipo: 'Inseminação', touro_nome: 'Touro X', semen_partida: 'P-9', tecnico: 'Zé', estacao_id: 'e1', resultado: null, metodo_diagnostico: null, responsavel: 'Victor' })
  })

  it('cobertura natural não leva sêmen nem técnico', () => {
    const r = montarEventoParaGravar(form({ tipo: 'Cobertura', touroNome: 'T', semenPartida: 'P', tecnico: 'Z' }), 'faz', 'ind', null)
    expect(r).toMatchObject({ touro_nome: 'T', semen_partida: null, tecnico: null, responsavel: null })
  })

  it('diagnóstico prenha leva idade e cobertura; vazia não leva idade; touro e estação ficam nulos', () => {
    const p = montarEventoParaGravar(form({ tipo: 'Diagnóstico de gestação', resultado: 'Prenha', idadeGestacaoDias: '60', eventoCoberturaId: 'c1', metodoDiagnostico: 'Palpação', touroNome: 'X', estacaoId: 'e1' }), 'faz', 'ind', 'V')
    expect(p).toMatchObject({ resultado: 'Prenha', idade_gestacao_dias: 60, evento_cobertura_id: 'c1', metodo_diagnostico: 'Palpação', touro_nome: null, estacao_id: null })
    const v = montarEventoParaGravar(form({ tipo: 'Diagnóstico de gestação', resultado: 'Vazia', idadeGestacaoDias: '60' }), 'faz', 'ind', 'V')
    expect(v.idade_gestacao_dias).toBeNull()
  })

  it('aborto não leva resultado nem touro, mas aceita a cobertura', () => {
    const r = montarEventoParaGravar(form({ tipo: 'Aborto', eventoCoberturaId: 'c1', resultado: 'Prenha' }), 'faz', 'ind', 'V')
    expect(r).toMatchObject({ resultado: null, evento_cobertura_id: 'c1', touro_nome: null })
  })
})

describe('camposDoTipo', () => {
  it('só cobertura e inseminação usam estação e touro', () => {
    expect(camposDoTipo('Cobertura')).toMatchObject({ estacao: true, touro: true, semen: false })
    expect(camposDoTipo('Aborto')).toMatchObject({ estacao: false, touro: false, cobertura: true })
  })
})

describe('textoPrevisaoParto', () => {
  it('diz quando é o parto e se foi confirmado por diagnóstico', () => {
    expect(textoPrevisaoParto('2026-11-25', true, HOJE)).toBe('Parto previsto em 40 dia(s)')
    expect(textoPrevisaoParto('2026-10-16', false, HOJE)).toBe('Parto previsto (sem diagnóstico) hoje')
    expect(textoPrevisaoParto('2026-10-11', true, HOJE)).toBe('Parto previsto atrasado 5 dia(s)')
    expect(textoPrevisaoParto(null, true, HOJE)).toBeNull()
  })
})

describe('pendenciasDaFemea', () => {
  const base = { status_reprodutivo: 'Coberta' as const, dias_desde_cobertura: 10, previsao_parto: '2027-07-26', ultimo_diagnostico_data: null, ultima_cobertura_data: '2026-10-06', dias_desde_ultimo_parto: null }

  it('coberta há 60 dias ou mais sem diagnóstico vira pendência', () => {
    expect(pendenciasDaFemea(base, HOJE)).toEqual([])
    expect(pendenciasDaFemea({ ...base, dias_desde_cobertura: 75 }, HOJE).map((p) => p.tipo)).toContain('sem_diagnostico')
  })

  it('parto nos próximos 30 dias e parto atrasado', () => {
    expect(pendenciasDaFemea({ ...base, status_reprodutivo: 'Prenha', previsao_parto: '2026-11-05' }, HOJE).map((p) => p.tipo)).toEqual(['parto_proximo'])
    expect(pendenciasDaFemea({ ...base, status_reprodutivo: 'Prenha', previsao_parto: '2026-10-01' }, HOJE).map((p) => p.tipo)).toEqual(['parto_atrasado'])
    expect(pendenciasDaFemea({ ...base, status_reprodutivo: 'Prenha', previsao_parto: '2027-01-01' }, HOJE)).toEqual([])
  })

  it('vazia há mais de 120 dias', () => {
    const v = { ...base, status_reprodutivo: 'Vazia' as const, previsao_parto: null, ultimo_diagnostico_data: '2026-05-01' }
    expect(pendenciasDaFemea(v, HOJE).map((p) => p.tipo)).toEqual(['vazia_ha_muito_tempo'])
    expect(pendenciasDaFemea({ ...v, ultimo_diagnostico_data: '2026-09-20' }, HOJE)).toEqual([])
  })
})

describe('validarEstacao', () => {
  const ok = { nome: 'Estação 2026/27', dataInicio: '2026-11-01', dataFim: '2027-01-31', observacao: '' }
  it('estação válida não tem erro', () => {
    expect(validarEstacao(ok)).toEqual([])
    expect(validarEstacao({ ...ok, dataFim: ok.dataInicio })).toEqual([])
  })
  it('recusa nome vazio, datas faltando e período invertido', () => {
    expect(validarEstacao({ ...ok, nome: '  ' })).toEqual(['Informe o nome da estação'])
    expect(validarEstacao({ ...ok, dataInicio: '', dataFim: '' })).toEqual(['Informe a data de início', 'Informe a data de fim'])
    expect(validarEstacao({ ...ok, dataFim: '2026-10-01' })).toEqual(['A data de fim não pode ser anterior à de início'])
  })
})
