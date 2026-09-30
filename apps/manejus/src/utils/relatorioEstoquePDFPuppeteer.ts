import { carregarLogoComoBase64 } from './relatorioConsumoPDF'
import type { DadosRelatorioEstoque } from '../features/relatorioEstoque/agregacao'

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
}

// O cliente envia só os dados brutos/agregados: o endpoint monta o HTML no
// próprio Chromium, no mesmo padrão dos demais relatórios
// (ver api/pdf/estoque.js).
export async function gerarRelatorioEstoquePDFPuppeteer(
  params: ParametrosRelatorioEstoque,
): Promise<Blob> {
  const { fazendaNome, fazendaLogoUrl, dados } = params

  const [logoGestao, logoFazenda] = await Promise.all([
    carregarLogo('/images/manejus360.png'),
    fazendaLogoUrl ? carregarLogo(fazendaLogoUrl) : Promise.resolve(''),
  ])

  const response = await fetch('/api/pdf/estoque', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fazendaNome,
      logoGestao,
      logoFazenda,
      gerado_em: dados.gerado_em,
      escopo: dados.escopo,
      itens: dados.itens,
      totais: dados.totais,
    }),
  })
  if (!response.ok) {
    throw new Error(`Erro ao gerar PDF de estoque: ${response.status}`)
  }
  return response.blob()
}
