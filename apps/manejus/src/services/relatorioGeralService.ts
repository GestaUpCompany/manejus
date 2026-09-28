import { supabase } from './supabaseClient'
import { carregarLogoComoBase64 } from '../utils/relatorioConsumoPDF'
import type { PayloadRelatorioGeral } from '../features/relatorioGeral/loaders'

const MAX_BODY_BYTES = 4_000_000

interface GerarRelatorioGeralParams {
  fazendaId: string
  fazendaNome: string
  fazendaLogoUrl?: string | null
  dataInicio: string
  dataFim: string
  periodoLabel: string
  imagemCapaPath?: string
  reports: PayloadRelatorioGeral[]
}

async function carregarLogo(path?: string | null): Promise<string> {
  if (!path) return ''
  try {
    return await carregarLogoComoBase64(path)
  } catch {
    return ''
  }
}

export async function gerarRelatorioGeral(params: GerarRelatorioGeralParams): Promise<Blob> {
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
    dataInicio: params.dataInicio,
    dataFim: params.dataFim,
    periodoLabel: params.periodoLabel,
    imagemCapaPath: params.imagemCapaPath || null,
    logoGestao,
    logoFazenda,
    reports: params.reports,
  })
  const tamanho = new Blob([body]).size
  if (tamanho > MAX_BODY_BYTES) {
    throw new Error('O conjunto selecionado excede 4 MB. Reduza o período ou a quantidade de relatórios.')
  }
  const response = await fetch('/api/pdf/geral', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body,
  })
  if (!response.ok) {
    const erro = await response.json().catch(() => null)
    throw new Error(erro?.error ?? `Falha ao gerar o PDF (${response.status})`)
  }
  return response.blob()
}

export function baixarRelatorioGeral(blob: Blob, fazendaNome: string, dataInicio: string, dataFim: string) {
  const fazenda = fazendaNome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[<>:"/\\|?*]+/g, '').trim() || 'Fazenda'
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `GestaUp - Infografico Mensal - ${fazenda} - ${dataInicio} a ${dataFim}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
