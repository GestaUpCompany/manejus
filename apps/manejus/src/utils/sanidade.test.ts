import { describe, expect, it } from 'vitest'
import {
  aplicarMedicamentoNoForm,
  carenciaAtiva,
  dosesAVencer,
  formVazioAplicacao,
  formVazioAplicacaoLote,
  montarAplicacaoLoteParaGravar,
  montarAplicacaoParaGravar,
  validarAplicacaoLote,
  textoCarencia,
  textoDose,
  validarAplicacao,
  type LinhaHistoricoSanitario,
  type MedicamentoCatalogo,
} from './sanidade'

const HOJE = '2026-10-16'
const linha = (over: Partial<LinhaHistoricoSanitario>): LinhaHistoricoSanitario => ({
  origem: 'aplicacao', data: '2026-10-01', liberacao_abate_em: null, proxima_aplicacao_em: null, medicamento_nome: 'Ivermectina', ...over,
})
const med: MedicamentoCatalogo = {
  id: 'm1', nome_comercial: 'Ivomec', principio_ativo: 'Ivermectina', dose_recomendada: '1ml/50kg', carencia_abate_dias: 28, intervalo_reaplicacao_dias: 90,
}

describe('formulário de aplicação', () => {
  it('escolher o produto do catálogo preenche os campos e preserva a dose já digitada', () => {
    const f = aplicarMedicamentoNoForm(formVazioAplicacao(HOJE), med)
    expect(f).toMatchObject({ medicamentoId: 'm1', medicamentoNome: 'Ivomec', dose: '1ml/50kg', carenciaDias: '28', intervaloDias: '90' })
    expect(aplicarMedicamentoNoForm({ ...formVazioAplicacao(HOJE), dose: '2 ml' }, med).dose).toBe('2 ml')
  })

  it('valida produto, data, carência, intervalo e validade', () => {
    const base = { ...formVazioAplicacao(HOJE), medicamentoNome: 'X' }
    expect(validarAplicacao(base, HOJE)).toEqual([])
    expect(validarAplicacao({ ...base, medicamentoNome: ' ' }, HOJE)).toContain('Informe o produto aplicado')
    expect(validarAplicacao({ ...base, data: '2026-10-20' }, HOJE)).toContain('A data da aplicação não pode ser futura')
    expect(validarAplicacao({ ...base, carenciaDias: '-1' }, HOJE)).toHaveLength(1)
    expect(validarAplicacao({ ...base, carenciaDias: '2.5' }, HOJE)).toHaveLength(1)
    expect(validarAplicacao({ ...base, intervaloDias: '0' }, HOJE)).toHaveLength(1)
    expect(validarAplicacao({ ...base, validadeProduto: '2026-10-01' }, HOJE)).toContain('O produto estava vencido na data da aplicação')
  })

  it('monta a linha com nulos para campos vazios e números nos dias', () => {
    const f = { ...aplicarMedicamentoNoForm(formVazioAplicacao(HOJE), med), via: ' SC ', observacao: '' }
    expect(montarAplicacaoParaGravar(f, 'faz', 'ind')).toMatchObject({
      fazenda_id: 'faz', individuo_id: 'ind', medicamento_id: 'm1', via_aplicacao: 'SC', observacao: null, carencia_abate_dias: 28, intervalo_reaplicacao_dias: 90, origem: 'painel',
    })
    const livre = montarAplicacaoParaGravar({ ...formVazioAplicacao(HOJE), medicamentoNome: 'Caseiro' }, 'faz', 'ind')
    expect(livre).toMatchObject({ medicamento_id: null, carencia_abate_dias: null, intervalo_reaplicacao_dias: null })
  })
})

describe('aplicação em lote', () => {
  const base = { ...formVazioAplicacaoLote(HOJE), medicamentoNome: 'Aftosa', loteId: 'L1', numeroCabecas: '80' }

  it('valida lote e número de cabeças além dos campos comuns', () => {
    expect(validarAplicacaoLote(base, HOJE)).toEqual([])
    expect(validarAplicacaoLote({ ...base, loteId: '' }, HOJE)).toContain('Escolha o lote')
    expect(validarAplicacaoLote({ ...base, numeroCabecas: '' }, HOJE)).toHaveLength(1)
    expect(validarAplicacaoLote({ ...base, numeroCabecas: '0' }, HOJE)).toHaveLength(1)
    expect(validarAplicacaoLote({ ...base, numeroCabecas: '7,5' }, HOJE)).toHaveLength(1)
  })

  it('monta a linha com o lote, a categoria e as cabeças, sem animal', () => {
    const l = montarAplicacaoLoteParaGravar({ ...base, categoria: 'Novilha', carenciaDias: '21' }, 'faz')
    expect(l).toMatchObject({ fazenda_id: 'faz', lote_id: 'L1', categoria: 'Novilha', numero_cabecas: 80, carencia_abate_dias: 21, medicamento_nome: 'Aftosa' })
    expect('individuo_id' in l).toBe(false)
    expect(montarAplicacaoLoteParaGravar(base, 'faz').categoria).toBeNull()
  })
})

describe('carência e próximas doses', () => {
  it('carência ativa é a liberação mais distante ainda no futuro; hoje já conta como liberado', () => {
    const c = carenciaAtiva([linha({ liberacao_abate_em: '2026-10-20' }), linha({ liberacao_abate_em: '2026-10-29', medicamento_nome: 'Tulissin' }), linha({ liberacao_abate_em: '2026-10-16' })], HOJE)
    expect(c).toEqual({ liberadoEm: '2026-10-29', diasRestantes: 13, medicamento: 'Tulissin' })
    expect(carenciaAtiva([linha({ liberacao_abate_em: '2026-10-16' }), linha({})], HOJE)).toBeNull()
    expect(textoCarencia(c!)).toContain('29/10/2026')
  })

  it('dose a vencer: uma por produto (aplicação mais recente), vencidas e dentro da janela', () => {
    const doses = dosesAVencer(
      [
        linha({ data: '2026-04-01', proxima_aplicacao_em: '2026-09-28' }),
        linha({ data: '2026-10-01', proxima_aplicacao_em: '2027-03-30' }),
        linha({ medicamento_nome: 'Aftosa', data: '2026-05-10', proxima_aplicacao_em: '2026-10-10' }),
        linha({ medicamento_nome: 'Brucelose', data: '2026-10-05', proxima_aplicacao_em: '2026-11-05' }),
        linha({ medicamento_nome: 'Raiva', data: '2026-10-05', proxima_aplicacao_em: '2026-12-20' }),
      ],
      HOJE
    )
    expect(doses.map((d) => d.medicamento)).toEqual(['Aftosa', 'Brucelose'])
    expect(doses[0].atrasada).toBe(true)
    expect(textoDose(doses[0])).toBe('Aftosa: dose atrasada desde 10/10/2026')
    expect(textoDose(doses[1])).toBe('Brucelose: próxima dose em 05/11/2026')
  })
})
