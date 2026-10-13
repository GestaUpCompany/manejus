import { PDFDocument } from 'pdf-lib'
import { printPage, withBrowser, withHtmlPage } from './puppeteer.js'

// Cada parte (capa, seção, encerramento) é renderizada numa página própria do mesmo Chromium,
// fechada ao terminar: o pico de memória é o de uma seção, e não o de todos os gráficos juntos.
// A paginação é contada antes (sem gráficos) para numerar "Página X de Y" no PDF final.
export async function renderPartsToPdf(parts, memMb = () => 0) {
  const buffers = await withBrowser(async (browser) => {
    const contagens = []
    for (const part of parts) {
      contagens.push(
        await withHtmlPage(browser, part.html({ offset: 0, total: 1, countOnly: true }), (page) =>
          page.evaluate(() => document.querySelectorAll('section.page').length),
        ),
      )
    }
    const total = contagens.reduce((soma, n) => soma + n, 0)
    const resultado = []
    let offset = 0
    for (const [indice, part] of parts.entries()) {
      resultado.push(
        await withHtmlPage(browser, part.html({ offset, total }), async (page) => {
          await page.waitForFunction('window.__chartsReady === true', { timeout: 20000 }).catch(() => {})
          return printPage(page, { format: 'A4', landscape: true })
        }),
      )
      offset += contagens[indice]
      console.log(`[PDF Geral] parte=${part.id} paginas=${contagens[indice]} rss=${memMb()}MB`)
    }
    return resultado
  })
  const merged = await PDFDocument.create()
  for (const buffer of buffers) {
    const doc = await PDFDocument.load(buffer)
    const pages = await merged.copyPages(doc, doc.getPageIndices())
    for (const page of pages) merged.addPage(page)
  }
  return Buffer.from(await merged.save())
}
