// Camada fina de infraestrutura para relatórios PDF gerados via Puppeteer.
// Centraliza duas coisas que todo endpoint /api/pdf/* precisa:
//   1) Descoberta do Chrome/Chromium em três cenários: Vercel (@sparticuz/chromium),
//      dev local em Windows/macOS/Linux e override explícito via env var.
//   2) O ciclo launch → setContent → page.pdf → close, com defaults sensatos
//      (A4, landscape opcional, sem margem, imprimindo background).
//
// Endpoints específicos só montam o HTML e chamam generatePdf(). Não deve haver
// pool de browsers, fila, streaming ou lógica de retry aqui: o volume de dados
// real é moderado e a operação é síncrona por request.

import { existsSync, readdirSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'

async function findLocalChrome(puppeteer) {
  // 1) Override explícito por variável de ambiente
  if (process.env.PUPPETEER_EXECUTABLE_PATH && existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH
  }
  // 2) Binário baixado pelo próprio puppeteer via `npx puppeteer browsers install chrome`
  try {
    const p = await puppeteer.executablePath()
    if (p && existsSync(p)) return p
  } catch {}

  const home = homedir()
  const os = platform()
  const candidates = []

  // 3) Cache padrão do puppeteer (~/.cache/puppeteer/chrome/<versao>/<subdir>/chrome[.exe])
  const puppeteerCache = join(home, '.cache', 'puppeteer', 'chrome')
  if (existsSync(puppeteerCache)) {
    try {
      for (const dir of readdirSync(puppeteerCache)) {
        if (os === 'win32') {
          candidates.push(join(puppeteerCache, dir, 'chrome-win64', 'chrome.exe'))
          candidates.push(join(puppeteerCache, dir, 'chrome-win32', 'chrome.exe'))
        } else if (os === 'darwin') {
          candidates.push(
            join(puppeteerCache, dir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
          )
          candidates.push(
            join(puppeteerCache, dir, 'chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
          )
        } else {
          candidates.push(join(puppeteerCache, dir, 'chrome-linux64', 'chrome'))
          candidates.push(join(puppeteerCache, dir, 'chrome-linux', 'chrome'))
        }
      }
    } catch {}
  }

  // 4) Cache do Playwright (comum em máquinas de dev que já rodaram testes)
  if (os === 'win32') {
    const playwrightCache = join(home, 'AppData', 'Local', 'ms-playwright')
    if (existsSync(playwrightCache)) {
      try {
        for (const dir of readdirSync(playwrightCache)) {
          candidates.push(join(playwrightCache, dir, 'chrome-win64', 'chrome.exe'))
        }
      } catch {}
    }
  }

  // 5) Instalações de Chrome do próprio sistema
  if (os === 'win32') {
    const programFiles = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)
    for (const pf of programFiles) {
      candidates.push(join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    }
  } else if (os === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    candidates.push('/Applications/Chromium.app/Contents/MacOS/Chromium')
  } else {
    candidates.push('/usr/bin/google-chrome')
    candidates.push('/usr/bin/google-chrome-stable')
    candidates.push('/usr/bin/chromium')
    candidates.push('/usr/bin/chromium-browser')
  }

  for (const c of candidates) if (existsSync(c)) return c
  return null
}

/**
 * Gera um PDF a partir de um HTML completo usando Puppeteer.
 * @param {Object} opts
 * @param {string} opts.html   Documento HTML completo (<!doctype html>...).
 * @param {'A4'|'A3'|'Letter'} [opts.format]  Formato do papel. Default: A4.
 * @param {boolean} [opts.landscape]          Orientação paisagem. Default: true.
 * @param {number}  [opts.timeoutMs]          Timeout para carregar a página. Default: 30000.
 * @param {(page: import('puppeteer-core').Page) => Promise<void>} [opts.beforePdf]
 *        Hook opcional para aguardar sinais dinâmicos (ex: window.__chartsReady).
 * @returns {Promise<Buffer>} Buffer com o PDF renderizado.
 */
export async function generatePdf({ html, format = 'A4', landscape = true, timeoutMs = 30000, beforePdf }) {
  const [{ default: chromium }, { default: puppeteer }] = await Promise.all([
    import('@sparticuz/chromium'),
    import('puppeteer-core'),
  ])
  const isVercel = Boolean(process.env.VERCEL)
  const executablePath = isVercel ? await chromium.executablePath() : await findLocalChrome(puppeteer)
  if (!executablePath) {
    throw new Error(
      'Chromium não encontrado. Defina PUPPETEER_EXECUTABLE_PATH ou instale via `npx puppeteer browsers install chrome`.',
    )
  }

  const browser = await puppeteer.launch({
    args: isVercel ? chromium.args : ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 900 },
    executablePath,
    headless: true,
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load', timeout: timeoutMs })
    if (beforePdf) await beforePdf(page)
    const pdf = await page.pdf({
      format,
      landscape,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
