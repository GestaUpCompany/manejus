import { carregarLogoComoBase64 } from './relatorioConsumoPDF'
import type { DadosRelatorioMaternidade, ResumoMaternidade } from '../features/relatorioMaternidade/agregacao'

async function carregarLogo(path: string): Promise<string> {
  try {
    return await carregarLogoComoBase64(path)
  } catch {
    return ''
  }
}

export interface ParametrosRelatorioMaternidade {
  fazendaNome: string
  fazendaLogoUrl?: string | null
  dados: Pick<DadosRelatorioMaternidade, 'data_inicio' | 'data_fim' | 'registros_total'>
  resumo: ResumoMaternidade
}

// O cliente envia o resumo já calculado (features/relatorioMaternidade/agregacao.ts): o endpoint
// monta o HTML no próprio Chromium (api/pdf/_relatorios/maternidade.js) e não importa as regras do front.
export async function gerarRelatorioMaternidadePDFPuppeteer(params: ParametrosRelatorioMaternidade): Promise<Blob> {
  const { fazendaNome, fazendaLogoUrl, dados, resumo } = params

  const [logoGestao, logoFazenda] = await Promise.all([
    carregarLogo('/images/manejus360.png'),
    fazendaLogoUrl ? carregarLogo(fazendaLogoUrl) : Promise.resolve(''),
  ])

  const response = await fetch('/api/pdf/maternidade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fazendaNome,
      logoGestao,
      logoFazenda,
      data_inicio: dados.data_inicio,
      data_fim: dados.data_fim,
      registros_total: dados.registros_total,
      resumo,
    }),
  })
  if (!response.ok) {
    throw new Error(`Erro ao gerar PDF de maternidade: ${response.status}`)
  }
  return response.blob()
}
