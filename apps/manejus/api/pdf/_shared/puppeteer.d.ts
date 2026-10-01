import type { Page } from 'puppeteer-core'

export interface GeneratePdfOptions {
  html: string
  format?: 'A4' | 'A3' | 'Letter'
  landscape?: boolean
  timeoutMs?: number
  launchArgs?: string[]
  beforePdf?: (page: Page) => Promise<void>
}

export function findLocalChrome(puppeteer: { executablePath(): Promise<string> }): Promise<string | null>

export function generatePdf(opts: GeneratePdfOptions): Promise<Uint8Array>
