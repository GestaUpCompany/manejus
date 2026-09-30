// Endpoint fino do relatório de Estoque. Mesmo padrão do rodeio.js e
// pastagens.js: só existe aqui o que é específico deste relatório (uma
// página de resumo com KPIs + tabelas de posição por grupo). Toda a
// infraestrutura (Chrome, template base, formatadores) vem do _shared/.
//
// Snapshot sem período: em vez de dataInicio/dataFim, o payload traz
// gerado_em e o rodapé marca "Posição do estoque em <data>". No Infográfico
// Mensal, dataInicio/dataFim chegam no payload só para a página de "sem
// registros" do composer poder exibir o período selecionado.
//
// Estrutura:
//  - Página 1: KPIs (valor total, itens, abaixo do mínimo, negativos) +
//    início da tabela do primeiro grupo presente no escopo.
//  - Páginas seguintes: continuação do grupo e, quando o escopo cobre os
//    dois, as tabelas do segundo grupo sempre começam em página própria.

import { escapeHtml, dateFmt, moneyFmt } from './_shared/formatters.js'
import { generatePdf } from './_shared/puppeteer.js'
import {
  renderHeader,
  page as pageSection,
  htmlDocument,
} from './_shared/template.js'

const MAX_ITENS = 5000
const MAX_BODY_BYTES = 8_000_000

// A primeira página carrega o selo "Estoque em <data>" além do cabeçalho e
// precisa sobrar linha para o "Valor total" do primeiro grupo; as
// continuações usam a página inteira. Linhas são curtas (uma linha por item).
const FIRST_PAGE_ROWS = 18
const ROWS_PER_PAGE = 24

const GRUPOS = [
  { key: 'insumo', label: 'Insumos' },
  { key: 'formulacao', label: 'Formulações' },
]

function isPDFData(value) {
  if (!value || typeof value !== 'object') return false
  if (typeof value.fazendaNome !== 'string') return false
  if (!Array.isArray(value.itens)) return false
  return true
}

const ESTOQUE_CSS = `
.est-table td,.est-table th{font-size:11px}
.est-table th:nth-child(n+3),.est-table td.numeric{text-align:center}
.est-neg{color:#c94d46;font-weight:700}
.est-alerta{color:#9a6b17}
.est-tag{display:inline-block;font-size:9px;font-weight:700;border-radius:4px;padding:1px 6px;margin-left:6px;vertical-align:middle}
.est-tag-min{background:#fdf3e3;color:#9a6b17;border:1px solid #eedcae}
.est-tag-neg{background:#fdf6f5;color:#c94d46;border:1px solid #efd8d6}
.est-total-row td{background:#f0f6f2;border-top:2px solid #0b6a42;font-weight:700;color:#0b6a42}
`

function pl(n, singular, plural) {
  return n === 1 ? singular : plural
}

// Rodapé próprio: em vez de período, o snapshot marca a data de geração.
// Mantém o padrão "Página X de Y" que o reportComposer renumera.
function footerEstoque(geradoEm, page, totalPages) {
  return `<footer class="report-footer"><span>Gesta'Up · Posição do estoque em ${dateFmt(geradoEm)}</span><span>Página ${page} de ${totalPages}</span></footer>`
}

function tableHeadHtml(cols) {
  const colgroup = `<colgroup>${cols.map(([, w]) => `<col style="width:${w}">`).join('')}</colgroup>`
  const header = `<thead><tr>${cols.map(([t]) => `<th>${t}</th>`).join('')}</tr></thead>`
  return colgroup + header
}

function linhaItem(item) {
  const tags = [
    item.em_alerta ? '<span class="est-tag est-tag-min">abaixo do mínimo</span>' : '',
    item.negativo ? '<span class="est-tag est-tag-neg">saldo negativo</span>' : '',
  ].join('')
  const saldoCls = item.negativo ? 'numeric est-neg' : 'numeric'
  const unidade = ` ${escapeHtml(item.unidade || 'kg')}`
  return `<tr><td>${escapeHtml(item.nome)}${tags}</td><td>${escapeHtml(item.tipo || '—')}</td><td class="${saldoCls}">${moneyFmt(item.estoque_atual)}${unidade}</td><td class="numeric">${moneyFmt(item.custo_unitario)}</td><td class="numeric"><strong>R$ ${moneyFmt(item.valor_estoque)}</strong></td></tr>`
}

function estoqueTableHtml(itens, total, valorTotal, mostrarTotal = true) {
  if (!total) {
    return `<div class="table-block"><h3 class="table-title">Posição de estoque<span>0 itens</span></h3><p style="font-size:12px;color:#7a8981;margin:0">Nenhum item ativo neste grupo.</p></div>`
  }
  const cols = [
    ['Item', '38%'],
    ['Tipo', '18%'],
    ['Estoque atual', '15%'],
    ['Custo médio (R$/un.)', '14%'],
    ['Valor em estoque', '15%'],
  ]
  const rows = itens.map(linhaItem).join('')
  const totalRow = mostrarTotal ? `<tr class="est-total-row"><td>Valor total</td><td></td><td></td><td></td><td class="numeric">R$ ${moneyFmt(valorTotal)}</td></tr>` : ''
  return `<div class="table-block"><h3 class="table-title">Posição de estoque<span>${total} ${pl(total, 'item', 'itens')}</span></h3><table class="est-table">${tableHeadHtml(cols)}<tbody>${rows}${totalRow}</tbody></table></div>`
}

function chunkArray(arr, size) {
  if (arr.length <= size) return [arr]
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

export async function renderEstoqueHtml(input) {
  const { fazendaNome, logoGestao, logoFazenda, gerado_em, itens } = input
  const brand = { logoGestao, logoFazenda, fazendaNome }
  const itensLista = Array.isArray(itens) ? itens : []

  const grupos = GRUPOS
    .map((g) => ({ ...g, itens: itensLista.filter((i) => i.item_tipo === g.key) }))
    .filter((g) => g.itens.length > 0)

  // Página 1 carrega o primeiro chunk do primeiro grupo; cada grupo seguinte
  // (e o resto do primeiro) pagina em ROWS_PER_PAGE.
  const primeiro = grupos[0]
  const primeiroHead = primeiro ? primeiro.itens.slice(0, FIRST_PAGE_ROWS) : []
  const primeiroResto = primeiro ? chunkArray(primeiro.itens.slice(FIRST_PAGE_ROWS), ROWS_PER_PAGE).filter((c) => c.length) : []

  const totalPages = 1
    + (primeiroResto.length || 0)
    + grupos.slice(1).reduce((s, g) => s + Math.max(1, Math.ceil(g.itens.length / ROWS_PER_PAGE)), 0)

  const pagesHtml = []
  let pageIndex = 0

  pageIndex += 1
  pagesHtml.push(
    pageSection(`
      ${renderHeader({ ...brand, reportTitle: 'Relatório de Estoque' })}
      <p class="section-kicker">Posição atual</p>
      <div class="period-badge">Estoque em ${dateFmt(gerado_em)}</div>
      ${primeiro ? `<p class="section-kicker" style="margin-top:4mm">${escapeHtml(primeiro.label)}</p>${estoqueTableHtml(primeiroHead, primeiro.itens.length, primeiro.itens.reduce((s, i) => s + Number(i.valor_estoque || 0), 0), primeiroResto.length === 0)}` : '<p style="font-size:12px;color:#7a8981">Nenhum item de estoque no escopo deste relatório.</p>'}
      ${footerEstoque(gerado_em, pageIndex, totalPages)}
    `),
  )

  primeiroResto.forEach((chunk, i) => {
    pageIndex += 1
    pagesHtml.push(
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: 'Relatório de Estoque' })}
        <p class="section-kicker">${escapeHtml(primeiro.label)} (continuação)</p>
        ${estoqueTableHtml(chunk, primeiro.itens.length, primeiro.itens.reduce((s, x) => s + Number(x.valor_estoque || 0), 0), i === primeiroResto.length - 1)}
        ${footerEstoque(gerado_em, pageIndex, totalPages)}
      `),
    )
  })

  for (const grupo of grupos.slice(1)) {
    const chunks = chunkArray(grupo.itens, ROWS_PER_PAGE)
    const valorGrupo = grupo.itens.reduce((s, i) => s + Number(i.valor_estoque || 0), 0)
    chunks.forEach((chunk, i) => {
      pageIndex += 1
      pagesHtml.push(
        pageSection(`
          ${renderHeader({ ...brand, reportTitle: 'Relatório de Estoque' })}
          <p class="section-kicker">${escapeHtml(grupo.label)}</p>
          ${estoqueTableHtml(chunk, grupo.itens.length, valorGrupo, i === chunks.length - 1)}
          ${footerEstoque(gerado_em, pageIndex, totalPages)}
        `),
      )
    })
  }

  return htmlDocument({
    title: 'Relatório de Estoque',
    extraCss: ESTOQUE_CSS,
    body: pagesHtml.join(''),
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método não permitido' })
  }
  const body = req.body
  if (!isPDFData(body) || (body.itens?.length ?? 0) > MAX_ITENS) {
    return res.status(400).json({ error: 'Payload de relatório inválido ou grande demais' })
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Payload do relatório excede o limite permitido' })
  }

  try {
    console.log('[PDF Estoque] Iniciando renderização. Itens:', body.itens.length)
    const html = await renderEstoqueHtml(body)
    console.log('[PDF Estoque] HTML montado. Bytes:', Buffer.byteLength(html, 'utf8'))
    const pdf = await generatePdf({ html, format: 'A4', landscape: true })
    console.log('[PDF Estoque] PDF gerado. Bytes:', pdf.length)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-estoque.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PDF-Renderer', 'puppeteer')
    return res.status(200).send(pdf)
  } catch (error) {
    console.error('[PDF Estoque] Erro ao gerar relatório:', error)
    console.error('[PDF Estoque] Stack:', error?.stack || 'sem stack')
    return res.status(500).json({ error: 'Não foi possível gerar o PDF', detail: String(error) })
  }
}
