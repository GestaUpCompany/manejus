import { describe, expect, it } from 'vitest'
import { DIAS_ALERTA_VALIDADE, lotesComSaldo, movimentosComSaldo, sinalMovimento, situacaoValidade, unidadeNaQuantidade, validarReclassificacao, type MovimentoFarmacia } from './logica'

describe('plural da unidade na quantidade', () => {
  it('pluraliza só acima de 1 e só unidades de contagem', () => {
    expect(unidadeNaQuantidade('dose', 3)).toBe('doses')
    expect(unidadeNaQuantidade('frasco', 19)).toBe('frascos')
    expect(unidadeNaQuantidade('caixa', 2)).toBe('caixas')
    expect(unidadeNaQuantidade('frasco', 1)).toBe('frasco')
    expect(unidadeNaQuantidade('frasco', 0.5)).toBe('frasco')
    expect(unidadeNaQuantidade('mL', 500)).toBe('mL')
    expect(unidadeNaQuantidade('kg', 12)).toBe('kg')
  })
})

let seq = 0
function mov(parcial: Partial<MovimentoFarmacia>): MovimentoFarmacia {
  seq += 1
  return {
    id: `m${String(seq).padStart(4, '0')}`, medicamento_id: 'i', tipo_movimentacao: 'entrada', quantidade: 0, custo_unitario: null, valor_total: null,
    data: '2026-10-01', origem: null, fornecedor: null, nota_fiscal: null, lote_produto: null, validade: null, observacao: null, unidade: 'frasco', registro_origem_id: null,
    created_at: `2026-10-01T10:00:${String(seq % 60).padStart(2, '0')}Z`, ...parcial,
  }
}

const HOJE = '2026-10-30'

describe('validade dos lotes', () => {
  it('classifica vencido, a vencer dentro do prazo e ok', () => {
    expect(situacaoValidade('2026-10-29', HOJE).situacao).toBe('vencido')
    expect(situacaoValidade('2026-10-30', HOJE).situacao).toBe('vence_em_breve')
    expect(situacaoValidade('2026-12-29', HOJE)).toEqual({ situacao: 'vence_em_breve', dias: DIAS_ALERTA_VALIDADE })
    expect(situacaoValidade('2026-12-30', HOJE).situacao).toBe('ok')
    expect(situacaoValidade(null, HOJE)).toEqual({ situacao: 'sem_validade', dias: null })
  })

  it('separa lotes por entrada e ordena pelo vencimento mais próximo', () => {
    const lotes = lotesComSaldo([
      mov({ tipo_movimentacao: 'entrada', quantidade: 10, lote_produto: 'B2', validade: '2027-06-01' }),
      mov({ tipo_movimentacao: 'entrada', quantidade: 4, lote_produto: 'A1', validade: '2026-12-01' }),
    ])
    expect(lotes.map((l) => [l.lote, l.saldo])).toEqual([['A1', 4], ['B2', 10]])
  })

  it('baixa sai do lote que vence primeiro (FEFO)', () => {
    const lotes = lotesComSaldo([
      mov({ tipo_movimentacao: 'entrada', quantidade: 4, lote_produto: 'A1', validade: '2026-12-01' }),
      mov({ tipo_movimentacao: 'entrada', quantidade: 10, lote_produto: 'B2', validade: '2027-06-01' }),
      mov({ tipo_movimentacao: 'baixa', quantidade: 6, data: '2026-10-20' }),
    ])
    expect(lotes.map((l) => [l.lote, l.saldo])).toEqual([['B2', 8]])
  })

  it('lote zerado some da lista', () => {
    const lotes = lotesComSaldo([
      mov({ tipo_movimentacao: 'entrada', quantidade: 2, lote_produto: 'A1', validade: '2026-12-01' }),
      mov({ tipo_movimentacao: 'baixa', quantidade: 2 }),
    ])
    expect(lotes).toEqual([])
  })

  it('ajuste reduz pelo FEFO e aumento entra sem lote', () => {
    const base = [mov({ tipo_movimentacao: 'entrada', quantidade: 5, lote_produto: 'A1', validade: '2026-12-01' })]
    expect(lotesComSaldo([...base, mov({ tipo_movimentacao: 'ajuste', quantidade: 3 })])[0].saldo).toBe(3)
    const sobra = lotesComSaldo([...base, mov({ tipo_movimentacao: 'ajuste', quantidade: 7 })])
    expect(sobra.map((l) => [l.lote, l.saldo])).toEqual([['A1', 5], [null, 2]])
  })
})

describe('reclassificação de lote e validade', () => {
  const entrada = () => mov({ tipo_movimentacao: 'entrada', quantidade: 13 })
  const rec = (quantidade: number, p: Partial<MovimentoFarmacia> = {}) =>
    mov({ tipo_movimentacao: 'reclassificacao', quantidade, lote_origem: null, validade_origem: null, lote_produto: 'L1', validade: '2027-02-28', ...p })

  it('move parte do saldo para o novo lote, sem mudar o total', () => {
    const lotes = lotesComSaldo([entrada(), rec(5)])
    expect(lotes.map((l) => [l.lote, l.saldo])).toEqual([['L1', 5], [null, 8]])
  })

  it('soma ao lote de destino que já existe', () => {
    const lotes = lotesComSaldo([entrada(), mov({ tipo_movimentacao: 'entrada', quantidade: 1, lote_produto: 'L1', validade: '2027-02-28' }), rec(5)])
    expect(lotes.map((l) => [l.lote, l.saldo])).toEqual([['L1', 6], [null, 8]])
  })

  it('nunca move mais do que a origem tem naquele ponto', () => {
    expect(lotesComSaldo([mov({ tipo_movimentacao: 'entrada', quantidade: 3 }), rec(5)]).map((l) => [l.lote, l.saldo])).toEqual([['L1', 3]])
    expect(lotesComSaldo([rec(5)])).toEqual([])
  })

  it('não altera o saldo do histórico', () => {
    const r = movimentosComSaldo([entrada(), rec(5)])
    expect(r[1].variacao).toBe(0)
    expect(r[1].saldo_apos).toBe(13)
    expect(sinalMovimento({ tipo_movimentacao: 'reclassificacao', quantidade: 5 })).toEqual({ sinal: '⇄', qtd: 5 })
  })

  it('valida quantidade, destino e mudança real', () => {
    const origem = { lote: null, validade: null, saldo: 13 }
    const f = (quantidade: string, lote = 'L1', validade = '') => validarReclassificacao({ quantidade, lote, validade, observacao: '' }, origem)
    expect(f('5')).toEqual({ ok: true, valores: { quantidade: 5, lote: 'L1', validade: null } })
    for (const q of ['0', '1,5', '14', '']) expect(f(q).ok).toBe(false)
    expect(f('5', ' ').ok).toBe(false)
    expect(validarReclassificacao({ quantidade: '1', lote: 'A', validade: '', observacao: '' }, { lote: 'A', validade: null, saldo: 2 }).ok).toBe(false)
  })
})
