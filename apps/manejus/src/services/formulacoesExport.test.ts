import { describe, expect, it, vi } from 'vitest'
import { montarAbasFormulacoes, nomeArquivoFormulacoes, type DadosExportacaoFormulacoes } from './formulacoesExport'

vi.mock('@gestaup/supabase', () => ({ supabase: {} }))

const base = {
  ativo: true,
  consumo_ms_percent_pv: 2,
  peso_vivo_medio: 400,
  gmd: 1,
  sistema_producao: 'Pasto',
  forma_fornecimento: 'granel',
}

const dados = (): DadosExportacaoFormulacoes => ({
  formulacoes: [
    { ...base, id: 'tmr', nome: 'TMR Teste', tipo: 'Recria' },
    { ...base, id: 'creep', nome: 'Creep Teste', e_creep: true },
    { ...base, id: 'premix', nome: 'Premix Teste', e_premix: true },
  ],
  insumos: [
    { formulacao_id: 'tmr', formula_teor_ms: 60, ordem: 2, insumo: { id: 'b', nome: 'Milho', teor_ms: 88, preco_ton_mn: 1000 } },
    { formulacao_id: 'tmr', formula_teor_ms: 40, ordem: 1, insumo: { id: 'a', nome: 'Silagem', teor_ms: 35, preco_ton_mn: 300 } },
    { formulacao_id: 'premix', formula_teor_ms: 100, ordem: 1, insumo: { id: 'c', nome: 'Sal', teor_ms: 100, preco_ton_mn: 500 } },
  ],
  gmd: [
    { formulacao_id: 'creep', categoria: 'bezerro ao pé', gmd: 0.8, ordem: 1 },
  ],
  planos: [
    { lote_id: 'L1', lote_categoria_id: null, formulacao_id: 'tmr' },
  ],
  categorias: [
    { id: 'c1', lote_id: 'L1', lote_nome: 'Lote 1', categoria: 'boi magro', quant_atual: 30, formulacao_id: null },
    { id: 'c2', lote_id: 'L1', lote_nome: 'Lote 1', categoria: 'vaca', quant_atual: 10, formulacao_id: null },
    { id: 'c3', lote_id: 'L2', lote_nome: 'Lote 2', categoria: 'bezerro ao pé', quant_atual: 25, formulacao_id: 'creep' },
  ],
})

describe('nomeArquivoFormulacoes', () => {
  const hoje = new Date(2026, 9, 29)

  it('usa o nome da formulação quando é uma só e troca caracteres inválidos', () => {
    const f = { ...base, id: 'x', nome: 'TMR/Recria' }
    expect(nomeArquivoFormulacoes([f], hoje)).toBe('Formulações - TMR-Recria - 29-10-2026.xlsx')
  })

  it('usa a contagem quando são várias', () => {
    const fs = [{ ...base, id: 'a', nome: 'A' }, { ...base, id: 'b', nome: 'B' }]
    expect(nomeArquivoFormulacoes(fs, hoje)).toBe('Formulações - 2 formulações - 29-10-2026.xlsx')
  })
})

describe('montarAbasFormulacoes', () => {
  it('conta cabeças pelo plano vigente do lote e marca premix como sem cabeças', () => {
    const { resumo } = montarAbasFormulacoes(dados())
    const tmr = resumo.find((l) => l['Formulação'] === 'TMR Teste')!
    const premix = resumo.find((l) => l['Formulação'] === 'Premix Teste')!

    expect(tmr['Cabeças atendidas']).toBe(40)
    expect(tmr['Nº de lotes atendidos']).toBe(1)
    expect(tmr['Tipo de dieta']).toBe('TMR')
    expect(premix['Tipo de dieta']).toBe('Premix')
    expect(premix['Cabeças atendidas']).toBeNull()
    expect(premix['Nº de lotes atendidos']).toBeNull()
  })

  it('creep conta só as categorias ao pé ligadas à formulação', () => {
    const { resumo, lotes } = montarAbasFormulacoes(dados())
    const creep = resumo.find((l) => l['Formulação'] === 'Creep Teste')!

    expect(creep['Tipo de dieta']).toBe('Creep')
    expect(creep['Cabeças atendidas']).toBe(25)
    expect(lotes.filter((l) => l['Formulação'] === 'Creep Teste')).toEqual([
      { 'Formulação': 'Creep Teste', 'Lote': 'Lote 2', 'Categorias': 'bezerro ao pé', 'Cabeças': 25 },
    ])
  })

  it('ordena insumos pela ordem e a participação na MN soma 100%', () => {
    const { insumos } = montarAbasFormulacoes(dados())
    const doTmr = insumos.filter((l) => l['Formulação'] === 'TMR Teste')

    expect(doTmr.map((l) => l['Insumo'])).toEqual(['Silagem', 'Milho'])
    const soma = doTmr.reduce((s, l) => s + (l['Participação na MN (%)'] as number), 0)
    expect(soma).toBeCloseTo(100, 2)
  })

  it('gera linhas de GMD por categoria e nenhuma linha de lote sem cabeças', () => {
    const { categoriasGmd, lotes } = montarAbasFormulacoes(dados())

    expect(categoriasGmd).toEqual([
      { 'Formulação': 'Creep Teste', 'Categoria': 'bezerro ao pé', 'GMD (kg/cab/dia)': 0.8 },
    ])
    expect(lotes.every((l) => (l['Cabeças'] as number) > 0)).toBe(true)
  })
})
