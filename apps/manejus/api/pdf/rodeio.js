// Endpoint fino do relatório de Rodeio. Mesmo padrão do clima.js e
// morte.js: só existe aqui o que é específico deste relatório (página de
// resumo com KPIs + gráficos, página de análise com alertas e resumos por
// lote/pasto, e páginas de detalhamento com os registros). Toda a
// infraestrutura (Chrome, Chart.js, template base, formatadores, labels de
// diagnóstico) vem do _shared/.
//
// Estrutura:
//  - Página 1: KPIs + gráficos "cabeças por dia" (barras empilhadas por
//    categoria) e "escore médio por dia" (linha, gado e fezes).
//  - Página 2: gráfico de frequência de alertas por diagnóstico + tabelas
//    "Resumo por lote" e "Resumo por pasto".
//  - Página 3+: tabela "Registros detalhados" pre-chunked.

import { escapeHtml, dateFmt, numFmt, intFmt } from './_shared/formatters.js'
import { rodeioAlertas } from './_shared/labels.js'
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

const MAX_REGISTROS = 20000
const MAX_BODY_BYTES = 8_000_000

// Linhas por página do detalhamento (A4 landscape, ~140mm úteis). A coluna
// de alertas pode quebrar em 2 linhas, então a estimativa é conservadora.
const DETAIL_ROWS_PER_PAGE = 12

const CATEGORIAS = [
  { key: 'vaca', label: 'Vacas' },
  { key: 'touro', label: 'Touros' },
  { key: 'bezerro', label: 'Bezerros' },
  { key: 'boi', label: 'Bois' },
  { key: 'garrote', label: 'Garrotes' },
  { key: 'novilha', label: 'Novilhas' },
]

const CATEGORIA_COLORS = {
  vaca: '#0F6437',
  touro: '#1E3A5F',
  bezerro: '#10B981',
  boi: '#c28a27',
  garrote: '#6B7280',
  novilha: '#EC4899',
}

function isPDFData(value) {
  if (!value || typeof value !== 'object') return false
  if (typeof value.dataInicio !== 'string') return false
  if (typeof value.dataFim !== 'string') return false
  if (typeof value.fazendaNome !== 'string') return false
  if (!value.resumo || typeof value.resumo !== 'object') return false
  if (!Array.isArray(value.registros)) return false
  return true
}

// CSS específico do rodeio: grid de gráficos lado a lado na página 1,
// página 2 com gráfico + duas tabelas de resumo empilhadas. Prefixo
// .rodeio-* nas tabelas para não colidir com CSS de outros relatórios.
const RODEIO_CSS = `
.page{display:flex;flex-direction:column}
.rodeio-content{flex:1;display:flex;flex-direction:column;min-height:0}
.rodeio-charts{display:grid;grid-template-columns:1fr 1fr;gap:8px;flex:1;min-height:0}
.rodeio-charts .chart-card{height:100%}
.rodeio-page2-chart .chart-card{height:52mm}
.rodeio-resumo-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6mm}
.rodeio-resumo-table td, .rodeio-detail-table td{font-size:11px;padding:5px 4px;line-height:1.25}
.rodeio-resumo-table th, .rodeio-detail-table th{font-size:10px;padding:5px 4px}
.rodeio-resumo-table th, .rodeio-resumo-table td,
.rodeio-detail-table th, .rodeio-detail-table td{border-right:1px solid #d8e0db}
.rodeio-resumo-table th:last-child, .rodeio-resumo-table td:last-child,
.rodeio-detail-table th:last-child, .rodeio-detail-table td:last-child{border-right:none}
.rodeio-resumo-table tbody tr:nth-child(even), .rodeio-detail-table tbody tr:nth-child(even){background:#f7faf8}
.rodeio-alerta{color:#c94d46;font-weight:600}
.rodeio-alerta-obs{display:block;color:#8a9890;font-weight:400;font-size:9px}
`

// Script rodado dentro do Chromium headless. Cada entrada de
// __reportData.charts carrega um `kind` que decide o tipo de gráfico:
// 'cabecas' (barras empilhadas por categoria), 'escore' (linha dupla) ou
// 'alertas' (barras horizontais por diagnóstico).
const CHARTS_INIT_JS = `
(function(){
  var DARK_TEXT = '#1F2937'
  var MEDIUM_TEXT = '#6B7280'
  var CATEGORIA_COLORS = ${JSON.stringify(CATEGORIA_COLORS)}
  var Chart = window.Chart
  if (!Chart) { window.__chartsReady = true; return }
  Chart.defaults.animation = false
  Chart.defaults.font.family = 'Arial, Helvetica, sans-serif'

  var charts = (window.__reportData && window.__reportData.charts) || []

  function baseLegend() {
    return {
      position: 'top',
      align: 'center',
      labels: { usePointStyle: true, pointStyle: 'circle', padding: 12, color: DARK_TEXT, font: { size: 11, weight: 'bold' } },
    }
  }

  function drawCabecas(el, entry) {
    var serie = entry.serie || []
    var cats = entry.categorias || []
    if (!serie.length || !cats.length) return
    var datasets = cats.map(function(cat) {
      return {
        label: cat.label,
        data: serie.map(function(p){ return Number(p[cat.key]) || 0 }),
        backgroundColor: CATEGORIA_COLORS[cat.key] || '#6B7280',
        borderRadius: 2,
        borderSkipped: false,
        barPercentage: 0.75,
        categoryPercentage: 0.75,
      }
    })
    new Chart(el, {
      type: 'bar',
      data: { labels: serie.map(function(p){ return p.data_label }), datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 18, right: 10, bottom: 6, left: 6 } },
        plugins: { legend: baseLegend(), tooltip: { enabled: false } },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: MEDIUM_TEXT, font: { size: 10 } } },
          y: {
            stacked: true,
            beginAtZero: true,
            title: { display: true, text: 'Cabeças', color: DARK_TEXT, font: { size: 11, weight: 'bold' } },
            ticks: { color: MEDIUM_TEXT, font: { size: 10 } },
            grid: { color: '#E5E7EB' },
          },
        },
      },
      plugins: [{
        id: 'totalLabels',
        afterDatasetsDraw: function(chart) {
          var ctx = chart.ctx
          var metas = chart.data.datasets.map(function(_, i){ return chart.getDatasetMeta(i) }).filter(function(m){ return !m.hidden })
          if (!metas.length) return
          ctx.save()
          ctx.textAlign = 'center'
          ctx.font = 'bold 9px Arial, sans-serif'
          ctx.fillStyle = DARK_TEXT
          serie.forEach(function(p, j) {
            var total = Number(p.total) || 0
            if (!total) return
            var topBar = null
            metas.forEach(function(m) {
              var bar = m.data[j]
              if (bar && (!topBar || bar.y < topBar.y)) topBar = bar
            })
            if (topBar) ctx.fillText(String(total), topBar.x, topBar.y - 4)
          })
          ctx.restore()
        },
      }],
    })
  }

  function drawEscore(el, entry) {
    var serie = entry.serie || []
    if (!serie.length) return
    var datasets = [
      {
        label: 'Escore gado',
        data: serie.map(function(p){ return p.escore_medio != null ? Number(p.escore_medio) : null }),
        borderColor: '#0F6437',
        backgroundColor: '#0F6437',
        borderWidth: 3,
        pointRadius: 4,
        pointBackgroundColor: '#0F6437',
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 2,
        tension: 0.3,
        spanGaps: true,
      },
      {
        label: 'Escore fezes',
        data: serie.map(function(p){ return p.escore_fezes_medio != null ? Number(p.escore_fezes_medio) : null }),
        borderColor: '#c28a27',
        backgroundColor: '#c28a27',
        borderWidth: 3,
        pointRadius: 4,
        pointBackgroundColor: '#c28a27',
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 2,
        borderDash: [6, 3],
        tension: 0.3,
        spanGaps: true,
      },
    ]
    new Chart(el, {
      type: 'line',
      data: { labels: serie.map(function(p){ return p.data_label }), datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 18, right: 10, bottom: 6, left: 6 } },
        plugins: { legend: baseLegend(), tooltip: { enabled: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: MEDIUM_TEXT, font: { size: 10 } } },
          y: {
            beginAtZero: true,
            suggestedMax: 5,
            title: { display: true, text: 'Escore (1-5)', color: DARK_TEXT, font: { size: 11, weight: 'bold' } },
            ticks: { color: MEDIUM_TEXT, font: { size: 10 }, stepSize: 1 },
            grid: { color: '#E5E7EB' },
          },
        },
      },
    })
  }

  function drawAlertas(el, entry) {
    var itens = entry.itens || []
    if (!itens.length) return
    new Chart(el, {
      type: 'bar',
      data: {
        labels: itens.map(function(i){ return i.label }),
        datasets: [{
          label: 'Ocorrências',
          data: itens.map(function(i){ return Number(i.valor) || 0 }),
          backgroundColor: '#c94d46',
          borderRadius: 3,
          borderSkipped: false,
          barPercentage: 0.7,
          categoryPercentage: 0.7,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 10, right: 24, bottom: 6, left: 6 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { color: MEDIUM_TEXT, font: { size: 10 }, precision: 0 },
            grid: { color: '#E5E7EB' },
            title: { display: true, text: 'Nº de rodeios com alerta', color: DARK_TEXT, font: { size: 11, weight: 'bold' } },
          },
          y: { grid: { display: false }, ticks: { color: DARK_TEXT, font: { size: 10 } } },
        },
      },
      plugins: [{
        id: 'alertaLabels',
        afterDatasetsDraw: function(chart) {
          var ctx = chart.ctx
          var meta = chart.getDatasetMeta(0)
          ctx.save()
          ctx.textAlign = 'left'
          ctx.font = 'bold 10px Arial, sans-serif'
          ctx.fillStyle = DARK_TEXT
          meta.data.forEach(function(bar, j) {
            var v = Number(chart.data.datasets[0].data[j])
            if (!v) return
            ctx.fillText(String(v), bar.x + 5, bar.y + 3)
          })
          ctx.restore()
        },
      }],
    })
  }

  charts.forEach(function(entry) {
    var el = document.getElementById(entry.canvasId)
    if (!el) return
    if (entry.kind === 'cabecas') drawCabecas(el, entry)
    else if (entry.kind === 'escore') drawEscore(el, entry)
    else if (entry.kind === 'alertas') drawAlertas(el, entry)
  })
  window.__chartsReady = true
})();
`

function tableHeadHtml(cols) {
  const colgroup = `<colgroup>${cols.map(([, w]) => `<col style="width:${w}">`).join('')}</colgroup>`
  const header = `<thead><tr>${cols.map(([t]) => `<th>${t}</th>`).join('')}</tr></thead>`
  return colgroup + header
}

function resumoLocalTableHtml(titulo, itens) {
  const cols = [
    [titulo === 'lote' ? 'Lote' : 'Pasto', '26%'],
    ['Rodeios', '12%'],
    ['Última contagem', '17%'],
    ['Média cabeças', '15%'],
    ['Escore médio', '15%'],
    ['Alertas', '15%'],
  ]
  const rows = itens
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.nome)}</td><td class="numeric">${intFmt(r.rodeios)}</td><td class="numeric">${r.cabecas_ultima != null ? intFmt(r.cabecas_ultima) : '—'}${r.data_ultima ? ` <span style="color:#8a9890">(${dateFmt(r.data_ultima)})</span>` : ''}</td><td class="numeric">${r.cabecas_media != null ? numFmt(r.cabecas_media, 0) : '—'}</td><td class="numeric">${r.escore_medio != null ? numFmt(r.escore_medio, 1) : '—'}</td><td class="numeric">${intFmt(r.alertas)}</td></tr>`,
    )
    .join('')
  return `<div class="table-block"><h3 class="table-title">Resumo por ${titulo}<span>${itens.length} ${titulo === 'lote' ? 'lote(s)' : 'pasto(s)'}</span></h3><table class="rodeio-resumo-table">${tableHeadHtml(cols)}<tbody>${rows}</tbody></table></div>`
}

function alertasCellHtml(registro) {
  const alertas = rodeioAlertas(registro.diagnosticos)
  if (!alertas.length) return '<td>—</td>'
  const html = alertas
    .map((a) => {
      const obs = a.observacao ? `<span class="rodeio-alerta-obs">${escapeHtml(a.observacao)}</span>` : ''
      return `<span class="rodeio-alerta">${escapeHtml(a.label)}</span>${obs}`
    })
    .join('')
  return `<td>${html}</td>`
}

function detailTableHtml(registros, total) {
  const cols = [
    ['Data', '7%'],
    ['Usuário', '9%'],
    ['Pasto', '7%'],
    ['Lote', '8%'],
    ['Vac', '4%'],
    ['Tou', '4%'],
    ['Bez', '4%'],
    ['Boi', '4%'],
    ['Gar', '4%'],
    ['Nov', '4%'],
    ['Total', '5%'],
    ['Esc. gado', '6%'],
    ['Esc. fezes', '6%'],
    ['Equipe', '6%'],
    ['Alertas', '22%'],
  ]
  const num = (v) => (v != null ? intFmt(v) : '—')
  const rows = registros
    .map((r) => {
      const equipeNomes = Array.isArray(r.equipe_nomes) && r.equipe_nomes.length ? r.equipe_nomes.join(', ') : null
      const equipe = equipeNomes || (r.equipe != null ? intFmt(r.equipe) : '—')
      return `<tr><td>${dateFmt(r.data)}</td><td>${escapeHtml(r.nome_usuario || '—')}</td><td>${escapeHtml(r.pasto || '—')}</td><td>${escapeHtml(r.lote || '—')}</td><td class="numeric">${num(r.vaca)}</td><td class="numeric">${num(r.touro)}</td><td class="numeric">${num(r.bezerro)}</td><td class="numeric">${num(r.boi)}</td><td class="numeric">${num(r.garrote)}</td><td class="numeric">${num(r.novilha)}</td><td class="numeric"><strong>${num(r.total_cabecas)}</strong></td><td class="numeric">${r.escore_gado != null ? numFmt(r.escore_gado, 1) : '—'}</td><td class="numeric">${r.escore_fezes != null ? intFmt(r.escore_fezes) : '—'}</td><td>${escapeHtml(equipe)}</td>${alertasCellHtml(r)}</tr>`
    })
    .join('')
  return `<div class="table-block"><h3 class="table-title">Registros detalhados<span>${total} registro(s)</span></h3><table class="rodeio-detail-table">${tableHeadHtml(cols)}<tbody>${rows}</tbody></table></div>`
}

function chunkArray(arr, size) {
  if (arr.length <= size) return [arr]
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

export async function renderRodeioHtml(input) {
  const { dataInicio, dataFim, fazendaNome, logoGestao, logoFazenda, resumo, registros } = input
  const brand = { logoGestao, logoFazenda, fazendaNome }
  const period = { dataInicio, dataFim }

  const serie = resumo.serie_diaria ?? []
  const frequencia = resumo.frequencia_alertas ?? []
  const porLote = resumo.por_lote ?? []
  const porPasto = resumo.por_pasto ?? []
  const temEscore = serie.some((p) => p.escore_medio != null || p.escore_fezes_medio != null)
  const categoriasComDados = CATEGORIAS.filter((cat) => serie.some((p) => (Number(p[cat.key]) || 0) > 0))

  const detailChunks = chunkArray(registros, DETAIL_ROWS_PER_PAGE)
  const totalPages = 2 + (registros.length > 0 ? detailChunks.length : 0)

  const chartsData = []
  const pagesHtml = []
  let pageIndex = 0

  // Página 1: resumo (KPIs + insights + gráficos cabeças/escore)
  pageIndex += 1
  const canvasCabecas = 'chart-rodeio-cabecas'
  const canvasEscore = 'chart-rodeio-escore'
  if (serie.length && categoriasComDados.length) {
    chartsData.push({ canvasId: canvasCabecas, kind: 'cabecas', serie, categorias: categoriasComDados })
  }
  if (temEscore) {
    chartsData.push({ canvasId: canvasEscore, kind: 'escore', serie })
  }
  pagesHtml.push(
    pageSection(`
      ${renderHeader({ ...brand, reportTitle: 'Relatório de Rodeio', section: 'Resumo executivo', sectionLabel: 'Visão geral' })}
      <p class="section-kicker">Resumo do período</p>
      <div class="period-badge">${dateFmt(dataInicio)} <span style="padding:0 7px;color:#9bb1a4">até</span> ${dateFmt(dataFim)}</div>
      ${resumo.insights ? `<div class="insight-box"><span class="insight-label">Resumo</span>${escapeHtml(resumo.insights)}</div>` : ''}
      <div class="kpi-grid">
        ${kpi(intFmt(resumo.total_rodeios), 'Rodeios realizados', 'No período selecionado')}
        ${kpi(intFmt(resumo.cabecas_contadas), 'Cabeças contadas', 'Acumulado dos registros')}
        ${kpi(resumo.media_cabecas != null ? numFmt(resumo.media_cabecas, 0) : '—', 'Média por rodeio', 'cabeças/registro')}
        ${kpi(resumo.escore_gado_medio != null ? numFmt(resumo.escore_gado_medio, 1) : '—', 'Escore médio do gado', 'escala de 1 a 5')}
      </div>
      <div class="kpi-grid">
        ${kpi(resumo.escore_fezes_medio != null ? numFmt(resumo.escore_fezes_medio, 1) : '—', 'Escore de fezes médio', 'escala de 1 a 5')}
        ${kpi(intFmt(resumo.alertas_sanitarios), 'Alertas sanitários', 'mortes, doentes, parasitas, entrevero', 'red')}
        ${kpi(intFmt(resumo.pendencias_infra), 'Pendências de infra', 'bebedouros, pastagem, cercas', 'gold')}
        ${kpi(intFmt(resumo.rodeios_com_alerta), 'Rodeios com alerta', 'registros fora do padrão', 'red')}
      </div>
      <div class="rodeio-charts">
        ${chartCard({ canvasId: canvasCabecas, title: 'Cabeças contadas por dia', subtitle: 'Composição por categoria', hasData: serie.length > 0 && categoriasComDados.length > 0 })}
        ${chartCard({ canvasId: canvasEscore, title: 'Escore médio por dia', subtitle: 'Condição corporal e escore de fezes', hasData: temEscore })}
      </div>
      ${renderFooter({ ...period, page: pageIndex, totalPages })}
    `),
  )

  // Página 2: alertas por diagnóstico + resumos por lote e pasto
  pageIndex += 1
  const canvasAlertas = 'chart-rodeio-alertas'
  if (frequencia.length) {
    chartsData.push({ canvasId: canvasAlertas, kind: 'alertas', itens: frequencia })
  }
  pagesHtml.push(
    pageSection(`
      ${renderHeader({ ...brand, reportTitle: 'Relatório de Rodeio', section: 'Diagnósticos e locais', sectionLabel: 'Análise' })}
      <p class="section-kicker">Alertas e distribuição por local</p>
      <div class="rodeio-page2-chart">
        ${chartCard({ canvasId: canvasAlertas, title: 'Alertas por diagnóstico', subtitle: 'Quantas vezes cada item saiu do padrão esperado', hasData: frequencia.length > 0 })}
      </div>
      <div class="rodeio-resumo-grid">
        <div>${porLote.length ? resumoLocalTableHtml('lote', porLote) : ''}</div>
        <div>${porPasto.length ? resumoLocalTableHtml('pasto', porPasto) : ''}</div>
      </div>
      ${renderFooter({ ...period, page: pageIndex, totalPages })}
    `),
  )

  // Páginas 3+: detalhamento dos registros
  detailChunks.forEach((chunk, i) => {
    pageIndex += 1
    pagesHtml.push(
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: 'Relatório de Rodeio', section: `Detalhamento${detailChunks.length > 1 ? ` (${i + 1}/${detailChunks.length})` : ''}`, sectionLabel: 'Registros' })}
        <p class="section-kicker">Registros de rodeio</p>
        <div class="rodeio-content">${detailTableHtml(chunk, registros.length)}</div>
        ${renderFooter({ ...period, page: pageIndex, totalPages })}
      `),
    )
  })

  const chartJsScript = await getChartJsScript()
  return htmlDocument({
    title: 'Relatório de Rodeio',
    extraCss: RODEIO_CSS,
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
  if (!isPDFData(body) || (body.registros?.length ?? 0) > MAX_REGISTROS) {
    return res.status(400).json({ error: 'Payload de relatório inválido ou grande demais' })
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Payload do relatório excede o limite permitido' })
  }

  try {
    console.log('[PDF Rodeio] Iniciando renderização. Registros:', body.registros.length)
    const html = await renderRodeioHtml(body)
    console.log('[PDF Rodeio] HTML montado. Bytes:', Buffer.byteLength(html, 'utf8'))
    const pdf = await generatePdf({
      html,
      format: 'A4',
      landscape: true,
      beforePdf: async (page) => {
        await page.waitForFunction('window.__chartsReady === true', { timeout: 15000 }).catch(() => {})
      },
    })
    console.log('[PDF Rodeio] PDF gerado. Bytes:', pdf.length)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-rodeio.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PDF-Renderer', 'puppeteer')
    return res.status(200).send(pdf)
  } catch (error) {
    console.error('[PDF Rodeio] Erro ao gerar relatório:', error)
    console.error('[PDF Rodeio] Stack:', error?.stack || 'sem stack')
    return res.status(500).json({ error: 'Não foi possível gerar o PDF', detail: String(error) })
  }
}
