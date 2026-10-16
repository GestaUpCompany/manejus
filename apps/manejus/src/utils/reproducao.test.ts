import { describe, expect, it } from 'vitest'
import {
  camposDoTipo,
  formVazioEvento,
  montarDiagnosticosEmGrupo,
  montarEventoParaGravar,
  pendenciasDaFemea,
  resumirEstacoes,
  textoPrevisaoParto,
  validarDiagnosticoEmGrupo,
  validarEstacao,
  validarEvento,
  type EventoParaResumo,
  type LinhaDiagnosticoGrupo,
} from './reproducao'

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

describe('diagnóstico em grupo', () => {
  const linha = (id: string, over: Partial<LinhaDiagnosticoGrupo> = {}): LinhaDiagnosticoGrupo => ({
    individuoId: id, resultado: '', idadeGestacaoDias: '', coberturaId: null, coberturaData: null, ...over,
  })
  const comuns = { data: HOJE, metodo: 'Ultrassom' as const, observacao: ' lote 3 ' }

  it('monta só as fêmeas marcadas, com a cobertura de referência e a idade só para prenha', () => {
    const r = montarDiagnosticosEmGrupo(
      [linha('a', { resultado: 'Prenha', idadeGestacaoDias: '45', coberturaId: 'c1' }), linha('b'), linha('c', { resultado: 'Vazia', idadeGestacaoDias: '45' })],
      comuns,
      'faz'
    )
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ individuo_id: 'a', resultado: 'Prenha', idade_gestacao_dias: 45, evento_cobertura_id: 'c1', metodo_diagnostico: 'Ultrassom', observacao: 'lote 3', tipo: 'Diagnóstico de gestação' })
    expect(r[1]).toMatchObject({ individuo_id: 'c', resultado: 'Vazia', idade_gestacao_dias: null })
  })

  it('valida data, ao menos uma fêmea, idade e cobertura posterior', () => {
    expect(validarDiagnosticoEmGrupo([linha('a')], comuns, HOJE).gerais).toContain('Marque o resultado de ao menos uma fêmea')
    expect(validarDiagnosticoEmGrupo([linha('a', { resultado: 'Vazia' })], { ...comuns, data: '2026-10-20' }, HOJE).gerais).toContain('A data do diagnóstico não pode ser futura')
    const v = validarDiagnosticoEmGrupo(
      [linha('a', { resultado: 'Prenha', idadeGestacaoDias: '400' }), linha('b', { resultado: 'Vazia', coberturaData: '2026-10-20' }), linha('c', { resultado: 'Vazia' })],
      comuns,
      HOJE
    )
    expect(v.gerais).toEqual([])
    expect(Object.keys(v.porFemea).sort()).toEqual(['a', 'b'])
  })
})

describe('resumirEstacoes', () => {
  const ev = (individuo_id: string, tipo: EventoParaResumo['tipo'], data: string, estacao_id: string | null, resultado: EventoParaResumo['resultado'] = null): EventoParaResumo => ({ individuo_id, tipo, data, estacao_id, resultado })

  it('conta cobertas, prenhes, vazias, inconclusivas e sem diagnóstico, com as taxas', () => {
    const eventos = [
      ev('a', 'Cobertura', '2026-10-01', 'E1'), ev('a', 'Diagnóstico de gestação', '2026-12-01', null, 'Prenha'),
      ev('b', 'Inseminação', '2026-10-02', 'E1'), ev('b', 'Diagnóstico de gestação', '2026-12-01', null, 'Vazia'),
      ev('c', 'Cobertura', '2026-10-03', 'E1'), ev('c', 'Diagnóstico de gestação', '2026-12-01', null, 'Inconclusivo'),
      ev('d', 'Cobertura', '2026-10-04', 'E1'),
      ev('e', 'Cobertura', '2026-10-05', 'E2'),
    ]
    const [r1, r2] = resumirEstacoes(eventos, ['E1', 'E2'])
    expect(r1).toMatchObject({ cobertas: 4, prenhes: 1, vazias: 1, inconclusivas: 1, semDiagnostico: 1, taxaPrenhezSobreCobertas: 25, taxaPrenhezSobreDiagnosticadas: 50 })
    expect(r2).toMatchObject({ cobertas: 1, semDiagnostico: 1, taxaPrenhezSobreDiagnosticadas: null })
  })

  it('usa o diagnóstico mais recente depois da última cobertura e ignora o anterior a ela', () => {
    const eventos = [
      ev('a', 'Cobertura', '2026-01-10', 'E1'), ev('a', 'Diagnóstico de gestação', '2026-03-10', null, 'Vazia'),
      ev('a', 'Cobertura', '2026-04-01', 'E1'), ev('a', 'Diagnóstico de gestação', '2026-06-01', null, 'Prenha'),
      ev('b', 'Cobertura', '2026-05-01', 'E1'), ev('b', 'Diagnóstico de gestação', '2026-03-01', null, 'Prenha'),
    ]
    const [r] = resumirEstacoes(eventos, ['E1'])
    expect(r).toMatchObject({ cobertas: 2, prenhes: 1, semDiagnostico: 1 })
  })

  it('estação sem coberturas devolve zeros e taxas nulas', () => {
    expect(resumirEstacoes([], ['E9'])[0]).toMatchObject({ cobertas: 0, taxaPrenhezSobreCobertas: null, taxaPrenhezSobreDiagnosticadas: null })
  })
})
