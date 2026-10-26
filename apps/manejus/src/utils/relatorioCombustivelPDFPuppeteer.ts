import { carregarLogoComoBase64, type DadosPDFRelatorioAbastecimento } from './relatorioAbastecimentoPDF'
import type { DadosRelatorioEstoqueCombustivel } from '../features/relatorioEstoqueCombustivel/agregacao'

async function carregarLogo(path: string): Promise<string> {
  try {
    return await carregarLogoComoBase64(path)
  } catch {
    return ''
  }
}

export interface ParametrosRelatorioCombustivel {
  abastecimento: DadosPDFRelatorioAbastecimento
  estoque: DadosRelatorioEstoqueCombustivel & { fazendaNome: string; fazendaLogoUrl?: string | null }
}

// Um PDF só: o endpoint /api/pdf/combustivel monta a parte de abastecimento e a de estoque.
// O abastecimento vai sem tanques, para a tabela de tanques não aparecer duas vezes.
export async function gerarRelatorioCombustivelPDFPuppeteer(
  params: ParametrosRelatorioCombustivel,
): Promise<Blob> {
  const { abastecimento, estoque } = params

  const [logoGestao, logoFazenda] = await Promise.all([
    carregarLogo('/images/manejus360.png'),
    abastecimento.fazendaLogoUrl ? carregarLogo(abastecimento.fazendaLogoUrl) : Promise.resolve(''),
  ])

  const response = await fetch('/api/pdf/combustivel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      abastecimento: {
        titulo: abastecimento.titulo,
        fazendaNome: abastecimento.fazendaNome || '',
        logoGestao,
        logoFazenda,
        filtros: abastecimento.filtros,
        porMaquina: abastecimento.porMaquina,
        porCombustivel: abastecimento.porCombustivel,
        porOperacao: abastecimento.porOperacao,
        totalLitros: abastecimento.totalLitros,
        totalRegistros: abastecimento.totalRegistros,
        detalhesPorMaquina: abastecimento.detalhesPorMaquina,
        tanques: [],
        geradoEm: abastecimento.geradoEm ?? '',
      },
      estoque: {
        fazendaNome: estoque.fazendaNome,
        logoGestao,
        logoFazenda,
        gerado_em: estoque.gerado_em,
        data_inicio: estoque.data_inicio,
        data_fim: estoque.data_fim,
        tanques: estoque.tanques,
        movimentacoes: estoque.movimentacoes,
      },
    }),
  })
  if (!response.ok) {
    throw new Error(`Erro ao gerar PDF de combustível: ${response.status}`)
  }
  return response.blob()
}
