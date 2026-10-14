// Endpoint fino do Relatório Zootécnico dos Lotes. O cliente envia a tabela já
// formatada (mesma fonte de colunas da tela e do Excel: features/relatorioZootecnico/colunas.ts);
// aqui só se desenha. Com 25 colunas a A4 paisagem não comporta uma tabela só,
// então a tabela é dividida em dois blocos (Identificação+Desempenho e
// Financeiro+Consumo+Meta), ambos repetindo a coluna Lote e a linha Geral. As linhas vêm em seções (lotes a pasto / em currais), cada uma com sua linha de total.
// Cada bloco pagina em ROWS_PER_PAGE linhas; o bloco 2 sempre começa em página nova.

import { escapeHtml, dateFmt } from './_shared/formatters.js'
import { generatePdf } from './_shared/puppeteer.js'
import { createAuthenticatedSupabase } from './_shared/supabaseAuth.js'
import { renderHeader, page as pageSection, htmlDocument } from './_shared/template.js'

const MAX_LINHAS = 1000
const MAX_COLUNAS = 40
const MAX_BODY_BYTES = 8_000_000
const ROWS_PER_PAGE = 12
// Os dois primeiros grupos (Identificação e Desempenho) formam o bloco 1
const GRUPOS_BLOCO_1 = 2

const ZOO_CSS = `
.zoo-group th{background:#14532d;text-align:center;font-size:9px;padding:4px 3px;border-left:1px solid #0b6a42}
.zoo-table th,.zoo-table td{font-size:8px;padding:4px 3px;line-height:1.2}
.zoo-table th{text-align:center;vertical-align:middle}
.zoo-table td{text-align:right;white-space:nowrap}
.zoo-table td.zoo-txt{text-align:left;white-space:normal}
.zoo-geral td{background:#dcfce7;font-weight:700;color:#14532d}
.zoo-total td{background:#f0fdf4;font-weight:700;color:#14532d}
`

function isPDFData(v) {
  if (!v || typeof v !== 'object') return false
  if (typeof v.fazendaNome !== 'string') return false
  if (typeof v.fazendaId !== 'string' || !v.fazendaId) return false
  const t = v.tabela
  if (!t || !Array.isArray(t.colunas) || !Array.isArray(t.secoes) || !Array.isArray(t.geral)) return false
  const totalLinhas = t.secoes.reduce((s, x) => s + (Array.isArray(x?.linhas) ? x.linhas.length : MAX_LINHAS + 1), 0)
  return t.colunas.length > 0 && t.colunas.length <= MAX_COLUNAS && totalLinhas <= MAX_LINHAS && t.secoes.every((x) => x.total === null || Array.isArray(x.total))
}

function footer(janelaInicio, janelaFim, dias, page, totalPages) {
  return `<footer class="report-footer"><span>Gesta'Up · Consumo da janela: ${dateFmt(janelaInicio)} a ${dateFmt(janelaFim)} (${dias} dias)</span><span>Página ${page} de ${totalPages}</span></footer>`
}

// Larguras proporcionais: texto largo recebe mais espaço
function larguras(cols) {
  const pesos = cols.map((c) => (c.header === 'Lote' ? 3 : c.tipo === 'texto' ? 1.8 : c.tipo === 'data' || c.tipo === 'brl' ? 1.7 : 1.2))
  const total = pesos.reduce((s, p) => s + p, 0)
  return pesos.map((p) => `${((p / total) * 100).toFixed(2)}%`)
}

function tabelaBloco(colunasIdx, tabela, secao, linhas, titulo) {
  const cols = colunasIdx.map((i) => tabela.colunas[i])
  const grupos = []
  for (const c of cols) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.nome === c.grupo) ultimo.span += 1
    else grupos.push({ nome: c.grupo, span: 1 })
  }
  const colgroup = `<colgroup>${larguras(cols).map((w) => `<col style="width:${w}">`).join('')}</colgroup>`
  const headGrupos = `<tr class="zoo-group">${grupos.map((g) => `<th colspan="${g.span}">${escapeHtml(g.nome)}</th>`).join('')}</tr>`
  const headCols = `<tr>${cols.map((c) => `<th>${escapeHtml(c.header)}</th>`).join('')}</tr>`
  const celulas = (valores, classe = '') =>
    `<tr${classe ? ` class="${classe}"` : ''}>${colunasIdx.map((i, k) => `<td${cols[k].tipo === 'texto' ? ' class="zoo-txt"' : ''}>${escapeHtml(valores[i] ?? '—')}</td>`).join('')}</tr>`
  const corpo = celulas(tabela.geral, 'zoo-geral') + (secao.total ? celulas(secao.total, 'zoo-total') : '') + linhas.map((l) => celulas(l)).join('')
  return `<div class="table-block"><h3 class="table-title">${escapeHtml(titulo)}<span>${secao.linhas.length} ${secao.linhas.length === 1 ? 'linha' : 'linhas'}</span></h3><table class="zoo-table">${colgroup}<thead>${headGrupos}${headCols}</thead><tbody>${corpo}</tbody></table></div>`
}

function chunk(arr, size) {
  if (arr.length === 0) return [[]]
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function renderZootecnicoHtml(input) {
  const { fazendaNome, logoGestao, logoFazenda, janelaInicio, janelaFim, dias, tabela } = input
  const brand = { logoGestao, logoFazenda, fazendaNome }

  // Bloco 1 = colunas dos GRUPOS_BLOCO_1 primeiros grupos; bloco 2 = Lote + o resto
  const nomesGrupos = [...new Set(tabela.colunas.map((c) => c.grupo))]
  const grupoBloco1 = new Set(nomesGrupos.slice(0, GRUPOS_BLOCO_1))
  const idx1 = []
  const idx2 = [0]
  tabela.colunas.forEach((c, i) => {
    if (grupoBloco1.has(c.grupo)) idx1.push(i)
    else idx2.push(i)
  })
  const blocos = [{ idx: idx1, titulo: 'Identificação e desempenho' }]
  if (idx2.length > 1) blocos.push({ idx: idx2, titulo: 'Financeiro, consumo e meta' })

  const paginas = tabela.secoes.flatMap((secao) =>
    blocos.flatMap((b) => chunk(secao.linhas, ROWS_PER_PAGE).map((linhas, i) => ({ ...b, secao, linhas, continuacao: i > 0 }))),
  )
  const totalPages = paginas.length

  const body = paginas
    .map((p, n) =>
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: 'Relatório Zootécnico dos Lotes' })}
        ${n === 0 ? `<div class="period-badge">Consumo da janela: ${dateFmt(janelaInicio)} a ${dateFmt(janelaFim)} (${dias} dias)</div>` : ''}
        ${tabelaBloco(p.idx, tabela, p.secao, p.linhas, `${p.secao.titulo} · ${p.titulo}${p.continuacao ? ' (continuação)' : ''}`)}
        ${footer(janelaInicio, janelaFim, dias, n + 1, totalPages)}
      `),
    )
    .join('')

  return htmlDocument({ title: 'Relatório Zootécnico dos Lotes', extraCss: ZOO_CSS, body })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método não permitido' })
  }
  const body = req.body
  if (!isPDFData(body)) {
    return res.status(400).json({ error: 'Payload de relatório inválido ou grande demais' })
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Payload do relatório excede o limite permitido' })
  }

  try {
    await createAuthenticatedSupabase(req, body.fazendaId)
    const html = await renderZootecnicoHtml(body)
    const pdf = await generatePdf({ html, format: 'A4', landscape: true })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-zootecnico.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PDF-Renderer', 'puppeteer')
    return res.status(200).send(pdf)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    if (detail === 'Sessão não informada' || detail === 'Sessão inválida') return res.status(401).json({ error: detail })
    if (detail === 'Usuário sem acesso à fazenda') return res.status(403).json({ error: detail })
    console.error('[PDF Zootécnico] Erro ao gerar relatório:', error)
    return res.status(500).json({ error: 'Não foi possível gerar o PDF', detail: String(error) })
  }
}
