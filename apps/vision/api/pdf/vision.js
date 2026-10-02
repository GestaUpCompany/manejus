// POST /api/pdf/vision — gera o PDF do relatório Vision'Up via Puppeteer.
// Recebe o documento merged (estilos + .page concatenados, uma lâmina 1280x720
// por página) montado no cliente pelos mesmos renderers do link público:
// a saída é pixel-identica à prévia, sem diálogo de impressão do navegador.
//
// Body: { htmlGz: string (gzip+base64 do HTML) | html: string, nomeArquivo?: string }
import { generatePdf } from './_shared/puppeteer.js'
import { requireSession } from './_shared/auth.js'

const MAX_HTML_BYTES = 12_000_000

async function gunzipB64(b64) {
  const bytes = new Uint8Array(Buffer.from(b64, 'base64'))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  // O cliente envia JSON.stringify(html) comprimido — o parse devolve a string.
  return JSON.parse(await new Response(stream).text())
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })
    await requireSession(req)

    const body = req.body ?? {}
    let html = body.html
    if (!html && body.htmlGz) html = await gunzipB64(body.htmlGz)
    if (typeof html !== 'string' || !html.includes('class="page"')) {
      return res.status(400).json({ error: 'HTML do relatório inválido' })
    }
    if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
      return res.status(413).json({ error: 'Documento grande demais' })
    }

    const pdf = await generatePdf({
      html,
      timeoutMs: 60000,
      // Fontes e imagens remotas (logo da fazenda, Google Fonts) precisam
      // estar prontas antes da rasterização.
      beforePdf: async (page) => {
        await page.evaluate(() => document.fonts.ready.then(() => undefined)).catch(() => {})
        await page.waitForNetworkIdle({ idleTime: 800, timeout: 15000 }).catch(() => {})
      },
    })

    const nome = String(body.nomeArquivo || 'relatorio-vision').replace(/[^\w.-]+/g, '-')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${nome}.pdf"`)
    res.setHeader('Cache-Control', 'no-store')
    return res.send(pdf)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    if (detail === 'Sessão não informada' || detail === 'Sessão inválida') {
      return res.status(401).json({ error: detail })
    }
    console.error('[PDF Vision] Erro ao gerar relatório:', error)
    return res.status(500).json({ error: 'Não foi possível gerar o PDF', detail })
  }
}
