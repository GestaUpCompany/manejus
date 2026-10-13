import type { Browser, Page } from 'puppeteer-core'

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

export function withBrowser<T>(fn: (browser: Browser) => Promise<T>, opts?: { launchArgs?: string[] }): Promise<T>

export function withHtmlPage<T>(
  browser: Browser,
  html: string,
  fn: (page: Page) => Promise<T>,
  opts?: { timeoutMs?: number },
): Promise<T>

export function printPage(page: Page, opts?: { format?: 'A4' | 'A3' | 'Letter'; landscape?: boolean }): Promise<Buffer>
