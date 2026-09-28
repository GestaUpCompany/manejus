import { carregarLogoComoBase64 } from './relatorioAbastecimentoPDF'
import type { DadosPDFBebedouros } from './relatorioBebedourosPDF'

async function carregarLogo(path: string): Promise<string> {
  try {
    return await carregarLogoComoBase64(path)
  } catch {
    return ''
  }
}

// O cliente não renderiza mais gráficos como PNG base64: o endpoint desenha
// os 3 gráficos (limpeza por período, limpeza do dia, problemas de checklist)
// dentro do próprio Chromium usando Chart.js injetado no HTML, no mesmo
// padrão dos relatórios de morte, consumo e abastecimento. O payload
// enviado contém só dados brutos + logos, sem imagens.
export async function gerarRelatorioBebedourosPDFPuppeteer(
  dados: DadosPDFBebedouros,
): Promise<Blob> {
  const [logoGestao, logoFazenda] = await Promise.all([
    carregarLogo('/images/manejus360.png'),
    dados.fazendaLogoUrl ? carregarLogo(dados.fazendaLogoUrl) : Promise.resolve(''),
  ])

  const payload = {
    titulo: dados.titulo,
    fazendaNome: dados.fazendaNome || '',
    logoGestao,
    logoFazenda,
    dataInicio: dados.dataInicio,
    dataFim: dados.dataFim,
    ehDiaUnico: dados.ehDiaUnico,
    diaUnico: dados.diaUnico,
    limpezaKPIs: dados.limpezaKPIs,
    maisAtrasado: dados.maisAtrasado,
    statusPorBebedouro: dados.statusPorBebedouro,
    limpezaDiaKPIs: dados.limpezaDiaKPIs,
    limpezasDoDia: dados.limpezasDoDia,
    checklistKPIs: dados.checklistKPIs,
    itensRanking: dados.itensRanking,
    ocorrencias: dados.ocorrencias,
  }

  const response = await fetch('/api/pdf/bebedouros', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(`Falha ao gerar PDF com Puppeteer (${response.status})`)
  }
  return response.blob()
}
