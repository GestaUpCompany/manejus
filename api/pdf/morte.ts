import { renderMorteHtml, type PDFData } from './morte-template.js'

const MAX_LINES = 10_000
const MAX_BODY_BYTES = 4_000_000

type Request = { method?: string; body?: unknown }
type Response = {
  status: (code: number) => Response
  json: (body: unknown) => void
  setHeader: (name: string, value: string) => void
  send: (body: Buffer) => void
}

function isPDFData(value: unknown): value is PDFData {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<PDFData>
  return typeof data.dataInicio === 'string' && typeof data.dataFim === 'string' && typeof data.fazendaNome === 'string' && Array.isArray(data.linhas) && !!data.resumo && typeof data.resumo === 'object'
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método não permitido' })
  }

  const body = req.body
  if (!isPDFData(body) || body.linhas.length > MAX_LINES) {
    return res.status(400).json({ error: 'Payload de relatório inválido ou grande demais' })
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Payload do relatório excede o limite permitido' })
  }

  let browser: { close: () => Promise<void> } | undefined
  try {
    const [{ default: chromium }, { default: puppeteer }] = await Promise.all([
      import('@sparticuz/chromium'),
      import('puppeteer-core'),
    ])

    const isVercel = Boolean(process.env.VERCEL)
    const executablePath = isVercel ? await chromium.executablePath() : process.env.PUPPETEER_EXECUTABLE_PATH
    if (!executablePath) {
      throw new Error('PUPPETEER_EXECUTABLE_PATH não está configurado para execução local')
    }
    browser = await puppeteer.launch({
      args: isVercel ? chromium.args : [],
      defaultViewport: { width: 1280, height: 900 },
      executablePath,
      headless: true,
    })
    const page = await browser.newPage()
    await page.setContent(renderMorteHtml(body), { waitUntil: 'load' })
    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-mortalidade.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).send(Buffer.from(pdf))
  } catch (error) {
    console.error('Erro ao gerar relatório de mortalidade com Puppeteer:', error)
    return res.status(500).json({ error: 'Não foi possível gerar o PDF', detail: String(error) })
  } finally {
    await browser?.close()
  }
}
