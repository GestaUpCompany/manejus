import { carregarLogoComoBase64 } from './relatorioConsumoPDF'
import type {
  KpisClima,
  LeituraClima,
  PontoSerieClima,
  ResumoPluviometro,
} from '../pages/public/RelatorioClimaPublico'

async function carregarLogo(path: string): Promise<string> {
  try {
    return await carregarLogoComoBase64(path)
  } catch {
    return ''
  }
}

export interface ParametrosRelatorioClima {
  dataInicio: string
  dataFim: string
  fazendaNome: string
  fazendaLogoUrl?: string | null
  kpis: KpisClima
  pluviometros: string[]
  serie: PontoSerieClima[]
  resumo: ResumoPluviometro[]
  registros: LeituraClima[]
}

// O cliente envia só os dados brutos/agregados: o endpoint monta o HTML e
// desenha o gráfico composto (barras de mm por pluviômetro + linha de
// temperatura média) dentro do próprio Chromium via Chart.js injetado,
// no mesmo padrão dos demais relatórios (ver api/pdf/consumo.js).
export async function gerarRelatorioClimaPDFPuppeteer(
  params: ParametrosRelatorioClima,
): Promise<Blob> {
  const { dataInicio, dataFim, fazendaNome, fazendaLogoUrl, kpis, pluviometros, serie, resumo, registros } = params

  const [logoGestao, logoFazenda] = await Promise.all([
    carregarLogo('/images/manejus360.png'),
    fazendaLogoUrl ? carregarLogo(fazendaLogoUrl) : Promise.resolve(''),
  ])

  const response = await fetch('/api/pdf/clima', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dataInicio,
      dataFim,
      fazendaNome,
      logoGestao,
      logoFazenda,
      kpis,
      pluviometros,
      serie,
      resumo,
      registros,
    }),
  })
  if (!response.ok) {
    throw new Error(`Erro ao gerar PDF de clima: ${response.status}`)
  }
  return response.blob()
}
