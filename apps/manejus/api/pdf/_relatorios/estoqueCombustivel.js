// Endpoint fino do relatório de Estoque de Combustível. Mesmo padrão do
// estoque.js: só existe aqui o que é específico deste relatório; Chrome, template
// base e formatadores vêm do _shared/.
//
// Estrutura:
//  - Página 1: período, KPIs (saldo inicial, entradas, baixas, saldo final,
//    valor em estoque, alertas) e o início da tabela de posição por tanque.
//  - Continuação da posição por tanque, se houver muitos tanques.
//  - Páginas seguintes: extrato das movimentações do período (por tanque e data)
//    com o saldo após cada lançamento.
//
// No Infográfico Mensal, dataInicio/dataFim (camelCase) chegam no payload e
// valem quando data_inicio/data_fim (snake_case, da RPC) não vêm preenchidos.

import { escapeHtml, dateFmt, moneyFmt } from '../_shared/formatters.js'
import { generatePdf } from '../_shared/puppeteer.js'
import {
  renderHeader,
  page as pageSection,
  htmlDocument,
  kpi,
} from '../_shared/template.js'

const MAX_TANQUES = 500
const MAX_MOVIMENTACOES = 5000
const MAX_BODY_BYTES = 8_000_000

const FIRST_PAGE_TANQUES = 6
const TANQUES_PER_PAGE = 14
const MOVS_PER_PAGE = 16

const ORIGEM_ROTULO = {
  pwa_entrada: 'App',
  painel_entrada: 'Painel',
  painel_ajuste: 'Painel',
  painel_baixa: 'Painel',
  estoque_inicial: 'Saldo inicial',
  auto_baixa: 'Abastecimento',
  manual: 'Manual',
}

const TIPO_ROTULO = { entrada: 'Entrada', baixa: 'Baixa', ajuste: 'Ajuste' }

export function isPDFData(value) {
  if (!value || typeof value !== 'object') return false
  if (typeof value.fazendaNome !== 'string') return false
  if (!Array.isArray(value.tanques)) return false
  if (value.movimentacoes != null && !Array.isArray(value.movimentacoes)) return false
  return true
}

const ESTOQUE_COMB_CSS = `
.ec-table td,.ec-table th{font-size:11px}
.ec-table th.num,.ec-table td.num{text-align:right}
.ec-neg{color:#c94d46;font-weight:700}
.ec-tag{display:inline-block;font-size:9px;font-weight:700;border-radius:4px;padding:1px 6px;margin-left:6px;vertical-align:middle}
.ec-tag-min{background:#fdf3e3;color:#9a6b17;border:1px solid #eedcae}
.ec-tag-neg{background:#fdf6f5;color:#c94d46;border:1px solid #efd8d6}
.ec-tipo-entrada{color:#0b6a42;font-weight:700}
.ec-tipo-baixa{color:#9a6b17;font-weight:700}
.ec-tipo-ajuste{color:#4a5a8a;font-weight:700}
.ec-total-row td{background:#f0f6f2;border-top:2px solid #0b6a42;font-weight:700;color:#0b6a42}
.ec-nota{font-size:10px;color:#7a8981;margin:2mm 0 0}
`

function periodoTexto(input) {
  const ini = input.data_inicio ?? input.dataInicio ?? null
  const fim = input.data_fim ?? input.dataFim ?? null
  if (ini && fim) return `${dateFmt(ini)} a ${dateFmt(fim)}`
  if (ini) return `A partir de ${dateFmt(ini)}`
  if (fim) return `Até ${dateFmt(fim)}`
  return 'Todo o histórico'
}

function footerEstoqueCombustivel(periodo, page, totalPages) {
  return `<footer class="report-footer"><span>Gesta'Up · Estoque de combustível · ${escapeHtml(periodo)}</span><span>Página ${page} de ${totalPages}</span></footer>`
}

function tableHeadHtml(cols) {
  const colgroup = `<colgroup>${cols.map(([, w]) => `<col style="width:${w}">`).join('')}</colgroup>`
  const header = `<thead><tr>${cols.map(([t, , cls]) => `<th${cls ? ` class="${cls}"` : ''}>${t}</th>`).join('')}</tr></thead>`
  return colgroup + header
}

function chunkArray(arr, size) {
  if (arr.length <= size) return [arr]
  const chunks = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

function soma(lista, campo) {
  return lista.reduce((s, x) => s + (Number(x[campo]) || 0), 0)
}

function litros(valor) {
  return valor == null ? '—' : moneyFmt(valor)
}

function linhaTanque(t) {
  const tags = [
    t.abaixo_limite && !t.negativo ? '<span class="ec-tag ec-tag-min">abaixo do limite</span>' : '',
    t.negativo ? '<span class="ec-tag ec-tag-neg">saldo negativo</span>' : '',
  ].join('')
  const saldoCls = t.negativo ? 'num ec-neg' : 'num'
  const pct = t.pct_capacidade == null ? '—' : `${moneyFmt(t.pct_capacidade)}%`
  return `<tr><td>${escapeHtml(t.nome)}${tags}</td><td>${escapeHtml(t.combustivel)}</td><td class="num">${litros(t.saldo_inicial_l)}</td><td class="num">${litros(t.entradas_l)}</td><td class="num">${litros(t.baixas_l)}</td><td class="num">${litros(t.ajustes_l)}</td><td class="${saldoCls}"><strong>${litros(t.saldo_final_l)}</strong></td><td class="num">${pct}</td><td class="num">${moneyFmt(t.custo_medio_l)}</td><td class="num"><strong>R$ ${moneyFmt(t.valor_estoque)}</strong></td></tr>`
}

function tanquesTableHtml(tanques, total, mostrarTotal, tanquesTodos) {
  if (!total) {
    return `<div class="table-block"><h3 class="table-title">Posição por tanque<span>0 tanques</span></h3><p style="font-size:12px;color:#7a8981;margin:0">Nenhum tanque ativo.</p></div>`
  }
  const cols = [
    ['Tanque', '16%'],
    ['Combustível', '11%'],
    ['Saldo inicial (L)', '9%', 'num'],
    ['Entradas (L)', '9%', 'num'],
    ['Baixas (L)', '9%', 'num'],
    ['Ajustes (L)', '8%', 'num'],
    ['Saldo final (L)', '10%', 'num'],
    ['% cap.', '6%', 'num'],
    ['Custo médio (R$/L)', '9%', 'num'],
    ['Valor em estoque', '13%', 'num'],
  ]
  const rows = tanques.map(linhaTanque).join('')
  const totalRow = mostrarTotal
    ? `<tr class="ec-total-row"><td>Total</td><td></td><td class="num">${litros(soma(tanquesTodos, 'saldo_inicial_l'))}</td><td class="num">${litros(soma(tanquesTodos, 'entradas_l'))}</td><td class="num">${litros(soma(tanquesTodos, 'baixas_l'))}</td><td class="num">${litros(soma(tanquesTodos, 'ajustes_l'))}</td><td class="num">${litros(soma(tanquesTodos, 'saldo_final_l'))}</td><td></td><td></td><td class="num">R$ ${moneyFmt(soma(tanquesTodos, 'valor_estoque'))}</td></tr>`
    : ''
  return `<div class="table-block"><h3 class="table-title">Posição por tanque<span>${total} ${total === 1 ? 'tanque' : 'tanques'}</span></h3><table class="ec-table">${tableHeadHtml(cols)}<tbody>${rows}${totalRow}</tbody></table></div>`
}

function detalheMovimentacao(m) {
  if (m.tipo === 'entrada') {
    const partes = [m.fornecedor, m.nota_fiscal ? `NF ${m.nota_fiscal}` : ''].filter(Boolean)
    return partes.join(' · ')
  }
  if (m.tipo === 'baixa') {
    const partes = [m.maquina, m.placa, m.motorista].filter(Boolean)
    return partes.join(' · ')
  }
  return m.observacao || ''
}

function linhaMovimentacao(m) {
  const variacao = Number(m.variacao_l) || 0
  const sinal = variacao > 0 ? '+' : ''
  const varCls = variacao < 0 ? 'num ec-neg' : 'num'
  const saldoCls = Number(m.saldo_apos_l) < 0 ? 'num ec-neg' : 'num'
  return `<tr><td>${dateFmt(m.data)}</td><td>${escapeHtml(m.tanque)}</td><td><span class="ec-tipo-${escapeHtml(m.tipo)}">${escapeHtml(TIPO_ROTULO[m.tipo] ?? m.tipo)}</span></td><td>${escapeHtml(ORIGEM_ROTULO[m.origem] ?? m.origem ?? '—')}</td><td>${escapeHtml(detalheMovimentacao(m) || '—')}</td><td class="${varCls}">${sinal}${litros(variacao)}</td><td class="num">${m.preco_por_litro == null ? '—' : moneyFmt(m.preco_por_litro)}</td><td class="num">${m.valor == null ? '—' : moneyFmt(m.valor)}</td><td class="${saldoCls}">${litros(m.saldo_apos_l)}</td></tr>`
}

function extratoTableHtml(movs, total) {
  const cols = [
    ['Data', '8%'],
    ['Tanque', '14%'],
    ['Tipo', '7%'],
    ['Origem', '9%'],
    ['Detalhe', '24%'],
    ['Variação (L)', '10%', 'num'],
    ['R$/L', '8%', 'num'],
    ['Valor (R$)', '10%', 'num'],
    ['Saldo após (L)', '10%', 'num'],
  ]
  const rows = movs.map(linhaMovimentacao).join('')
  return `<div class="table-block"><h3 class="table-title">Extrato de movimentações<span>${total} ${total === 1 ? 'lançamento' : 'lançamentos'}</span></h3><table class="ec-table">${tableHeadHtml(cols)}<tbody>${rows}</tbody></table></div>`
}

// incluirExtrato: false omite o extrato de movimentações (lançamentos).
export async function renderEstoqueCombustivelHtml(input, { pageOffset = 0, grandTotal, incluirExtrato = true } = {}) {
  const { fazendaNome, logoGestao, logoFazenda } = input
  const brand = { logoGestao, logoFazenda, fazendaNome }
  const tanques = Array.isArray(input.tanques) ? input.tanques : []
  const movs = incluirExtrato && Array.isArray(input.movimentacoes) ? input.movimentacoes : []
  const periodo = periodoTexto(input)
  const titulo = 'Relatório de Estoque de Combustível'

  const tanquesHead = tanques.slice(0, FIRST_PAGE_TANQUES)
  const tanquesResto = chunkArray(tanques.slice(FIRST_PAGE_TANQUES), TANQUES_PER_PAGE).filter((c) => c.length)
  const movChunks = movs.length ? chunkArray(movs, MOVS_PER_PAGE) : []
  const totalPages = 1 + tanquesResto.length + (!incluirExtrato ? 0 : movs.length ? movChunks.length : 1)

  const abaixo = tanques.filter((t) => t.abaixo_limite).length
  const negativos = tanques.filter((t) => t.negativo).length

  const pagesHtml = []
  let pageIndex = 1
  pagesHtml.push(
    pageSection(`
      ${renderHeader({ ...brand, reportTitle: titulo })}
      <p class="section-kicker">Posição e movimentação</p>
      <div class="period-badge">${escapeHtml(periodo)}</div>
      <div class="kpi-grid">
        ${kpi(`${litros(soma(tanques, 'saldo_inicial_l'))} L`, 'Saldo inicial')}
        ${kpi(`${litros(soma(tanques, 'entradas_l'))} L`, 'Entradas', `R$ ${moneyFmt(soma(tanques, 'entradas_valor'))}`)}
        ${kpi(`${litros(soma(tanques, 'baixas_l'))} L`, 'Baixas (consumo)', `R$ ${moneyFmt(soma(tanques, 'baixas_valor'))}`, 'gold')}
        ${kpi(`${litros(soma(tanques, 'saldo_final_l'))} L`, 'Saldo final', `Valor em estoque: R$ ${moneyFmt(soma(tanques, 'valor_estoque'))}`)}
      </div>
      ${tanquesTableHtml(tanquesHead, tanques.length, tanquesResto.length === 0, tanques)}
      ${abaixo || negativos ? `<p class="ec-nota">${abaixo ? `${abaixo} ${abaixo === 1 ? 'tanque' : 'tanques'} no limite de alerta ou abaixo. ` : ''}${negativos ? `${negativos} ${negativos === 1 ? 'tanque' : 'tanques'} com saldo negativo (falta lançar entrada); fora do valor em estoque.` : ''}</p>` : ''}
      <p class="ec-nota">Valor em estoque = saldo final × custo médio atual do tanque. Saldos inicial e final reconstruídos pelo histórico de lançamentos.</p>
      ${footerEstoqueCombustivel(periodo, pageOffset + pageIndex, grandTotal ?? totalPages)}
    `),
  )

  tanquesResto.forEach((chunk, i) => {
    pageIndex += 1
    pagesHtml.push(
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: titulo })}
        <p class="section-kicker">Posição por tanque (continuação)</p>
        ${tanquesTableHtml(chunk, tanques.length, i === tanquesResto.length - 1, tanques)}
        ${footerEstoqueCombustivel(periodo, pageOffset + pageIndex, grandTotal ?? totalPages)}
      `),
    )
  })

  if (!incluirExtrato) {
    // Sem extrato: a parte termina na posição por tanque
  } else if (movs.length === 0) {
    pageIndex += 1
    pagesHtml.push(
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: titulo })}
        <p class="section-kicker">Movimentação do período</p>
        <p style="font-size:12px;color:#7a8981">Nenhuma movimentação no período.</p>
        ${footerEstoqueCombustivel(periodo, pageOffset + pageIndex, grandTotal ?? totalPages)}
      `),
    )
  } else {
    movChunks.forEach((chunk) => {
      pageIndex += 1
      pagesHtml.push(
        pageSection(`
          ${renderHeader({ ...brand, reportTitle: titulo })}
          <p class="section-kicker">Movimentação do período</p>
          ${extratoTableHtml(chunk, movs.length)}
          ${footerEstoqueCombustivel(periodo, pageOffset + pageIndex, grandTotal ?? totalPages)}
        `),
      )
    })
  }

  return htmlDocument({
    title: titulo,
    extraCss: ESTOQUE_COMB_CSS,
    body: pagesHtml.join(''),
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método não permitido' })
  }
  const body = req.body
  if (!isPDFData(body) || body.tanques.length > MAX_TANQUES || (body.movimentacoes?.length ?? 0) > MAX_MOVIMENTACOES) {
    return res.status(400).json({ error: 'Payload de relatório inválido ou grande demais' })
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Payload do relatório excede o limite permitido' })
  }

  try {
    console.log('[PDF Estoque Combustível] Iniciando renderização. Tanques:', body.tanques.length)
    const html = await renderEstoqueCombustivelHtml(body)
    const pdf = await generatePdf({ html, format: 'A4', landscape: true })
    console.log('[PDF Estoque Combustível] PDF gerado. Bytes:', pdf.length)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-estoque-combustivel.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PDF-Renderer', 'puppeteer')
    return res.status(200).send(pdf)
  } catch (error) {
    console.error('[PDF Estoque Combustível] Erro ao gerar relatório:', error)
    return res.status(500).json({ error: 'Não foi possível gerar o PDF', detail: String(error) })
  }
}
