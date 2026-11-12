import { supabase } from '@gestaup/supabase'
import type { SecaoAnual } from '../features/relatorioGeral/catalogo'
import { carregarLogo } from './relatorioGeralService'

interface GerarInfograficoAnualParams {
  fazendaId: string
  fazendaNome: string
  fazendaLogoUrl?: string | null
  ano: number
  secoes: SecaoAnual[]
  imagemCapaPath?: string
}

// O Infográfico Anual não envia dados: o servidor chama as RPCs get_infografico_anual_* com o
// token do usuário (já agregadas por mês no banco). O corpo leva só parâmetros e os logos reduzidos.
export async function gerarInfograficoAnual(params: GerarInfograficoAnualParams): Promise<Blob> {
  const [logoGestao, logoFazenda, sessionResult] = await Promise.all([
    carregarLogo('/images/manejus360.png'),
    carregarLogo(params.fazendaLogoUrl),
    supabase.auth.getSession(),
  ])
  const token = sessionResult.data.session?.access_token
  if (!token) throw new Error('Sua sessão expirou. Entre novamente para gerar o relatório.')
  const body = JSON.stringify({
    versao: 1,
    fazendaId: params.fazendaId,
    fazendaNome: params.fazendaNome,
    ano: params.ano,
    secoes: params.secoes,
    imagemCapaPath: params.imagemCapaPath || null,
    logoGestao,
    logoFazenda,
  })
  const enviar = () =>
    fetch('/api/pdf/anual', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    })
  let response = await enviar()
  // 5xx sem JSON é queda da função na plataforma: uma nova tentativa costuma pegar instância sã.
  if (response.status >= 500) response = await enviar()
  if (!response.ok) {
    const erro = await response.json().catch(() => null)
    throw new Error(erro?.error ?? `O servidor não conseguiu gerar o PDF agora (${response.status}). Tente novamente em instantes.`)
  }
  return response.blob()
}
