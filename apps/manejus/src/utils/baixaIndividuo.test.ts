import { describe, expect, it } from 'vitest'
import { montarDadosBaixa, motivoPadrao, motivosSaida, validarBaixa } from './baixaIndividuo'

const hoje = '2026-10-08'
const base = { status: 'Abatido', dataSaida: '2026-10-01', motivoSaida: 'Abate', destinoSaida: ' Frigorífico X ' }

describe('validarBaixa', () => {
  it('aceita uma baixa completa', () => {
    expect(validarBaixa(base, hoje)).toEqual({})
  })

  it('aceita data de hoje e rejeita futura', () => {
    expect(validarBaixa({ ...base, dataSaida: hoje }, hoje)).toEqual({})
    expect(validarBaixa({ ...base, dataSaida: '2026-10-09' }, hoje).dataSaida).toBeDefined()
  })

  it('exige data e motivo para qualquer status diferente de Vivo', () => {
    const errors = validarBaixa({ ...base, dataSaida: '', motivoSaida: '' }, hoje)
    expect(errors.dataSaida).toBeDefined()
    expect(errors.motivoSaida).toBeDefined()
  })

  it('rejeita motivo fora da lista e Morte', () => {
    expect(validarBaixa({ ...base, motivoSaida: 'Morte' }, hoje).motivoSaida).toBeDefined()
    expect(validarBaixa({ ...base, motivoSaida: 'qualquer' }, hoje).motivoSaida).toBeDefined()
  })

  it('voltar a Vivo não exige nada', () => {
    expect(validarBaixa({ status: 'Vivo', dataSaida: '', motivoSaida: '', destinoSaida: '' }, hoje)).toEqual({})
  })

  it('sem status devolve erro', () => {
    expect(validarBaixa({ ...base, status: '' }, hoje).status).toBeDefined()
  })
})

describe('montarDadosBaixa', () => {
  it('grava os dados da saída e apara o destino', () => {
    expect(montarDadosBaixa(base)).toEqual({
      status: 'Abatido',
      data_saida: '2026-10-01',
      motivo_saida: 'Abate',
      destino_saida: 'Frigorífico X',
    })
  })

  it('destino vazio vira null', () => {
    expect(montarDadosBaixa({ ...base, destinoSaida: '   ' }).destino_saida).toBeNull()
  })

  it('Vivo limpa tudo', () => {
    expect(montarDadosBaixa({ ...base, status: 'Vivo' })).toEqual({
      status: 'Vivo',
      data_saida: null,
      motivo_saida: null,
      destino_saida: null,
    })
  })
})

describe('motivoPadrao', () => {
  it('sugere um motivo coerente com o status e sempre da lista', () => {
    for (const status of ['Venda Vivo', 'Abatido', 'Doado', 'Transferido']) {
      expect(motivosSaida).toContain(motivoPadrao(status))
    }
    expect(motivoPadrao('Vivo')).toBe('')
  })
})
