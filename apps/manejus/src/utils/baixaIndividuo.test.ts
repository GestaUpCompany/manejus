import { describe, expect, it } from 'vitest'
import { montarDadosBaixa, motivoPadrao, motivosSaida, validarBaixa } from './baixaIndividuo'

const hoje = '2026-10-08'
const base = { status: 'Doado', dataSaida: '2026-10-01', motivoSaida: 'Doação', destinoSaida: ' Vizinho X ' }

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

  it('rejeita motivo fora da lista, inclusive Morte, Venda e Abate', () => {
    for (const motivo of ['Morte', 'Venda', 'Abate', 'Transferência', 'qualquer']) {
      expect(validarBaixa({ ...base, motivoSaida: motivo }, hoje).motivoSaida).toBeDefined()
    }
  })

  it('aceita Descarte e Outro', () => {
    expect(validarBaixa({ ...base, motivoSaida: 'Descarte' }, hoje)).toEqual({})
    expect(validarBaixa({ ...base, motivoSaida: 'Outro' }, hoje)).toEqual({})
  })

  it('bloqueia venda, abate e transferência e aponta a OS', () => {
    for (const status of ['Abatido', 'Venda Vivo', 'Transferido']) {
      expect(validarBaixa({ ...base, status }, hoje).status).toMatch(/Ordem de Serviço/)
    }
  })

  it('bloqueia Morto e aponta a Caderneta de Morte', () => {
    expect(validarBaixa({ ...base, status: 'Morto' }, hoje).status).toMatch(/Caderneta de Morte/)
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
      status: 'Doado',
      data_saida: '2026-10-01',
      motivo_saida: 'Doação',
      destino_saida: 'Vizinho X',
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
  it('sugere um motivo da lista para Doado e nada para Vivo', () => {
    expect(motivosSaida).toContain(motivoPadrao('Doado'))
    expect(motivoPadrao('Vivo')).toBe('')
  })
})
