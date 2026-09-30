import { carregarLogoComoBase64 } from './relatorioConsumoPDF'
import type { OcupacaoPasto, RegistroPastagem, ResumoPastagens } from '../features/relatorioPastagens/agregacao'

async function carregarLogo(path: string): Promise<string> {
  try {
    return await carregarLogoComoBase64(path)
  } catch {
    return ''
  }
}

export interface ParametrosRelatorioPastagens {
  dataInicio: string
  dataFim: string
  fazendaNome: string
  fazendaLogoUrl?: string | null
  resumo: ResumoPastagens
  registros: RegistroPastagem[]
  ocupacoes: OcupacaoPasto[]
  ocupacoesContexto?: OcupacaoPasto[]
}

// O cliente envia só os dados brutos/agregados: o endpoint monta o HTML e
// desenha os gráficos dentro do próprio Chromium via Chart.js injetado,
// no mesmo padrão dos demais relatórios (ver api/pdf/rodeio.js).
export async function gerarRelatorioPastagensPDFPuppeteer(
  params: ParametrosRelatorioPastagens,
): Promise<Blob> {
  const { dataInicio, dataFim, fazendaNome, fazendaLogoUrl, resumo, registros, ocupacoes, ocupacoesContexto } = params

  const [logoGestao, logoFazenda] = await Promise.all([
    carregarLogo('/images/manejus360.png'),
    fazendaLogoUrl ? carregarLogo(fazendaLogoUrl) : Promise.resolve(''),
  ])

  const response = await fetch('/api/pdf/pastagens', {
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
      ocupacoes,
      ocupacoesContexto,
    }),
  })
  if (!response.ok) {
    throw new Error(`Erro ao gerar PDF de pastagens: ${response.status}`)
  }
  return response.blob()
}
