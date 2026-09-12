import { carregarLogoComoBase64, type ParametrosRelatorioMorte } from './relatorioMortePDF'

async function carregarLogo(path: string): Promise<string> {
  try {
    return await carregarLogoComoBase64(path)
  } catch {
    return ''
  }
}

// O cliente não renderiza mais gráficos como PNG base64: o endpoint desenha
// os gráficos dentro do próprio Chromium usando Chart.js injetado no HTML.
// Isso derruba o payload de ~2-4MB (dominado pelas imagens) para ~centenas de
// KB e evita esbarrar em MAX_BODY_BYTES antes do volume real de dados importar.
export async function gerarRelatorioMortePDFPuppeteer(params: ParametrosRelatorioMorte): Promise<Blob> {
  const { dataInicio, dataFim, fazendaNome, fazendaLogoUrl, linhas, resumo } = params
  const [logoGestao, logoFazenda] = await Promise.all([
    carregarLogo('/images/manejus360.png'),
    fazendaLogoUrl ? carregarLogo(fazendaLogoUrl) : Promise.resolve(''),
  ])

  const response = await fetch('/api/pdf/morte', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataInicio, dataFim, fazendaNome, logoGestao, logoFazenda, resumo, linhas }),
  })
  if (!response.ok) {
    throw new Error(`Falha ao gerar PDF com Puppeteer (${response.status})`)
  }
  return response.blob()
}
