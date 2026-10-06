import { NEEDED_SHEETS } from '../../../../vision-relatorio/pipeline/lib/core.mjs'
import { sheetsFromXlsxBlob } from '../../../../vision-relatorio/pipeline/lib/xlsx-stream.mjs'
import { buildModelFromReads, extractReads } from '../../../../vision-relatorio/pipeline/lib/model.mjs'
import { buildPayload, compressPayload, computeRange, decompressPayload } from '../../../../vision-relatorio/pipeline/lib/payload.mjs'
import { mountRelatorio, buildMergedHtml, PAGE_TITLES, PAGE_NUMS, PAGE_ORDER, SHELL_CSS, paginasSemDados } from '../../../../vision-relatorio/pipeline/web/app.mjs'
import { auditSheets, fmtLinhas } from '../../../../vision-relatorio/pipeline/lib/audit.mjs'
import { supabase } from '@gestaup/supabase'

export { mountRelatorio, buildMergedHtml, PAGE_TITLES, PAGE_NUMS, PAGE_ORDER, SHELL_CSS, decompressPayload, computeRange, extractReads, buildModelFromReads, auditSheets, fmtLinhas, paginasSemDados }

export interface FazendaRef {
  id: string
  nome: string
  logo_url: string | null
}

export interface RelatorioPayload {
  reads: Record<string, unknown[]>
  ctx: Record<string, unknown>
  defaults: { ini: string; fim: string }
  range: { min: string; max: string }
}

/** Lê um .xlsm/.xlsx (ou .json de extrato no formato vision-extract) e devolve as abas necessárias. */
export async function sheetsFromFile(
  file: File,
): Promise<{ sheets: Record<string, unknown[][]>; missing: string[] }> {
  if (file.name.toLowerCase().endsWith('.json')) {
    const parsed = JSON.parse(await file.text())
    return { sheets: parsed.sheets ?? parsed, missing: [] }
  }
  // Leitura em streaming (xlsx-stream.mjs): o XLSM de 40–110MB descompacta para
  // >1GB de XML, mas só as abas necessárias são infladas e cada uma para após
  // 200 linhas vazias seguidas. Memória ~200MB, independente do tamanho.
  return sheetsFromXlsxBlob(file, NEEDED_SHEETS)
}

export function ctxFor(fazenda: FazendaRef): Record<string, unknown> {
  return {
    logoSrc: fazenda.logo_url || '/assets/logo-gestaup.png',
    logoGestaup: '/assets/logo-gestaup.png',
    logoFazenda: fazenda.logo_url,
    fazendaNome: fazenda.nome,
    fotoCapa: '/assets/capa-default.png',
  }
}

export function payloadFromReads(
  reads: Record<string, unknown[]>,
  fazenda: FazendaRef,
  opts?: { ini?: string; fim?: string; saldoCaixaInicial?: number; anoBaseGiro?: number },
): RelatorioPayload {
  const range = computeRange(reads)
  return buildPayload({
    reads,
    ctx: ctxFor(fazenda),
    defaults: {
      ini: opts?.ini ?? range.min,
      fim: opts?.fim ?? range.max,
      saldoCaixaInicial: opts?.saldoCaixaInicial ?? 0,
      anoBaseGiro: opts?.anoBaseGiro,
    },
  }) as RelatorioPayload
}

export function payloadToB64(payload: RelatorioPayload): Promise<string> {
  return compressPayload(payload)
}

// Gera o PDF no servidor (Puppeteer) a partir do mesmo documento renderizado
// no link público: saída idêntica às lâminas 1280x720, sem diálogo de
// impressão do navegador (que fatiava as páginas e injetava cabeçalho/rodapé).
export async function baixarPdfRelatorio(
  payload: RelatorioPayload,
  opts: { hiddenPages?: string[]; titulo?: string } = {},
): Promise<void> {
  const html = buildMergedHtml(payload, { hiddenPages: opts.hiddenPages })
  // compressPayload aceita qualquer valor JSON-serializável: aqui o HTML vira
  // uma string JSON comprimida (o merge de ~2MB baixa para ~300KB no POST).
  const htmlGz = await compressPayload(html)
  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch('/api/pdf/vision', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({
      htmlGz,
      nomeArquivo: (opts.titulo ?? 'relatorio-vision').toLowerCase(),
    }),
  })
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`
    try { msg = (await resp.json()).error || msg } catch { /* corpo não-JSON */ }
    throw new Error(msg)
  }
  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(opts.titulo ?? 'relatorio-vision').replace(/[^\w.-]+/g, '-')}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
