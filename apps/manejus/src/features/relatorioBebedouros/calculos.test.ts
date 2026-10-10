import { describe, expect, it } from 'vitest'
import {
  calcularChecklist,
  calcularCronograma,
  calcularLimpezasDoDia,
  proximasNaJanela,
  somarDias,
  statusLimpeza,
  textoPrazo,
} from './calculos'

const beb = (id: string, meta: number | null) => ({ id, nome: `B${id}`, meta_intervalo_limpeza: meta })
const limp = (bebedouro_id: string, data_limpeza: string, responsavel: string | null = 'Zé') => ({
  bebedouro_id,
  data_limpeza,
  responsavel,
})

describe('somarDias', () => {
  it('atravessa virada de mês e ano', () => {
    expect(somarDias('2025-12-28T10:00:00', 7)).toBe('2026-01-04')
    expect(somarDias('2026-02-25', 5)).toBe('2026-03-02')
  })
})

describe('statusLimpeza', () => {
  it('classifica pelos limiares de 1,3x a meta', () => {
    expect(statusLimpeza(null, 10).codigo).toBe('sem_registro')
    expect(statusLimpeza(5, null).codigo).toBe('sem_meta')
    expect(statusLimpeza(10, 10).codigo).toBe('em_dia')
    expect(statusLimpeza(13, 10).codigo).toBe('atrasado')
    expect(statusLimpeza(14, 10).codigo).toBe('critico')
  })
})

describe('calcularCronograma', () => {
  const ref = '2026-03-10'
  const itens = calcularCronograma(
    [beb('1', 7), beb('2', 7), beb('3', null), beb('4', 7), beb('5', 10)],
    [
      limp('1', '2026-03-01T08:00:00'), // próxima 08/03 -> vencida há 2
      limp('1', '2026-02-01'),
      limp('2', '2026-03-08'), // próxima 15/03 -> em 5 dias
      limp('3', '2026-03-05'), // sem meta
      limp('5', '2026-03-10'), // próxima 20/03 -> em 10 dias
    ],
    ref,
    '2026-03-01',
    ref,
  )

  it('calcula última e próxima limpeza', () => {
    const b1 = itens.find((i) => i.id === '1')!
    expect(b1.ultimaLimpeza).toBe('2026-03-01T08:00:00')
    expect(b1.proximaLimpeza).toBe('2026-03-08')
    expect(b1.diasParaProxima).toBe(-2)
    expect(textoPrazo(b1.diasParaProxima)).toBe('vencida há 2 dias')
    expect(b1.limpezasNoPeriodo).toBe(1)
  })

  it('sem meta não tem próxima; sem registro não tem última', () => {
    const b3 = itens.find((i) => i.id === '3')!
    expect(b3.proximaLimpeza).toBeNull()
    expect(b3.status.codigo).toBe('sem_meta')
    const b4 = itens.find((i) => i.id === '4')!
    expect(b4.ultimaLimpeza).toBeNull()
    expect(b4.status.codigo).toBe('sem_registro')
  })

  it('ordena vencidas, próximas, sem meta e sem registro', () => {
    expect(itens.map((i) => i.id)).toEqual(['1', '2', '5', '3', '4'])
  })

  it('janela de 7 dias', () => {
    expect(proximasNaJanela(itens, 7).map((i) => i.nome)).toEqual(['B2'])
  })

  it('referência no passado ignora limpezas posteriores via dias >= 0', () => {
    const [i] = calcularCronograma([beb('1', 7)], [limp('1', '2026-03-10')], '2026-03-05', '2026-03-01', '2026-03-05')
    expect(i.dias).toBe(0)
  })
})

describe('calcularLimpezasDoDia', () => {
  it('calcula intervalo e próxima prevista', () => {
    const r = calcularLimpezasDoDia(
      [beb('1', 7), beb('2', 7)],
      [limp('1', '2026-03-10'), limp('1', '2026-03-01'), limp('2', '2026-03-10')],
      '2026-03-10',
    )
    const b1 = r.find((x) => x.id === '1')!
    expect(b1.intervalo).toBe(9)
    expect(b1.statusLabel).toBe('Acima da meta')
    expect(b1.proximaPrevista).toBe('2026-03-17')
    expect(r.find((x) => x.id === '2')!.statusLabel).toBe('Primeira limpeza')
  })
})

describe('calcularChecklist', () => {
  it('pareia item e observação e conta por bebedouro', () => {
    const r = calcularChecklist([
      {
        data: '2026-03-02',
        numero_bebedouro: 'B1',
        responsavel: 'Zé',
        observacao: 'geral',
        checklist: {
          agua_suficiente: { valor: false, observacao: 'seco' },
          vazao_bebedouro_ideal: { valor: true, observacao: '' },
        },
      },
      { data: '2026-03-03', numero_bebedouro: 'B1', responsavel: null, observacao: null, checklist: { agua_suficiente: { valor: true, observacao: '' } } },
    ])
    expect(r.ocorrencias).toHaveLength(1)
    expect(r.ocorrencias[0].itens).toEqual([{ label: 'Água insuficiente', obs: 'seco' }])
    expect(r.kpis).toMatchObject({ comChecklist: 2, negativos: 1, pctNegativos: 50 })
    expect(r.ocorrenciasPorBebedouro).toEqual([{ bebedouro: 'B1', quantidade: 1 }])
  })

  it('registro só com a foto principal (foto_bebedouro) não conta como checklist respondido', () => {
    const comItens = {
      data: '2026-03-02',
      numero_bebedouro: 'B1',
      responsavel: null,
      observacao: null,
      checklist: { agua_suficiente: { valor: false, observacao: 'seco' }, foto_bebedouro: { valor: true, observacao: '' } },
    }
    const soFoto = {
      data: '2026-03-03',
      numero_bebedouro: 'B2',
      responsavel: null,
      observacao: null,
      checklist: { foto_bebedouro: { valor: true, observacao: '' } },
    }
    const r = calcularChecklist([comItens, soFoto])
    expect(r.kpis).toMatchObject({ totalRegistros: 2, comChecklist: 1, negativos: 1, pctNegativos: 100 })
    expect(r.ranking.find((x) => x.key === 'agua_suficiente')).toMatchObject({ negativos: 1, total: 1, pctNegativo: 100 })
    expect(r.ocorrenciasPorBebedouro).toEqual([{ bebedouro: 'B1', quantidade: 1 }])
  })
})
