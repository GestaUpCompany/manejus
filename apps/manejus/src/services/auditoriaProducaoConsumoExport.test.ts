import { describe, it, expect, vi } from 'vitest'

vi.mock('@gestaup/supabase', () => ({ supabase: {} }))

import { montarAuditoria, composicaoMN, diaSeguinte, diasNoIntervalo, type DadosAuditoria } from './auditoriaProducaoConsumoExport'

describe('intervalo', () => {
  it('calcula dia seguinte e tamanho do intervalo, inclusive virada de mês', () => {
    expect(diaSeguinte('2026-10-31')).toBe('2026-11-01')
    expect(diasNoIntervalo('2026-10-14', '2026-10-14')).toBe(1)
    expect(diasNoIntervalo('2026-10-30', '2026-11-02')).toBe(4)
  })
})

const base: DadosAuditoria = {
  consumo: [],
  producao: [],
  itens: [],
  composicao: [],
  nomesFormulacao: { f1: 'Proteinado', f2: 'Mineral' },
  nomesInsumo: { i1: 'Milho', i2: 'Núcleo' },
}

describe('composicaoMN', () => {
  it('converte teor de MS em % de matéria natural que soma 100', () => {
    const r = composicaoMN([
      { formulacao_id: 'f1', insumo_id: 'i1', formula_teor_ms: 45, teor_ms: 90 },
      { formulacao_id: 'f1', insumo_id: 'i2', formula_teor_ms: 45, teor_ms: 90 },
    ])
    expect(r.map((x) => x.mn_percent)).toEqual([50, 50])
  })
  it('ignora formulação sem massa', () => {
    expect(composicaoMN([{ formulacao_id: 'f1', insumo_id: 'i1', formula_teor_ms: 0, teor_ms: 0 }])).toEqual([])
  })
})

describe('montarAuditoria', () => {
  it('calcula desvio por formulação e separa creep', () => {
    const { formulacoes } = montarAuditoria({
      ...base,
      producao: [{ id: 's1', formulacao_id: 'f1', dieta_produzida: null, total_produzido: 1000 }],
      consumo: [
        { formulacao_id: 'f1', formulacao: null, kg_cocho: 700, escopo: 'lote' },
        { formulacao_id: 'f1', formulacao: null, kg_cocho: 100, escopo: 'creep' },
      ],
    })
    expect(formulacoes).toEqual([
      { formulacao: 'Proteinado', destinos: 'Sem destino (1000 kg)', produzidoKg: 1000, consumidoKg: 800, consumidoCreepKg: 100, desvioKg: 200, desvioPercent: 20 },
    ])
  })

  it('separa a produção por destino', () => {
    const { formulacoes, destinos } = montarAuditoria({
      ...base,
      producao: [
        { id: 's1', formulacao_id: 'f1', dieta_produzida: null, total_produzido: 1400, destino_producao: 'Cria' },
        { id: 's2', formulacao_id: 'f1', dieta_produzida: null, total_produzido: 600, destino_producao: 'Cria' },
        { id: 's3', formulacao_id: 'f1', dieta_produzida: null, total_produzido: 2100, destino_producao: 'Recria' },
      ],
    })
    expect(destinos).toEqual([
      { formulacao: 'Proteinado', destino: 'Cria', produzidoKg: 2000 },
      { formulacao: 'Proteinado', destino: 'Recria', produzidoKg: 2100 },
    ])
    expect(formulacoes[0].destinos).toBe('Cria (2000 kg); Recria (2100 kg)')
  })


  it('mostra consumo sem produção e produção sem consumo', () => {
    const { formulacoes } = montarAuditoria({
      ...base,
      producao: [{ id: 's1', formulacao_id: 'f1', dieta_produzida: null, total_produzido: 500 }],
      consumo: [{ formulacao_id: 'f2', formulacao: null, kg_cocho: 300, escopo: 'lote' }],
    })
    const mineral = formulacoes.find((l) => l.formulacao === 'Mineral')!
    const prot = formulacoes.find((l) => l.formulacao === 'Proteinado')!
    expect(mineral.desvioKg).toBe(-300)
    expect(mineral.desvioPercent).toBeNull()
    expect(prot.desvioKg).toBe(500)
  })

  it('cruza insumo usado na produção com consumo implícito pela composição', () => {
    const { insumos } = montarAuditoria({
      ...base,
      producao: [{ id: 's1', formulacao_id: 'f1', dieta_produzida: null, total_produzido: 1000 }],
      itens: [
        { saida_id: 's1', insumo_id: 'i1', quantidade: 600 },
        { saida_id: 's1', insumo_id: 'i2', quantidade: 400 },
      ],
      consumo: [{ formulacao_id: 'f1', formulacao: null, kg_cocho: 800, escopo: 'lote' }],
      composicao: [
        { formulacao_id: 'f1', insumo_id: 'i1', mn_percent: 60 },
        { formulacao_id: 'f1', insumo_id: 'i2', mn_percent: 40 },
      ],
    })
    expect(insumos.find((i) => i.insumo === 'Milho')).toMatchObject({ usadoProducaoKg: 600, consumoEstimadoKg: 480, desvioKg: 120 })
    expect(insumos.find((i) => i.insumo === 'Núcleo')).toMatchObject({ usadoProducaoKg: 400, consumoEstimadoKg: 320, desvioKg: 80 })
  })
})
