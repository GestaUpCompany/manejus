import { supabase } from '@gestaup/supabase'
import { carregarLogoComoBase64 } from './relatorioConsumoPDF'
import { montarTabelaZootecnica } from '../features/relatorioZootecnico/colunas'
import type { DadosRelatorioZootecnico } from '../services/relatorioZootecnicoService'

async function carregarLogo(path: string): Promise<string> {
  try {
    return await carregarLogoComoBase64(path)
  } catch {
    return ''
  }
}

export interface ParametrosRelatorioZootecnicoPDF {
  fazendaId: string
  fazendaLogoUrl?: string | null
  dados: DadosRelatorioZootecnico
  dias: number
}

// O endpoint (api/pdf/zootecnico.js) só desenha a tabela já formatada, a mesma da tela.
export async function gerarRelatorioZootecnicoPDFPuppeteer(params: ParametrosRelatorioZootecnicoPDF): Promise<Blob> {
  const { fazendaId, fazendaLogoUrl, dados, dias } = params

  const [logoGestao, logoFazenda, sessionResult] = await Promise.all([
    carregarLogo('/images/manejus360.png'),
    fazendaLogoUrl ? carregarLogo(fazendaLogoUrl) : Promise.resolve(''),
    supabase.auth.getSession(),
  ])
  const token = sessionResult.data.session?.access_token
  if (!token) throw new Error('Sua sessão expirou. Entre novamente para gerar o relatório.')

  const response = await fetch('/api/pdf/zootecnico', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fazendaId,
      fazendaNome: dados.fazendaNome,
      logoGestao,
      logoFazenda,
      janelaInicio: dados.janelaInicio,
      janelaFim: dados.janelaFim,
      dias,
      tabela: montarTabelaZootecnica(dados.geral, dados.linhas, dias),
    }),
  })
  if (!response.ok) {
    const erro = await response.json().catch(() => null)
    throw new Error(erro?.error ?? `Erro ao gerar PDF zootécnico: ${response.status}`)
  }
  return response.blob()
}
