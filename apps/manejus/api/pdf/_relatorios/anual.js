import { readFileSync } from 'node:fs'
import { ANUAL_REGISTRY, REGISTRY_COMPOSICAO, isSecaoAnual, montarReportsAnuais } from '../_shared/anualRegistry.js'
import { renderPartsToPdf } from '../_shared/partsPdf.js'
import { composeReportParts } from '../_shared/reportComposer.js'
import { createAuthenticatedSupabase, downloadImageDataUrl } from '../_shared/supabaseAuth.js'

// Infográfico Anual: o navegador manda só fazenda, ano, seções e logos; os dados vêm das RPCs
// get_infografico_anual_* (já agregados por mês no banco) chamadas aqui com o token do usuário.
// O corpo é pequeno (logos reduzidos a 400 px), então o limite fica bem abaixo dos 4,5 MB da Vercel.
const MAX_BODY_BYTES = 1_500_000
const ANO_MINIMO = 2020

let capaPadraoCache = null
function capaPadraoDataUrl() {
  if (capaPadraoCache === null) {
    try {
      capaPadraoCache = `data:image/png;base64,${readFileSync(new URL('../_shared/capa-padrao.png', import.meta.url)).toString('base64')}`
    } catch {
      capaPadraoCache = ''
    }
  }
  return capaPadraoCache
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export function rotuloPeriodoCapa(ano, ultimoMes) {
  const ult = Math.max(1, Math.min(12, Number(ultimoMes) || 12))
  return ult >= 12 ? `Janeiro a Dezembro de ${ano}` : `Janeiro a ${MESES[ult - 1]} de ${ano}`
}

function anoAtualCuiaba() {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cuiaba', year: 'numeric' }).format(new Date()))
}

export function validarBodyAnual(body, anoAtual = anoAtualCuiaba()) {
  if (!body || typeof body !== 'object') return 'Payload inválido'
  if (typeof body.fazendaId !== 'string' || typeof body.fazendaNome !== 'string') return 'Fazenda inválida'
  if (!Number.isInteger(body.ano) || body.ano < ANO_MINIMO || body.ano > anoAtual) return `Ano inválido: escolha entre ${ANO_MINIMO} e ${anoAtual}`
  if (!Array.isArray(body.secoes) || body.secoes.length < 1) return 'Selecione ao menos uma seção'
  if (body.secoes.some((s) => !isSecaoAnual(s)) || new Set(body.secoes).size !== body.secoes.length) return 'Seção desconhecida ou duplicada'
  if (body.imagemCapaPath && !String(body.imagemCapaPath).startsWith(`${body.fazendaId}/capas/`)) return 'Imagem de capa inválida'
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
  if (Number(req.headers?.['content-length'] ?? 0) > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Requisição grande demais' })
  }
  const body = req.body
  const invalido = validarBodyAnual(body)
  if (invalido) return res.status(400).json({ error: invalido })

  const memMb = () => Math.round(process.memoryUsage().rss / 1048576)
  const t0 = Date.now()
  try {
    const supabase = await createAuthenticatedSupabase(req, body.fazendaId)
    const [logoEmpresa, imagemCapa, dadosSecoes] = await Promise.all([
      downloadImageDataUrl(supabase, 'system/gestaupcompany.png').catch(() => ''),
      body.imagemCapaPath ? downloadImageDataUrl(supabase, body.imagemCapaPath) : Promise.resolve(capaPadraoDataUrl()),
      Promise.all(
        body.secoes.map(async (secao) => {
          const { data, error } = await supabase.rpc(ANUAL_REGISTRY[secao].rpc, { p_fazenda_id: body.fazendaId, p_ano: body.ano })
          if (error) throw new Error(`${ANUAL_REGISTRY[secao].title}: ${error.message}`)
          return { secao, data }
        }),
      ),
    ])
    console.log(`[PDF Anual] ano=${body.ano} secoes=${body.secoes.join(',')} dados=${Date.now() - t0}ms rss=${memMb()}MB`)

    const marca = { fazendaNome: body.fazendaNome, logoGestao: body.logoGestao ?? '', logoFazenda: body.logoFazenda ?? '' }
    const reports = montarReportsAnuais(dadosSecoes, marca)
    const ultimoMes = dadosSecoes[0]?.data?.ultimo_mes ?? 12
    const parts = await composeReportParts({
      reports,
      registry: REGISTRY_COMPOSICAO,
      titulo: 'Infográfico Anual',
      cover: {
        ...marca,
        logoEmpresa,
        imagemCapa,
        periodoLabel: rotuloPeriodoCapa(body.ano, ultimoMes),
      },
    })
    const pdf = await renderPartsToPdf(parts, memMb)
    console.log(`[PDF Anual] partes=${parts.length} pdf=${Math.round(pdf.length / 1024)}KB total=${Date.now() - t0}ms rss=${memMb()}MB`)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="infografico-anual.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PDF-Renderer', 'puppeteer-composed')
    return writePdf(res, pdf)
  } catch (error) {
    console.error('[PDF Anual] Erro ao gerar relatório:', error)
    const detail = error instanceof Error ? error.message : String(error)
    if (detail === 'Sessão não informada' || detail === 'Sessão inválida') return res.status(401).json({ error: detail })
    if (detail === 'Usuário sem acesso à fazenda') return res.status(403).json({ error: detail })
    return res.status(500).json({ error: 'Não foi possível gerar o infográfico anual', detail })
  }
}
