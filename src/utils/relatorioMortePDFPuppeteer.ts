import {
  carregarLogoComoBase64,
  renderizarGraficoMortesTempo,
  renderizarGraficoBarrasHorizontais,
  renderizarGraficoDonut,
  type ParametrosRelatorioMorte,
} from './relatorioMortePDF'

async function carregarLogo(path: string): Promise<string> {
  try {
    return await carregarLogoComoBase64(path)
  } catch {
    return ''
  }
}

export async function gerarRelatorioMortePDFPuppeteer(params: ParametrosRelatorioMorte): Promise<Blob> {
  const { dataInicio, dataFim, fazendaNome, fazendaLogoUrl, linhas, resumo } = params
  const chartW = 135
  const chartH = 85
  const [logoGestao, logoFazenda, chartTempo, chartCausa, chartCategoria, chartSexo] = await Promise.all([
    carregarLogo('/images/manejus360.png'),
    fazendaLogoUrl ? carregarLogo(fazendaLogoUrl) : Promise.resolve(''),
    renderizarGraficoMortesTempo(linhas, chartW, chartH).catch(() => null),
    renderizarGraficoBarrasHorizontais(resumo.por_causa, 'Mortes por causa', chartW, chartH).catch(() => null),
    renderizarGraficoBarrasHorizontais(resumo.por_categoria, 'Mortes por categoria', chartW, chartH).catch(() => null),
    renderizarGraficoDonut(resumo.por_sexo, 'Mortes por sexo', chartW, chartH).catch(() => null),
  ])

  const response = await fetch('/api/pdf/morte', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataInicio, dataFim, fazendaNome, logoGestao, logoFazenda, resumo, linhas, chartTempo, chartCausa, chartCategoria, chartSexo }),
  })
  if (!response.ok) {
    throw new Error(`Falha ao gerar PDF com Puppeteer (${response.status})`)
  }
  return response.blob()
}
