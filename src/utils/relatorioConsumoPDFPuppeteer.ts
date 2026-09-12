import { carregarLogoComoBase64 } from './relatorioConsumoPDF'
import type { ParametrosRelatorioConsumo } from './relatorioConsumoPDF'

async function carregarLogo(path: string): Promise<string> {
  try {
    return await carregarLogoComoBase64(path)
  } catch {
    return ''
  }
}

// O cliente não renderiza mais gráficos como PNG base64: o endpoint desenha
// o gráfico composto (CMS/%PV/Leitura de Cocho) dentro do próprio Chromium
// usando Chart.js injetado no HTML, no mesmo padrão do relatório de morte.
// O payload enviado contém só os dados brutos por lote + logos, sem imagens.
export async function gerarRelatorioConsumoPDFPuppeteer(
  params: ParametrosRelatorioConsumo & { fazendaNome: string; fazendaLogoUrl?: string | null },
): Promise<Blob> {
  const { dataInicio, dataFim, lotes, fazendaNome, fazendaLogoUrl } = params

  const [logoGestao, logoFazenda] = await Promise.all([
    carregarLogo('/images/manejus360.png'),
    fazendaLogoUrl ? carregarLogo(fazendaLogoUrl) : Promise.resolve(''),
  ])

  // Envia só os campos que o endpoint usa: info (identificação + KPIs) e
  // dados (pontos do gráfico). Campos como fazenda_id, fazenda_nome,
  // fazenda_logo_url e erro ficam no client.
  const lotesPayload = lotes.map((l) => ({
    info: {
      lote_nome: l.info.lote_nome,
      peso_entrada_kg: l.info.peso_entrada_kg,
      peso_atual_kg: l.info.peso_atual_kg,
      dias: l.info.dias,
      data_prevista_final: l.info.data_prevista_final,
      n_cabecas_atual: l.info.n_cabecas_atual,
      raca: l.info.raca,
      categoria: l.info.categoria,
      dieta: l.info.dieta,
    },
    dados: l.dados,
  }))

  const response = await fetch('/api/pdf/consumo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataInicio, dataFim, fazendaNome, logoGestao, logoFazenda, lotes: lotesPayload }),
  })
  if (!response.ok) {
    throw new Error(`Falha ao gerar PDF com Puppeteer (${response.status})`)
  }
  return response.blob()
}
