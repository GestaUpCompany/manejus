// Endpoint fino do relatório de Consumo. Mesmo padrão do morte.js: só existe
// aqui o que é específico deste relatório (layout por lote com KPIs laterais +
// pills + separador de dieta, e o gráfico composto CMS/%PV/Leitura de Cocho com
// labels anti-colisão). Toda a infraestrutura (Chrome, Chart.js, template base,
// formatadores) vem do _shared/.
//
// Diferenças estruturais em relação ao morte (ver docs/ArquiteturaRelatoriosPDF.md):
//  - O relatório é multi-lote: cada lote gera 1+ páginas (1 principal + N de
//    continuação quando os pontos de dados ultrapassam MAX_DATA_POINTS_PER_PAGE).
//  - Não há "resumo executivo" global nem tabela de detalhamento; o gráfico é o
//    elemento dominante de cada página.
//  - O gráfico é composto (barra CMS + linha %PV + linha Leitura de Cocho) com
//    3 eixos Y e rótulos anti-colisão desenhados via afterDatasetsDraw.

import { escapeHtml, dateFmt, numFmt, intFmt, titleCase } from './_shared/formatters.js'
import { getChartJsScript } from './_shared/chartjs.js'
import { generatePdf } from './_shared/puppeteer.js'
import {
  renderHeader,
  renderFooter,
  kpi,
  page as pageSection,
  chartCard,
  htmlDocument,
} from './_shared/template.js'

// Limite do body. Cada ponto de consumo pesa ~150 bytes em JSON (bem menos que
// uma linha de morte, que tem ~250). 20 mil pontos cabem em ~3MB, folgando nos
// 8MB mesmo com os logos base64.
const MAX_DATA_POINTS = 20000
const MAX_BODY_BYTES = 8_000_000

// Quantos pontos de dados cabem em um gráfico por página A4 landscape antes de
// a legenda/eixos ficarem ilegíveis. Mesmo valor usado pelo jsPDF.
const MAX_DATA_POINTS_PER_PAGE = 20

function isPDFData(value) {
  if (!value || typeof value !== 'object') return false
  if (typeof value.dataInicio !== 'string') return false
  if (typeof value.dataFim !== 'string') return false
  if (typeof value.fazendaNome !== 'string') return false
  if (!Array.isArray(value.lotes)) return false
  return value.lotes.every(
    (l) => l && typeof l === 'object' && typeof l.info === 'object' && Array.isArray(l.dados),
  )
}

function countDataPoints(lotes) {
  return lotes.reduce((sum, l) => sum + (l.dados?.length ?? 0), 0)
}

// CSS específico do consumo: layout da página de lote (KPIs em coluna à
// esquerda, gráfico à direita), pills no topo, separador de dieta. Mesmo
// critério do MORTE_CSS: específico demais para o _shared/, fica local.
const CONSUMO_CSS = `
.page{display:flex;flex-direction:column}
.lote-content{flex:1;display:flex;flex-direction:column;min-height:0}
.pills-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:3mm}
.consumo-pill{background:#0b6a42;color:#fff;border-radius:5px;padding:5px 10px;text-align:center;min-width:0;flex:1 1 60px}
.consumo-pill .pill-value{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.consumo-pill .pill-label{font-size:10px;opacity:.9;margin-top:1px}
.dieta-sep{display:flex;align-items:center;gap:10px;margin:2mm 0 3mm;color:#0b6a42;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase}
.dieta-sep::before,.dieta-sep::after{content:'';flex:1;height:1px;background:#cfdad3}
.lote-body{display:grid;grid-template-columns:40mm 1fr;gap:6px;flex:1;min-height:0}
.kpi-col{display:flex;flex-direction:column;gap:5px}
.kpi-col .kpi-card{min-height:0;padding:6px 8px}
.kpi-col .kpi-value{font-size:15px}
.kpi-col .kpi-label{font-size:11px;margin-top:3px}
.kpi-col .kpi-sub{font-size:10px}
.chart-col{display:flex;flex-direction:column;min-height:0}
.chart-col .chart-card{height:100%}
.continuation-wrap{flex:1;min-height:0;display:flex;flex-direction:column}
.continuation-wrap .chart-card{height:100%}
.empty-lote{flex:1;display:flex;align-items:center;justify-content:center;color:#93a099;font-size:14px;background:#fafcfb;border-radius:5px}
`

// Script rodado dentro do Chromium headless para desenhar os gráficos de
// consumo. Cada página com dados tem um <canvas> próprio (id único); este
// script itera sobre window.__reportData.charts e desenha cada um. O plugin
// customLabels (afterDatasetsDraw) é portado do jsPDF quase direto: a Canvas
// API do Chart.js roda idêntica no Chromium, então a lógica anti-colisão entre
// os rótulos de CMS, Consumo %PV e Leitura de Cocho é a mesma.
const CHARTS_INIT_JS = `
(function(){
  var BLUE_BAR = '#1E3A5F'
  var GREEN_LINE = '#10B981'
  var LEITURA_COLOR = '#6B7280'
  var DARK_TEXT = '#1F2937'
  var WHITE = '#FFFFFF'
  var Chart = window.Chart
  if (!Chart) { window.__chartsReady = true; return }
  Chart.defaults.animation = false
  Chart.defaults.font.family = 'Arial, Helvetica, sans-serif'

  var charts = (window.__reportData && window.__reportData.charts) || []
  var remaining = charts.length

  function drawChart(entry) {
    var el = document.getElementById(entry.canvasId)
    if (!el) { maybeDone(); return }
    var dados = entry.dados || []
    if (!dados.length) { maybeDone(); return }

    var maxCms = Math.max.apply(null, dados.map(function(d){return d.trato_kg_cab_dia}).concat([1]))
    var maxPv = Math.max.apply(null, dados.map(function(d){return d.consumo_percent_pv}).concat([1]))

    new Chart(el, {
      type: 'bar',
      data: {
        labels: dados.map(function(d){return d.data_label}),
        datasets: [
          {
            label: 'CMS (kg/cab/dia)',
            data: dados.map(function(d){return d.trato_kg_cab_dia}),
            backgroundColor: BLUE_BAR,
            borderRadius: 4,
            borderSkipped: false,
            yAxisID: 'y',
            order: 1,
            barPercentage: 0.55,
            categoryPercentage: 0.8,
          },
          {
            type: 'line',
            label: 'Consumo %PV',
            data: dados.map(function(d){return d.consumo_percent_pv}),
            borderColor: GREEN_LINE,
            backgroundColor: GREEN_LINE,
            borderWidth: 3,
            pointRadius: 6,
            pointBackgroundColor: GREEN_LINE,
            pointBorderColor: WHITE,
            pointBorderWidth: 2,
            yAxisID: 'y1',
            order: 0,
            tension: 0.3,
          },
          {
            type: 'line',
            label: 'Leitura Cocho',
            data: dados.map(function(d){return d.leitura_cocho != null ? Number(d.leitura_cocho) : NaN}),
            borderColor: LEITURA_COLOR,
            backgroundColor: LEITURA_COLOR,
            borderWidth: 0,
            showLine: false,
            pointRadius: 4,
            pointBackgroundColor: LEITURA_COLOR,
            pointBorderColor: WHITE,
            pointBorderWidth: 1.5,
            yAxisID: 'y2',
            order: 2,
            tension: 0.2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 30, right: 20, bottom: 30, left: 10 } },
        plugins: {
          legend: {
            position: 'top',
            align: 'center',
            labels: { usePointStyle: true, pointStyle: 'circle', padding: 14, color: DARK_TEXT, font: { size: 12, weight: 'bold' } },
          },
          title: { display: true, text: 'Consumo Médio %PV', align: 'center', color: DARK_TEXT, font: { size: 16, weight: 'bold' }, padding: { bottom: 8 } },
          tooltip: { enabled: false },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: LEITURA_COLOR, font: { size: 11 } },
            title: { display: true, text: 'Dias', color: LEITURA_COLOR, font: { size: 12, weight: 'bold' }, padding: { top: 8 } },
          },
          y: {
            position: 'left',
            beginAtZero: true,
            suggestedMax: maxCms * 1.15,
            title: { display: true, text: 'CMS (kg/cab/dia)', color: DARK_TEXT, font: { size: 12, weight: 'bold' } },
            ticks: { color: LEITURA_COLOR, font: { size: 11 } },
            grid: { color: '#E5E7EB' },
          },
          y1: {
            position: 'right',
            beginAtZero: true,
            suggestedMax: maxPv * 1.25,
            title: { display: true, text: '% PV', color: GREEN_LINE, font: { size: 12, weight: 'bold' } },
            ticks: { color: GREEN_LINE, font: { size: 11 }, callback: function(val){ return Number(val).toFixed(1) + '%' } },
            grid: { display: false },
          },
          y2: { display: false, min: -1, max: 25 },
        },
      },
      plugins: [{
        id: 'customLabels',
        afterDatasetsDraw: function(chart) {
          var ctx = chart.ctx
          ctx.save()
          ctx.textAlign = 'center'

          var tratoMeta = chart.getDatasetMeta(0)
          var consumoMeta = chart.getDatasetMeta(1)
          var leituraMeta = chart.getDatasetMeta(2)
          var tratoDataset = chart.data.datasets[0]
          var consumoDataset = chart.data.datasets[1]
          var leituraDataset = chart.data.datasets[2]

          // 1. Rótulos do CMS (acima da barra)
          ctx.font = 'bold 13px Arial, sans-serif'
          ctx.fillStyle = DARK_TEXT
          tratoMeta.data.forEach(function(bar, j) {
            var value = Number(tratoDataset.data[j]).toFixed(2)
            ctx.fillText(value, bar.x, bar.y - 12)
          })

          // 2. Linha + pontos + rótulos da Leitura de Cocho
          var validLeitura = leituraMeta.data.filter(function(pt) { return !pt.skip })
          if (validLeitura.length > 1) {
            ctx.beginPath()
            ctx.strokeStyle = LEITURA_COLOR
            ctx.lineWidth = 2.5
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.moveTo(validLeitura[0].x, validLeitura[0].y)
            for (var k = 1; k < validLeitura.length; k++) {
              ctx.lineTo(validLeitura[k].x, validLeitura[k].y)
            }
            ctx.stroke()
          }
          validLeitura.forEach(function(pt) {
            ctx.beginPath()
            ctx.arc(pt.x, pt.y, 4, 0, 2 * Math.PI)
            ctx.fillStyle = LEITURA_COLOR
            ctx.fill()
            ctx.lineWidth = 1.5
            ctx.strokeStyle = WHITE
            ctx.stroke()
          })

          // Pré-calcula posições Y do Consumo %PV para detecção de colisão
          var consumoYByIndex = {}
          consumoMeta.data.forEach(function(pt, j) {
            if (!pt.skip) consumoYByIndex[j] = pt.y
          })

          ctx.font = 'bold 11px Arial, sans-serif'
          leituraMeta.data.forEach(function(pt, j) {
            if (pt.skip) return
            var value = leituraDataset.data[j] != null ? String(leituraDataset.data[j]) : ''
            var consumoY = consumoYByIndex[j]
            var colideComConsumo = consumoY != null && Math.abs(pt.y - consumoY) < 24
            var labelY = colideComConsumo ? pt.y + 20 : pt.y - 10
            ctx.lineWidth = 2
            ctx.strokeStyle = DARK_TEXT
            ctx.strokeText(value, pt.x, labelY)
            ctx.fillStyle = WHITE
            ctx.fillText(value, pt.x, labelY)
          })

          // 3. Rótulos do Consumo %PV (por último, com posição dinâmica)
          ctx.font = 'bold 13px Arial, sans-serif'
          ctx.fillStyle = GREEN_LINE
          consumoMeta.data.forEach(function(pt, j) {
            if (pt.skip) return
            var value = Number(consumoDataset.data[j]).toFixed(2) + '%'
            var bar = tratoMeta.data[j]
            var barraTopo = bar ? bar.y : null
            var colide = barraTopo != null && Math.abs(pt.y - barraTopo) < 18
            var labelY = colide ? pt.y + 20 : pt.y - 18
            ctx.fillText(value, pt.x, labelY)
          })

          ctx.restore()
        },
      }],
    })
    maybeDone()
  }

  function maybeDone() {
    remaining--
    if (remaining <= 0) window.__chartsReady = true
  }

  if (!charts.length) { window.__chartsReady = true; return }
  charts.forEach(drawChart)
})();
`

function chunkDados(dados, maxPerPage) {
  if (dados.length <= maxPerPage) return [dados]
  const chunks = []
  for (let i = 0; i < dados.length; i += maxPerPage) {
    chunks.push(dados.slice(i, i + maxPerPage))
  }
  return chunks
}

function consumoMedio(dados) {
  if (!dados.length) return null
  return dados.reduce((s, d) => s + d.consumo_percent_pv, 0) / dados.length
}

function custoMedio(dados) {
  const validos = dados.filter((d) => d.custo_reais_cab_dia != null)
  if (!validos.length) return null
  return validos.reduce((s, d) => s + (d.custo_reais_cab_dia || 0), 0) / validos.length
}

function pillsHtml(info) {
  const pills = [
    { label: 'Nº Cab. Atual', value: intFmt(info.n_cabecas_atual) },
    { label: 'Raça', value: info.raca || '—' },
    { label: 'Categoria', value: info.categoria ? titleCase(info.categoria) : '—' },
    { label: 'Dieta', value: info.dieta || '—' },
  ]
  return `<div class="pills-row">${pills
    .map(
      (p) =>
        `<div class="consumo-pill"><div class="pill-value">${escapeHtml(p.value)}</div><div class="pill-label">${escapeHtml(p.label)}</div></div>`,
    )
    .join('')}</div>`
}

function kpisHtml(info, dados) {
  const cm = consumoMedio(dados)
  const custo = custoMedio(dados)
  const cards = [
    { value: intFmt(info.peso_entrada_kg), label: 'Peso Entrada (kg)' },
    { value: cm != null ? `${numFmt(cm, 2)}%` : '—', label: 'Consumo %PV' },
    { value: custo != null ? `R$ ${numFmt(custo, 2)}` : '—', label: 'R$/cab/dia' },
    { value: numFmt(info.peso_atual_kg, 2), label: 'Peso Atual (kg)' },
    { value: intFmt(info.dias), label: 'Período (dias)' },
    { value: dateFmt(info.data_prevista_final), label: 'Data Prevista Final' },
  ]
  return `<div class="kpi-col">${cards.map((c) => kpi(c.value, c.label)).join('')}</div>`
}

async function renderConsumoHtml(input) {
  const { dataInicio, dataFim, fazendaNome, logoGestao, logoFazenda, lotes } = input
  const brand = { logoGestao, logoFazenda, fazendaNome }
  const period = { dataInicio, dataFim }

  // Pré-calcula páginas por lote para saber o total antes de montar (footer
  // mostra "Página X de Y" com Y dinâmico, como no morte).
  const lotesPaginados = lotes.map((lote) => {
    const dados = lote.dados || []
    const chunks = chunkDados(dados, MAX_DATA_POINTS_PER_PAGE)
    return { lote, chunks }
  })
  const totalPages = lotesPaginados.reduce((sum, lp) => sum + lp.chunks.length, 0)

  const chartsData = []
  const pagesHtml = []
  let pageIndex = 0
  let dietaAnterior = null

  lotesPaginados.forEach(({ lote, chunks }) => {
    const info = lote.info
    const dados = lote.dados || []
    const dietaAtual = info.dieta || 'Sem dieta'
    const mudouDieta = dietaAnterior !== null && dietaAnterior !== dietaAtual
    const mostrarDieta = dietaAnterior === null || mudouDieta
    dietaAnterior = dietaAtual

    chunks.forEach((chunk, ci) => {
      const isContinuation = ci > 0
      const sectionName = isContinuation ? `${info.lote_nome} (continuação)` : info.lote_nome
      pageIndex += 1
      const canvasId = `chart-consumo-${pageIndex}`
      const hasData = chunk.length > 0
      if (hasData) chartsData.push({ canvasId, dados: chunk })

      let body
      if (!isContinuation) {
        body = `
          <div class="period-badge">${dateFmt(dataInicio)} <span style="padding:0 7px;color:#9bb1a4">até</span> ${dateFmt(dataFim)}</div>
          ${pillsHtml(info)}
          ${mostrarDieta ? `<div class="dieta-sep">Dieta: ${escapeHtml(dietaAtual)}</div>` : ''}
          <div class="lote-body">
            ${kpisHtml(info, dados)}
            <div class="chart-col">${chartCard({ canvasId, title: 'Consumo Médio %PV', subtitle: `${dados.length} registro(s) no período`, hasData })}</div>
          </div>`
      } else {
        body = `<div class="continuation-wrap">${chartCard({ canvasId, title: 'Consumo Médio %PV', subtitle: `${info.lote_nome} · continuação`, hasData })}</div>`
      }

      pagesHtml.push(
        pageSection(`
          ${renderHeader({ ...brand, reportTitle: 'Análise de Consumo', section: sectionName, sectionLabel: 'Lote' })}
          <p class="section-kicker">${isContinuation ? 'Continuação do lote' : 'Evolução do consumo'}</p>
          <div class="lote-content">${body}</div>
          ${renderFooter({ ...period, page: pageIndex, totalPages })}
        `),
      )
    })
  })

  const chartJsScript = await getChartJsScript()
  return htmlDocument({
    title: 'Relatório de Consumo',
    extraCss: CONSUMO_CSS,
    body: pagesHtml.join(''),
    chartJsScript,
    chartsInit: CHARTS_INIT_JS,
    dataJson: { charts: chartsData },
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método não permitido' })
  }
  const body = req.body
  if (!isPDFData(body) || countDataPoints(body.lotes) > MAX_DATA_POINTS) {
    return res.status(400).json({ error: 'Payload de relatório inválido ou grande demais' })
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Payload do relatório excede o limite permitido' })
  }

  try {
    console.log('[PDF Consumo] Iniciando renderização. Lotes:', body.lotes.length, 'Pontos:', countDataPoints(body.lotes))
    const html = await renderConsumoHtml(body)
    console.log('[PDF Consumo] HTML montado. Bytes:', Buffer.byteLength(html, 'utf8'))
    const pdf = await generatePdf({
      html,
      format: 'A4',
      landscape: true,
      beforePdf: async (page) => {
        await page.waitForFunction('window.__chartsReady === true', { timeout: 15000 }).catch(() => {})
      },
    })
    console.log('[PDF Consumo] PDF gerado. Bytes:', pdf.length)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-consumo.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PDF-Renderer', 'puppeteer')
    return res.status(200).send(pdf)
  } catch (error) {
    console.error('[PDF Consumo] Erro ao gerar relatório:', error)
    console.error('[PDF Consumo] Stack:', error?.stack || 'sem stack')
    return res.status(500).json({ error: 'Não foi possível gerar o PDF', detail: String(error) })
  }
}
