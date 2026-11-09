import { carregarLogoComoBase64 } from './relatorioConsumoPDF'
import { classificarABC, type DadosRelatorioAlmoxarifado } from '../features/relatorioAlmoxarifado/agregacao'

async function carregarLogo(path: string): Promise<string> {
  try {
    return await carregarLogoComoBase64(path)
  } catch {
    return ''
  }
}

export interface ParametrosRelatorioAlmoxarifado {
  fazendaNome: string
  fazendaLogoUrl?: string | null
  dados: DadosRelatorioAlmoxarifado
}

// O cliente envia os dados da RPC e a curva ABC já calculada: o endpoint monta
// o HTML no próprio Chromium (ver api/pdf/_relatorios/almoxarifado.js) e não importa as regras do front.
export async function gerarRelatorioAlmoxarifadoPDFPuppeteer(params: ParametrosRelatorioAlmoxarifado): Promise<Blob> {
  const { fazendaNome, fazendaLogoUrl, dados } = params

  const [logoGestao, logoFazenda] = await Promise.all([
    carregarLogo('/images/manejus360.png'),
    fazendaLogoUrl ? carregarLogo(fazendaLogoUrl) : Promise.resolve(''),
  ])

  const response = await fetch('/api/pdf/almoxarifado', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fazendaNome,
      logoGestao,
      logoFazenda,
      gerado_em: dados.gerado_em,
      data_inicio: dados.data_inicio,
      data_fim: dados.data_fim,
      tem_periodo: dados.tem_periodo,
      itens: dados.itens,
      totais: dados.totais,
      por_responsavel: dados.por_responsavel,
      por_setor: dados.por_setor,
      qualidade: dados.qualidade,
      abc: Object.fromEntries(classificarABC(dados.itens)),
    }),
  })
  if (!response.ok) {
    throw new Error(`Erro ao gerar PDF de almoxarifado: ${response.status}`)
  }
  return response.blob()
}
