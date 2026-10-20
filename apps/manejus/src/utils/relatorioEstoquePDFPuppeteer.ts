import { carregarLogoComoBase64 } from './relatorioConsumoPDF'
import { classificarABC, type DadosRelatorioEstoque } from '../features/relatorioEstoque/agregacao'

async function carregarLogo(path: string): Promise<string> {
  try {
    return await carregarLogoComoBase64(path)
  } catch {
    return ''
  }
}

export interface ParametrosRelatorioEstoque {
  fazendaNome: string
  fazendaLogoUrl?: string | null
  dados: DadosRelatorioEstoque
  // Limita o extrato enviado (Infográfico Mensal tem payload máximo de 4 MB).
  maxMovimentacoes?: number
}

// O cliente envia só os dados da RPC mais a curva ABC (regra em
// features/relatorioEstoque/agregacao.ts): o endpoint monta o HTML no próprio
// Chromium, no mesmo padrão dos demais relatórios (ver api/pdf/estoque.js).
export async function gerarRelatorioEstoquePDFPuppeteer(
  params: ParametrosRelatorioEstoque,
): Promise<Blob> {
  const { fazendaNome, fazendaLogoUrl, dados, maxMovimentacoes } = params

  const [logoGestao, logoFazenda] = await Promise.all([
    carregarLogo('/images/manejus360.png'),
    fazendaLogoUrl ? carregarLogo(fazendaLogoUrl) : Promise.resolve(''),
  ])

  const movimentacoes = dados.movimentacoes ?? []
  const abc = Object.fromEntries(
    [...classificarABC(dados.itens)].map(([chave, classe]) => [chave, classe]),
  )

  const response = await fetch('/api/pdf/estoque', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fazendaNome,
      logoGestao,
      logoFazenda,
      gerado_em: dados.gerado_em,
      data_inicio: dados.data_inicio ?? null,
      data_fim: dados.data_fim ?? null,
      tem_periodo: dados.tem_periodo ?? false,
      escopo: dados.escopo,
      itens: dados.itens,
      totais: dados.totais,
      abc,
      movimentacoes: maxMovimentacoes ? movimentacoes.slice(0, maxMovimentacoes) : movimentacoes,
      movimentacoes_total: movimentacoes.length,
    }),
  })
  if (!response.ok) {
    throw new Error(`Erro ao gerar PDF de estoque: ${response.status}`)
  }
  return response.blob()
}
