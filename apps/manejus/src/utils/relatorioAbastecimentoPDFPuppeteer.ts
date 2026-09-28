import { carregarLogoComoBase64, type DadosPDFRelatorioAbastecimento } from './relatorioAbastecimentoPDF'

async function carregarLogo(path: string): Promise<string> {
  try {
    return await carregarLogoComoBase64(path)
  } catch {
    return ''
  }
}

// O cliente não renderiza mais gráficos como PNG base64: o endpoint desenha
// os 3 gráficos de barras (máquina, combustível, operação) dentro do próprio
// Chromium usando Chart.js injetado no HTML, no mesmo padrão dos relatórios
// de morte e consumo. O payload enviado contém só agregados + detalhes por
// máquina + logos, sem imagens.
export async function gerarRelatorioAbastecimentoPDFPuppeteer(
  dados: DadosPDFRelatorioAbastecimento,
): Promise<Blob> {
  const [logoGestao, logoFazenda] = await Promise.all([
    carregarLogo('/images/manejus360.png'),
    dados.fazendaLogoUrl ? carregarLogo(dados.fazendaLogoUrl) : Promise.resolve(''),
  ])

  // Envia só os campos que o endpoint usa. fazendaNome e fazendaLogoUrl
  // já estão em dados; o wrapper só carrega os logos como base64.
  const payload = {
    titulo: dados.titulo,
    fazendaNome: dados.fazendaNome || '',
    logoGestao,
    logoFazenda,
    filtros: dados.filtros,
    porMaquina: dados.porMaquina,
    porCombustivel: dados.porCombustivel,
    porOperacao: dados.porOperacao,
    totalLitros: dados.totalLitros,
    totalRegistros: dados.totalRegistros,
    detalhesPorMaquina: dados.detalhesPorMaquina,
  }

  const response = await fetch('/api/pdf/abastecimento', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(`Falha ao gerar PDF com Puppeteer (${response.status})`)
  }
  return response.blob()
}
