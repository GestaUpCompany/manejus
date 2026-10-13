import { supabase } from '@gestaup/supabase'
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

const LOGO_MAX_LADO_PX = 400

// Reduz o logo antes de enviar: o PDF mostra logos em poucos mm, e o base64 original
// vai duplicado em várias páginas do HTML, pressionando a memória da função.
function reduzirLogo(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const escala = Math.min(1, LOGO_MAX_LADO_PX / Math.max(img.width, img.height))
      if (escala === 1) return resolve(dataUrl)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * escala)
      canvas.height = Math.round(img.height * escala)
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

async function carregarLogo(path?: string | null): Promise<string> {
  if (!path) return ''
  try {
    return await reduzirLogo(await carregarLogoComoBase64(path))
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
  const enviar = () =>
    fetch('/api/pdf/geral', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
    })
  let response = await enviar()
  // 5xx sem JSON é queda da função na plataforma (ex.: FUNCTION_INVOCATION_FAILED): uma nova tentativa costuma pegar instância sã.
  if (response.status >= 500) response = await enviar()
  if (!response.ok) {
    const erro = await response.json().catch(() => null)
    throw new Error(erro?.error ?? `O servidor não conseguiu gerar o PDF agora (${response.status}). Tente novamente em instantes.`)
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
