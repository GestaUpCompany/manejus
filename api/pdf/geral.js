import { generatePdf } from './_shared/puppeteer.js'
import { composeReports } from './_shared/reportComposer.js'
import { isReportType } from './_shared/reportRegistry.js'
import { createAuthenticatedSupabase, downloadImageDataUrl } from './_shared/supabaseAuth.js'

const MAX_BODY_BYTES = 4_000_000
const DIA_MS = 86_400_000

function validarBody(body) {
  if (!body || typeof body !== 'object') return 'Payload inválido'
  if (typeof body.fazendaId !== 'string' || typeof body.fazendaNome !== 'string') return 'Fazenda inválida'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.dataInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(body.dataFim)) return 'Período inválido'
  const inicio = new Date(`${body.dataInicio}T00:00:00Z`)
  const fim = new Date(`${body.dataFim}T00:00:00Z`)
  const dias = Math.floor((fim.getTime() - inicio.getTime()) / DIA_MS) + 1
  if (!Number.isFinite(dias) || dias < 1 || dias > 31) return 'O período deve ter entre 1 e 31 dias'
  if (!Array.isArray(body.reports) || body.reports.length < 1 || body.reports.length > 4) return 'Seleção de relatórios inválida'
  const tipos = body.reports.map((report) => report?.tipo)
  if (tipos.some((tipo) => !isReportType(tipo)) || new Set(tipos).size !== tipos.length) return 'Relatório desconhecido ou duplicado'
  if (body.imagemCapaPath && !body.imagemCapaPath.startsWith(`${body.fazendaId}/capas/`)) return 'Imagem de capa inválida'
  return null
}

function writePdf(res, pdf) {
  if (typeof res.write !== 'function' || typeof res.end !== 'function') return res.status(200).send(pdf)
  res.status(200)
  for (let offset = 0; offset < pdf.length; offset += 64 * 1024) res.write(pdf.subarray(offset, offset + 64 * 1024))
  return res.end()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método não permitido' })
  }
  const body = req.body
  if (Buffer.byteLength(JSON.stringify(body ?? null), 'utf8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'O conjunto de relatórios excede o limite de 4 MB' })
  }
  const invalid = validarBody(body)
  if (invalid) return res.status(400).json({ error: invalid })

  try {
    const supabase = await createAuthenticatedSupabase(req, body.fazendaId)
    const [logoEmpresa, imagemCapa] = await Promise.all([
      downloadImageDataUrl(supabase, 'system/gestaupcompany.png'),
      body.imagemCapaPath ? downloadImageDataUrl(supabase, body.imagemCapaPath) : Promise.resolve(''),
    ])
    const reports = body.reports.map((report) => ({
      ...report,
      dados: { ...report.dados, logoGestao: body.logoGestao ?? '', logoFazenda: body.logoFazenda ?? '' },
    }))
    const html = await composeReports({
      reports,
      cover: {
        fazendaNome: body.fazendaNome,
        logoGestao: body.logoGestao ?? '',
        logoFazenda: body.logoFazenda ?? '',
        logoEmpresa,
        imagemCapa,
        periodoLabel: body.periodoLabel,
      },
    })
    const pdf = await generatePdf({
      html,
      format: 'A4',
      landscape: true,
      beforePdf: async (page) => {
        await page.waitForFunction('window.__chartsReady === true', { timeout: 20000 }).catch(() => {})
      },
    })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="relatorios-mensais.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PDF-Renderer', 'puppeteer-composed')
    return writePdf(res, pdf)
  } catch (error) {
    console.error('[PDF Geral] Erro ao gerar relatório:', error)
    const detail = error instanceof Error ? error.message : String(error)
    if (detail === 'Sessão não informada' || detail === 'Sessão inválida') {
      return res.status(401).json({ error: detail })
    }
    if (detail === 'Usuário sem acesso à fazenda') {
      return res.status(403).json({ error: detail })
    }
    return res.status(500).json({ error: 'Não foi possível gerar o relatório mensal', detail })
  }
}
