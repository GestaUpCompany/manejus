declare module '*pipeline/web/app.mjs' {
  export const SHELL_CSS: string
  export const PAGE_TITLES: Record<string, string>
  export function mountRelatorio(
    el: HTMLElement,
    payload: unknown,
    config?: { public?: boolean; hiddenPages?: string[]; autoPrint?: boolean; titulo?: string },
  ): { apply: (ini: string, fim: string) => void; getRange: () => [string, string] }
}

declare module '*pipeline/lib/model.mjs' {
  export function extractReads(sheets: Record<string, unknown[][]>): Record<string, unknown[]>
  export function buildModelFromReads(
    reads: Record<string, unknown[]>,
    ctx: Record<string, unknown>,
    ini: string,
    fim: string,
  ): Record<string, unknown>
}

declare module '*pipeline/lib/payload.mjs' {
  export function buildPayload(input: {
    reads: Record<string, unknown[]>
    ctx: Record<string, unknown>
    defaults: { ini: string; fim: string; saldoCaixaInicial?: number; anoBaseGiro?: number }
  }): { reads: Record<string, unknown[]>; ctx: Record<string, unknown>; defaults: { ini: string; fim: string }; range: { min: string; max: string } }
  export function computeRange(reads: Record<string, unknown[]>): { min: string; max: string }
  export function revivePayload(p: Record<string, unknown>): void
  export function compressPayload(payload: unknown): Promise<string>
  export function decompressPayload(b64: string): Promise<{
    reads: Record<string, unknown[]>
    ctx: Record<string, unknown>
    defaults: { ini: string; fim: string }
    range: { min: string; max: string }
  }>
}

declare module '*pipeline/lib/xlsx-stream.mjs' {
  export function sheetsFromXlsxBlob(
    blob: Blob,
    needed: string[],
  ): Promise<{ sheets: Record<string, unknown[][]>; missing: string[] }>
}

declare module '*pipeline/lib/core.mjs' {
  export const NEEDED_SHEETS: string[]
}
