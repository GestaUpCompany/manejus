import { describe, expect, it } from 'vitest'
import {
  MODELOS_PROGRAMACAO,
  agruparPendencias,
  formDaProgramacao,
  formDoModelo,
  formVazioProgramacao,
  listaDeCategorias,
  montarProgramacaoParaGravar,
  rotuloPeriodo,
  textoPrazo,
  validarProgramacao,
  type PendenciaCalendario,
  type ProgramacaoSanitaria,
} from './calendarioSanitario'

const valido = () => ({ ...formVazioProgramacao(), nome: 'Aftosa maio', produtoNome: 'Vacina X', dataBase: '2026-05-10' })

describe('validação', () => {
  it('formulário vazio pede nome, produto e data', () => {
    const e = validarProgramacao(formVazioProgramacao())
    expect(e).toHaveLength(3)
  })

  it('válido não tem erros', () => {
    expect(validarProgramacao(valido())).toEqual([])
  })

  it('limites de período, antecedência e prazo', () => {
    expect(validarProgramacao({ ...valido(), periodoMeses: '0' })).toHaveLength(1)
    expect(validarProgramacao({ ...valido(), periodoMeses: '61' })).toHaveLength(1)
    expect(validarProgramacao({ ...valido(), periodoMeses: '1,5' })).toHaveLength(1)
    expect(validarProgramacao({ ...valido(), antecedenciaDias: '121' })).toHaveLength(1)
    expect(validarProgramacao({ ...valido(), antecedenciaDias: '0' })).toEqual([])
    expect(validarProgramacao({ ...valido(), prazoDias: '0' })).toHaveLength(1)
    expect(validarProgramacao({ ...valido(), dataBase: '2026-13-45' })).toHaveLength(1)
  })
})

describe('payload e modelos', () => {
  it('monta a linha da tabela com categorias limpas', () => {
    const p = montarProgramacaoParaGravar({ ...valido(), categorias: ' garrote, Garrote , boi magro,, ', observacao: ' ' }, 'F1')
    expect(p).toEqual({
      fazenda_id: 'F1', nome: 'Aftosa maio', tipo: 'Vacinação', medicamento_id: null, produto_nome: 'Vacina X',
      categorias: ['garrote', 'boi magro'], data_base: '2026-05-10', periodo_meses: 12, antecedencia_dias: 15, prazo_dias: 60, observacao: null,
    })
  })

  it('lista de categorias', () => {
    expect(listaDeCategorias('')).toEqual([])
    expect(listaDeCategorias('a,A, b')).toEqual(['a', 'b'])
  })

  it('modelos não trazem data e viram formulário editável', () => {
    for (const m of MODELOS_PROGRAMACAO) expect(formDoModelo(m).dataBase).toBe('')
    const f = formDoModelo(MODELOS_PROGRAMACAO[0])
    expect(f.periodoMeses).toBe('6')
    expect(validarProgramacao(f)).toHaveLength(1)
    expect(validarProgramacao({ ...f, dataBase: '2026-11-01' })).toEqual([])
  })

  it('ida e volta do formulário de edição', () => {
    const p: ProgramacaoSanitaria = {
      id: '1', nome: 'N', tipo: 'Vermifugação', medicamento_id: 'm1', produto_nome: 'P', categorias: ['a', 'b'], data_base: '2026-01-01',
      periodo_meses: 6, antecedencia_dias: 10, prazo_dias: 30, observacao: null, ativo: true,
    }
    const f = formDaProgramacao(p)
    expect(f).toMatchObject({ medicamentoId: 'm1', categorias: 'a, b', periodoMeses: '6', observacao: '' })
    expect(montarProgramacaoParaGravar(f, 'F')).toMatchObject({ medicamento_id: 'm1', categorias: ['a', 'b'], periodo_meses: 6 })
  })
})

describe('textos', () => {
  it('período e prazo', () => {
    expect(rotuloPeriodo(12)).toBe('Anual')
    expect(rotuloPeriodo(6)).toBe('Semestral')
    expect(rotuloPeriodo(24)).toBe('A cada 2 anos')
    expect(rotuloPeriodo(5)).toBe('A cada 5 meses')
    expect(textoPrazo('atrasada', -15)).toBe('atrasada há 15 dias')
    expect(textoPrazo('atrasada', -1)).toBe('atrasada há 1 dia')
    expect(textoPrazo('a_vencer', 0)).toBe('é hoje')
    expect(textoPrazo('a_vencer', 9)).toBe('faltam 9 dias')
  })
})

describe('agrupamento', () => {
  const p = (programacao_id: string, situacao: 'atrasada' | 'a_vencer', dias: number, lote: string, quant: number): PendenciaCalendario => ({
    programacao_id, nome: `Prog ${programacao_id}`, produto_nome: 'X', lote_id: lote, lote_nome: lote, categoria: 'c', quant_atual: quant,
    ocorrencia: '2026-10-01', situacao, dias, cabecas_aplicadas: 0,
  })

  it('agrupa por programação, soma cabeças e põe as atrasadas primeiro', () => {
    const g = agruparPendencias([p('a', 'a_vencer', 9, 'L1', 70), p('b', 'atrasada', -15, 'L2', 60), p('b', 'atrasada', -15, 'L3', 2)])
    expect(g.map((x) => x.programacaoId)).toEqual(['b', 'a'])
    expect(g[0].itens).toHaveLength(2)
    expect(g[0].totalCabecas).toBe(62)
  })

  it('mais atrasada primeiro entre as atrasadas; menos dias primeiro entre as a vencer', () => {
    const g = agruparPendencias([p('a', 'atrasada', -2, 'L1', 1), p('b', 'atrasada', -20, 'L1', 1), p('c', 'a_vencer', 10, 'L1', 1), p('d', 'a_vencer', 3, 'L1', 1)])
    expect(g.map((x) => x.programacaoId)).toEqual(['b', 'a', 'd', 'c'])
  })
})
