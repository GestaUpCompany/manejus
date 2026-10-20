import { carregarLogoComoBase64 } from './relatorioConsumoPDF'
import type { DadosRelatorioEstoqueCombustivel } from '../features/relatorioEstoqueCombustivel/agregacao'

async function carregarLogo(path: string): Promise<string> {
  try {
    return await carregarLogoComoBase64(path)
  } catch {
    return ''
  }
}

export interface ParametrosRelatorioEstoqueCombustivel {
  fazendaNome: string
  fazendaLogoUrl?: string | null
  dados: DadosRelatorioEstoqueCombustivel
}

// O cliente envia só os dados da RPC: o endpoint monta o HTML no próprio
// Chromium, no mesmo padrão dos demais relatórios (ver api/pdf/estoqueCombustivel.js).
export async function gerarRelatorioEstoqueCombustivelPDFPuppeteer(
  params: ParametrosRelatorioEstoqueCombustivel,
): Promise<Blob> {
  const { fazendaNome, fazendaLogoUrl, dados } = params

  const [logoGestao, logoFazenda] = await Promise.all([
    carregarLogo('/images/manejus360.png'),
    fazendaLogoUrl ? carregarLogo(fazendaLogoUrl) : Promise.resolve(''),
  ])

  const response = await fetch('/api/pdf/estoqueCombustivel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fazendaNome,
      logoGestao,
      logoFazenda,
      gerado_em: dados.gerado_em,
      data_inicio: dados.data_inicio,
      data_fim: dados.data_fim,
      tanques: dados.tanques,
      movimentacoes: dados.movimentacoes,
    }),
  })
  if (!response.ok) {
    throw new Error(`Erro ao gerar PDF de estoque de combustível: ${response.status}`)
  }
  return response.blob()
}
