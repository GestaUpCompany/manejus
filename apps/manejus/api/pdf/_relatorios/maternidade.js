// Endpoint fino do relatório de Maternidade. Mesmo padrão do almoxarifado.js: só existe aqui o que é
// específico deste relatório; Chrome, template base e formatadores vêm do _shared/.
//
// O cliente envia o `resumo` já calculado (src/features/relatorioMaternidade/agregacao.ts, fonte única das
// regras); o endpoint só monta o HTML. Duas páginas:
//  - Página 1: KPIs de partos e crias, nascimentos por mês e distribuições (sexo, tipo de parto, categoria da mãe).
//  - Página 2: matrizes (escore, docilidade, ranking por intercorrências), tratamentos e medicamentos, pasto e lote.
// No Infográfico Mensal, dataInicio/dataFim (camelCase) chegam no payload e valem quando
// data_inicio/data_fim (snake_case, da RPC) não vêm preenchidos.

import { escapeHtml, dateFmt } from '../_shared/formatters.js'
import { generatePdf } from '../_shared/puppeteer.js'
import { renderHeader, page as pageSection, htmlDocument, kpi } from '../_shared/template.js'

const MAX_BODY_BYTES = 8_000_000
const LINHAS_DIST = 8
const LINHAS_MATRIZ = 10

function isPDFData(value) {
  if (!value || typeof value !== 'object') return false
  if (typeof value.fazendaNome !== 'string') return false
  if (!value.resumo || typeof value.resumo !== 'object') return false
  return true
}

const MATERNIDADE_CSS = `
.mt-table td,.mt-table th{font-size:11px}
.mt-table th.num,.mt-table td.num{text-align:right}
.mt-duo{display:grid;gap:7mm;align-items:start;grid-template-columns:1fr 1fr}
.mt-trio{display:grid;gap:6mm;align-items:start;grid-template-columns:1fr 1fr 1fr}
.mt-bar{display:flex;align-items:center;gap:6px;font-size:11px;margin:1.4mm 0}
.mt-bar-label{flex:0 0 34%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#25332b}
.mt-bar-track{flex:1;height:9px;background:#eef3f0;border-radius:5px;overflow:hidden}
.mt-bar-fill{height:100%;background:#0b6a42;border-radius:5px}
.mt-bar-fill.gold{background:#c28a27}
.mt-bar-val{flex:0 0 auto;min-width:22px;text-align:right;font-weight:700;color:#0b6a42}
.mt-vazio{font-size:11px;color:#7a8981;margin:0}
.mt-nota{font-size:10px;color:#7a8981;margin:2mm 0 0}
.mt-aviso{font-size:11px;color:#9a6b17;background:#fdf3e3;border:1px solid #eedcae;border-radius:6px;padding:2mm 3mm;margin:2mm 0 0}
.mt-neg{color:#c94d46;font-weight:700}
`

const inteiro = (v) => (Number(v) || 0).toLocaleString('pt-BR')
const plural = (n, um, varios) => `${inteiro(n)} ${Number(n) === 1 ? um : varios}`
const decimal = (v, casas = 1) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }))
const percentual = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : `${(Number(v) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`)

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function rotuloMes(mes) {
  const [a, m] = String(mes).split('-')
  return a && m ? `${MESES[Number(m) - 1] ?? m}/${a.slice(2)}` : String(mes)
}

function periodoTexto(input) {
  const ini = input.data_inicio ?? input.dataInicio ?? null
  const fim = input.data_fim ?? input.dataFim ?? null
  if (ini && fim) return `${dateFmt(ini)} a ${dateFmt(fim)}`
  if (ini) return `A partir de ${dateFmt(ini)}`
  if (fim) return `Até ${dateFmt(fim)}`
  return 'Todo o período'
}

function footerMaternidade(periodo, page, totalPages) {
  return `<footer class="report-footer"><span>Gesta'Up · Maternidade · ${escapeHtml(periodo)}</span><span>Página ${page} de ${totalPages}</span></footer>`
}

function barrasHtml(titulo, itens, { tom = '', max = LINHAS_DIST } = {}) {
  const lista = Array.isArray(itens) ? itens : []
  const cab = `<h3 class="table-title">${escapeHtml(titulo)}<span>${lista.length}</span></h3>`
  if (!lista.length) return `<div class="table-block">${cab}<p class="mt-vazio">Sem registros no período.</p></div>`
  const topo = Math.max(...lista.map((i) => Number(i.valor) || 0), 1)
  const linhas = lista.slice(0, max).map((i) => {
    const pct = Math.max(2, Math.round(((Number(i.valor) || 0) / topo) * 100))
    return `<div class="mt-bar"><span class="mt-bar-label" title="${escapeHtml(i.label)}">${escapeHtml(i.label)}</span><span class="mt-bar-track"><span class="mt-bar-fill ${tom}" style="display:block;width:${pct}%"></span></span><span class="mt-bar-val">${inteiro(i.valor)}</span></div>`
  }).join('')
  const resto = lista.length > max ? `<p class="mt-nota">e mais ${plural(lista.length - max, 'item', 'itens')}.</p>` : ''
  return `<div class="table-block">${cab}${linhas}${resto}</div>`
}

function porMesHtml(meses) {
  const lista = Array.isArray(meses) ? meses : []
  return barrasHtml('Nascimentos por mês', lista.map((m) => ({ label: rotuloMes(m.mes), valor: m.crias })), { max: 12 })
}

function matrizesHtml(matrizes) {
  const lista = Array.isArray(matrizes) ? matrizes : []
  const cab = `<h3 class="table-title">Matrizes com mais intercorrências<span>${lista.length}</span></h3>`
  if (!lista.length) return `<div class="table-block">${cab}<p class="mt-vazio">Nenhuma matriz identificada no período.</p></div>`
  const colunas = [['Matriz', '24%'], ['Categoria', '20%'], ['Partos', '11%', 'num'], ['Crias', '11%', 'num'], ['Interc.', '12%', 'num'], ['Medic.', '11%', 'num'], ['Escore', '11%', 'num']]
  const colgroup = `<colgroup>${colunas.map(([, w]) => `<col style="width:${w}">`).join('')}</colgroup>`
  const head = `<thead><tr>${colunas.map(([t, , c]) => `<th${c ? ` class="${c}"` : ''}>${t}</th>`).join('')}</tr></thead>`
  const linhas = lista.slice(0, LINHAS_MATRIZ).map((m) => {
    const cls = Number(m.intercorrencias) > 0 ? 'num mt-neg' : 'num'
    return `<tr><td>${escapeHtml(m.mae)}</td><td>${escapeHtml(m.categoria ?? '—')}</td><td class="num">${inteiro(m.partos)}</td><td class="num">${inteiro(m.crias)}</td><td class="${cls}">${inteiro(m.intercorrencias)}</td><td class="num">${inteiro(m.medicamentos)}</td><td class="num">${decimal(m.escore_medio)}</td></tr>`
  }).join('')
  return `<div class="table-block">${cab}<table class="mt-table">${colgroup}${head}<tbody>${linhas}</tbody></table></div>`
}

function avisosHtml(input, resumo) {
  const avisos = []
  const total = Number(input.registros_total)
  if (Number.isFinite(total) && total > Number(resumo.crias)) {
    avisos.push(`Resumo calculado sobre ${plural(resumo.crias, 'registro', 'registros')} de ${inteiro(total)} no período. Reduza o período para ver todos.`)
  }
  if (Number(resumo.crias_mortas) > 0) {
    avisos.push(`${plural(resumo.crias_mortas, 'registro de aborto ou natimorto', 'registros de aborto ou natimorto')}: não contam como cria viva nem no peso médio.`)
  }
  return avisos.map((a) => `<p class="mt-aviso">${escapeHtml(a)}</p>`).join('')
}

export async function renderMaternidadeHtml(input) {
  const { fazendaNome, logoGestao, logoFazenda } = input
  const brand = { logoGestao, logoFazenda, fazendaNome }
  const resumo = input.resumo
  const periodo = periodoTexto(input)
  const titulo = 'Relatório de Maternidade'
  const totalPages = 2

  let n = 1
  const wrap = (corpo) => pageSection(`${renderHeader({ ...brand, reportTitle: titulo })}${corpo}${footerMaternidade(periodo, n, totalPages)}`)

  const kpis = [
    kpi(inteiro(resumo.partos), 'Partos', `${plural(resumo.crias, 'cria registrada', 'crias registradas')}`),
    kpi(inteiro(resumo.crias_vivas), 'Crias vivas', `${inteiro(resumo.machos)} machos · ${inteiro(resumo.femeas)} fêmeas`),
    kpi(percentual(resumo.taxa_perda), 'Perda de crias', `${plural(resumo.crias_mortas, 'aborto/natimorto', 'abortos/natimortos')}`, Number(resumo.crias_mortas) > 0 ? 'red' : 'green'),
    kpi(resumo.peso_medio_kg == null ? '—' : `${decimal(resumo.peso_medio_kg)} kg`, 'Peso médio ao nascer', resumo.pesadas ? `${plural(resumo.pesadas, 'cria pesada', 'crias pesadas')}` : 'sem pesagens', 'gold'),
  ].join('')

  const pagina1 = wrap(`
    <p class="section-kicker">Resumo do período</p>
    <div class="period-badge">${escapeHtml(periodo)}</div>
    <div class="kpi-grid">${kpis}</div>
    <div class="mt-duo">${porMesHtml(resumo.por_mes)}${barrasHtml('Tipo de parto', resumo.por_tipo_parto, { tom: 'gold' })}</div>
    <div class="mt-trio">${barrasHtml('Sexo das crias vivas', resumo.por_sexo)}${barrasHtml('Raça das crias', resumo.por_raca)}${barrasHtml('Categoria da mãe', resumo.por_categoria_mae)}</div>
    ${avisosHtml(input, resumo)}
  `)

  n = 2
  const pagina2 = wrap(`
    <p class="section-kicker">Matrizes e manejo</p>
    <div class="kpi-grid">
      ${kpi(inteiro(resumo.matrizes_distintas), 'Matrizes que pariram')}
      ${kpi(percentual(resumo.taxa_intercorrencia), 'Partos com intercorrência', `${plural(resumo.partos_com_intercorrencia, 'parto', 'partos')} (cesárea, auxílio, aborto ou natimorto)`, Number(resumo.partos_com_intercorrencia) > 0 ? 'red' : 'green')}
      ${kpi(decimal(resumo.escore_medio), 'Escore médio da matriz')}
      ${kpi(decimal(resumo.docilidade_media), 'Docilidade média', null, 'gold')}
    </div>
    ${matrizesHtml(resumo.matrizes)}
    <div class="mt-trio">${barrasHtml('Tratamentos das crias', resumo.tratamentos)}${barrasHtml('Medicamentos', resumo.medicamentos, { tom: 'gold' })}${barrasHtml('Partos por pasto', resumo.por_pasto)}</div>
    <p class="mt-nota">Parto = grupo de crias com o mesmo vínculo (gêmeos contam como um parto). Intercorrência = cesárea, parto auxiliado, aborto ou natimorto. Escore e docilidade são médias dos registros que informaram o valor.</p>
  `)

  return htmlDocument({ title: titulo, extraCss: MATERNIDADE_CSS, body: pagina1 + pagina2 })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método não permitido' })
  }
  const body = req.body
  if (!isPDFData(body)) {
    return res.status(400).json({ error: 'Payload de relatório inválido' })
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Payload do relatório excede o limite permitido' })
  }

  try {
    console.log('[PDF Maternidade] Iniciando renderização. Partos:', body.resumo.partos)
    const html = await renderMaternidadeHtml(body)
    const pdf = await generatePdf({ html, format: 'A4', landscape: true })
    console.log('[PDF Maternidade] PDF gerado. Bytes:', pdf.length)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-maternidade.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PDF-Renderer', 'puppeteer')
    return res.status(200).send(pdf)
  } catch (error) {
    console.error('[PDF Maternidade] Erro ao gerar relatório:', error)
    return res.status(500).json({ error: 'Não foi possível gerar o PDF', detail: String(error) })
  }
}
