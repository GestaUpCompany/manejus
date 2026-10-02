import { NEEDED_SHEETS } from '../../../../vision-relatorio/pipeline/lib/core.mjs'
import { sheetsFromXlsxBlob } from '../../../../vision-relatorio/pipeline/lib/xlsx-stream.mjs'
import { extractReads } from '../../../../vision-relatorio/pipeline/lib/model.mjs'
import { buildPayload, compressPayload, computeRange, decompressPayload } from '../../../../vision-relatorio/pipeline/lib/payload.mjs'
import { mountRelatorio, PAGE_TITLES, SHELL_CSS } from '../../../../vision-relatorio/pipeline/web/app.mjs'

export { mountRelatorio, PAGE_TITLES, SHELL_CSS, decompressPayload, computeRange, extractReads }

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
