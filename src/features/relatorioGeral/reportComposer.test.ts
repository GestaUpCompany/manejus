import { describe, expect, it } from 'vitest'

const COMPOSER_PATH = '../../../api/pdf/_shared/reportComposer.js'

async function composeReports(input: unknown): Promise<string> {
  const module = await import(COMPOSER_PATH)
  return module.composeReports(input)
}

const cover = {
  fazendaNome: 'Fazenda Teste',
  logoGestao: '',
  logoFazenda: '',
  logoEmpresa: '',
  imagemCapa: '',
  periodoLabel: 'Setembro de 2026',
}

describe('compositor do relatório geral', () => {
  it('cria capa e uma página vazia com paginação global', async () => {
    const html = await composeReports({
      cover,
      reports: [{
        tipo: 'morte',
        dados: {
          dataInicio: '2026-09-01',
          dataFim: '2026-09-29',
          fazendaNome: 'Fazenda Teste',
          linhas: [],
          resumo: {},
        },
      }],
    })
    expect(html).toContain('Relatórios Mensais')
    expect(html).toContain('Sem registros no período')
    expect(html).toContain('Página 1 de 2')
    expect(html).toContain('Página 2 de 2')
  })

  it('compõe renderizadores diferentes e mantém a ordem informada', async () => {
    const morte = {
      dataInicio: '2026-09-01', dataFim: '2026-09-29', fazendaNome: 'Fazenda Teste', logoGestao: '', logoFazenda: '',
      linhas: [{ id: '1', data: '2026-09-02', lote_nome: 'Lote 1', pasto: 'P1', sexo: 'Macho', idade: '1', peso_vivo: 300, categoria: 'Garrote', causa_morte: 'Acidente', diagnosticos: null }],
      resumo: { total_mortes: 1, media_por_dia: 1, peso_medio: 300, causa_mais_frequente: 'Acidente', causa_mais_frequente_count: 1, por_causa: [{ label: 'Acidente', valor: 1 }], por_categoria: [{ label: 'Garrote', valor: 1 }], por_sexo: [{ label: 'Macho', valor: 1 }], por_pasto: [{ label: 'P1', valor: 1 }], matriz_causa_categoria: { causas: ['Acidente'], categorias: ['Garrote'], matriz: { Acidente: { Garrote: 1 } } }, frequencia_diagnosticos: [] },
    }
    const consumo = {
      dataInicio: '2026-09-01', dataFim: '2026-09-29', fazendaNome: 'Fazenda Teste', logoGestao: '', logoFazenda: '',
      lotes: [{ info: { lote_nome: 'Lote 1', peso_entrada_kg: 250, peso_atual_kg: 300, dias: 20, data_prevista_final: '2026-10-01', n_cabecas_atual: 10, raca: 'Nelore', categoria: 'Garrote', dieta: 'Dieta 1' }, dados: [{ data: '2026-09-02', data_label: '02/09', trato_kg_cab_dia: 5, consumo_percent_pv: 1.7, leitura_cocho: 1, custo_reais_cab_dia: 4 }] }],
    }
    const html = await composeReports({
      cover,
      reports: [
        { tipo: 'consumo', dados: consumo },
        { tipo: 'morte', dados: morte },
      ],
    })
    expect(html.indexOf('Análise de Consumo')).toBeLessThan(html.indexOf('Relatório de Mortalidade'))
    expect(html).toContain('Página 2 de 7')
    expect(html).toContain('Página 7 de 7')
  })
})
