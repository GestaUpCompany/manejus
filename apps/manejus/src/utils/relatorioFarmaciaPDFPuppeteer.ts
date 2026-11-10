import { carregarLogoComoBase64 } from './relatorioConsumoPDF'
import type { DadosRelatorioFarmacia, ResumoFarmacia } from '../features/relatorioFarmacia/agregacao'

async function carregarLogo(path: string): Promise<string> {
  try {
    return await carregarLogoComoBase64(path)
  } catch {
    return ''
  }
}

export interface ParametrosRelatorioFarmacia {
  fazendaNome: string
  fazendaLogoUrl?: string | null
  dados: Pick<DadosRelatorioFarmacia, 'data_inicio' | 'data_fim'>
  resumo: ResumoFarmacia
}

// O cliente envia o resumo já calculado (features/relatorioFarmacia/agregacao.ts): o endpoint
// monta o HTML no próprio Chromium (api/pdf/_relatorios/farmacia.js) e não importa as regras do front.
export async function gerarRelatorioFarmaciaPDFPuppeteer(params: ParametrosRelatorioFarmacia): Promise<Blob> {
  const { fazendaNome, fazendaLogoUrl, dados, resumo } = params

  const [logoGestao, logoFazenda] = await Promise.all([
    carregarLogo('/images/manejus360.png'),
    fazendaLogoUrl ? carregarLogo(fazendaLogoUrl) : Promise.resolve(''),
  ])

  const response = await fetch('/api/pdf/farmacia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fazendaNome,
      logoGestao,
      logoFazenda,
      data_inicio: dados.data_inicio,
      data_fim: dados.data_fim,
      resumo,
    }),
  })
  if (!response.ok) {
    throw new Error(`Erro ao gerar PDF de farmácia: ${response.status}`)
  }
  return response.blob()
}
