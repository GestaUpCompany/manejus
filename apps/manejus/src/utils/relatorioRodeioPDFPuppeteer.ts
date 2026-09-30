import { carregarLogoComoBase64 } from './relatorioConsumoPDF'
import type { RegistroRodeio, ResumoRodeio } from '../features/relatorioRodeio/agregacao'

async function carregarLogo(path: string): Promise<string> {
  try {
    return await carregarLogoComoBase64(path)
  } catch {
    return ''
  }
}

export interface ParametrosRelatorioRodeio {
  dataInicio: string
  dataFim: string
  fazendaNome: string
  fazendaLogoUrl?: string | null
  resumo: ResumoRodeio
  registros: RegistroRodeio[]
}

// O cliente envia só os dados brutos/agregados: o endpoint monta o HTML e
// desenha os gráficos dentro do próprio Chromium via Chart.js injetado,
// no mesmo padrão dos demais relatórios (ver api/pdf/clima.js).
export async function gerarRelatorioRodeioPDFPuppeteer(
  params: ParametrosRelatorioRodeio,
): Promise<Blob> {
  const { dataInicio, dataFim, fazendaNome, fazendaLogoUrl, resumo, registros } = params

  const [logoGestao, logoFazenda] = await Promise.all([
    carregarLogo('/images/manejus360.png'),
    fazendaLogoUrl ? carregarLogo(fazendaLogoUrl) : Promise.resolve(''),
  ])

  const response = await fetch('/api/pdf/rodeio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dataInicio,
      dataFim,
      fazendaNome,
      logoGestao,
      logoFazenda,
      resumo,
      registros,
    }),
  })
  if (!response.ok) {
    throw new Error(`Erro ao gerar PDF de rodeio: ${response.status}`)
  }
  return response.blob()
}
