import { supabase } from '@gestaup/supabase'
import { carregarLogoComoBase64 } from './relatorioConsumoPDF'
import type { DadosRelatorioAbate } from '../services/relatorioAbateService'

async function carregarLogo(path: string): Promise<string> {
  try {
    return await carregarLogoComoBase64(path)
  } catch {
    return ''
  }
}

export interface ParametrosRelatorioAbatePDF {
  fazendaId: string
  fazendaLogoUrl?: string | null
  dados: DadosRelatorioAbate
}

// O endpoint (api/pdf/_relatorios/abate.js) só desenha os dados já montados no navegador.
export async function gerarRelatorioAbatePDF(params: ParametrosRelatorioAbatePDF): Promise<Blob> {
  const { fazendaId, fazendaLogoUrl, dados } = params

  const [logoGestao, logoFazenda, sessionResult] = await Promise.all([
    carregarLogo('/images/manejus360.png'),
    fazendaLogoUrl ? carregarLogo(fazendaLogoUrl) : Promise.resolve(''),
    supabase.auth.getSession(),
  ])
  const token = sessionResult.data.session?.access_token
  if (!token) throw new Error('Sua sessão expirou. Entre novamente para gerar o relatório.')

  const response = await fetch('/api/pdf/abate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fazendaId, logoGestao, logoFazenda, ...dados }),
  })
  if (!response.ok) {
    const erro = await response.json().catch(() => null)
    throw new Error(erro?.error ?? `Erro ao gerar PDF de abate: ${response.status}`)
  }
  return response.blob()
}
