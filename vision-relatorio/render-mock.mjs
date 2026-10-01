// Renderiza um arquivo HTML de mockup para PDF + PNG localmente (sem VPS).
// Uso: node vision-relatorio/render-mock.mjs <arquivo.html> [saida-base]
// O HTML deve usar @page{size:1280px 720px;margin:0} (canvas pbix) ou A4 landscape.
// O PNG sai em 2x (2560x1440) para preview nítido.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { findLocalChrome } from '../apps/manejus/api/pdf/_shared/puppeteer.js'

const [, , input, output] = process.argv
if (!input) {
  console.error('Uso: node render-mock.mjs <arquivo.html> [saida-base]')
  process.exit(1)
}

const inPath = resolve(input)
const base = output ?? input.replace(/\.html?$/i, '')
const pdfPath = resolve(base + '.pdf')
const pngPath = resolve(base + '.png')

let html = readFileSync(inPath, 'utf8')
// Imagens locais são inlineadas como data URI (setContent bloqueia file://)
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' }
html = html.replace(/src=["'](?!https?:|data:)([^"']+)["']/g, (m, rel) => {
  try {
    const abs = resolve(inPath, '..', decodeURIComponent(rel))
    const ext = abs.slice(abs.lastIndexOf('.')).toLowerCase()
    const b64 = readFileSync(abs).toString('base64')
    return `src="data:${mime[ext] ?? 'application/octet-stream'};base64,${b64}"`
  } catch { return m }
})

const { generatePdf } = await import('../apps/manejus/api/pdf/_shared/puppeteer.js')
const pdf = await generatePdf({ html, format: 'A4', landscape: true, launchArgs: ['--allow-file-access-from-files'] })
writeFileSync(pdfPath, pdf)
console.log(`PDF: ${pdfPath} (${pdf.length} bytes)`)

// PNG de preview em 2x (puppeteer-core mora em apps/manejus)
import { createRequire } from 'node:module'
const requireFromManejus = createRequire(resolve('apps/manejus/package.json'))
const { default: puppeteer } = await import(pathToFileURL(requireFromManejus.resolve('puppeteer-core')).href)
const executablePath = await findLocalChrome(puppeteer)
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files'],
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 })
  await page.setContent(html, { waitUntil: 'networkidle0' })
  await page.screenshot({ path: pngPath })
  console.log(`PNG: ${pngPath} (2560x1440)`)
} finally {
  await browser.close()
}
