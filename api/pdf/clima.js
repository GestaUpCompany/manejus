// Endpoint fino do relatório de Clima. Mesmo padrão do consumo.js e
// abastecimento.js: só existe aqui o que é específico deste relatório
// (página de resumo com KPIs + gráfico composto chuva/temperatura, e
// páginas de detalhamento com tabela por pluviômetro + leituras). Toda a
// infraestrutura (Chrome, Chart.js, template base, formatadores) vem do
// _shared/.
//
// Estrutura (ver docs/ArquiteturaRelatoriosPDF.md):
//  - Página 1: KPIs + gráfico composto (barras agrupadas de mm por
//    pluviômetro + linha de temperatura média, 2 eixos Y).
//  - Página 2+: tabela "Resumo por pluviômetro" + "Leituras detalhadas"
//    pre-chunked; a primeira página de detalhe acomoda menos linhas
//    porque divide o espaço com a tabela de resumo.

import { escapeHtml, dateFmt, numFmt, intFmt } from './_shared/formatters.js'
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

// Orçamento vertical das páginas de detalhe (A4 landscape, ~140mm úteis
// após padding + header). Mesmo critério do abastecimento.js: título de
// tabela ~8mm, thead ~8mm, cada <tr> ~9mm (linhas com observação podem
// quebrar em 2 linhas, então a estimativa é conservadora).
const CONTENT_H = 140
const TABLE_TITLE_H = 8
const TABLE_HEAD_H = 8
const TABLE_GAP_H = 6
const ROW_H = 9
const ROWS_PER_PAGE = 15

function isPDFData(value) {
  if (!value || typeof value !== 'object') return false
  if (typeof value.dataInicio !== 'string') return false
  if (typeof value.dataFim !== 'string') return false
  if (typeof value.fazendaNome !== 'string') return false
  if (!value.kpis || typeof value.kpis !== 'object') return false
  if (!Array.isArray(value.pluviometros)) return false
  if (!Array.isArray(value.serie)) return false
  if (!Array.isArray(value.resumo)) return false
  if (!Array.isArray(value.registros)) return false
  return true
}

// CSS específico do clima: área do gráfico na página de resumo e estilo das
// duas tabelas de detalhamento (larguras de coluna ficam no colgroup gerado
// por tabela, porque as colunas de temperatura/umidade são opcionais).
// Prefixo .clima-* nas tabelas para não colidir com CSS de outros relatórios.
const CLIMA_CSS = `
.page{display:flex;flex-direction:column}
.clima-content{flex:1;display:flex;flex-direction:column;min-height:0}
.clima-chart{flex:1;min-height:0}
.clima-chart .chart-card{height:100%}

.clima-resumo-table td, .clima-leituras-table td{font-size:12px;padding:6px 5px;line-height:1.25}
.clima-resumo-table th, .clima-leituras-table th{font-size:11px;padding:6px 5px}
.clima-resumo-table th, .clima-resumo-table td,
.clima-leituras-table th, .clima-leituras-table td{border-right:1px solid #d8e0db}
.clima-resumo-table th:last-child, .clima-resumo-table td:last-child,
.clima-leituras-table th:last-child, .clima-leituras-table td:last-child{border-right:none}
.clima-resumo-table tbody tr:nth-child(even), .clima-leituras-table tbody tr:nth-child(even){background:#f7faf8}
`

// Script rodado dentro do Chromium headless para desenhar o gráfico
// composto: um dataset de barras por pluviômetro (eixo Y esquerdo, mm)
// + uma linha de temperatura média (eixo Y direito, °C).
const CHARTS_INIT_JS = `
(function(){
  var PALETTE = ['#1E3A5F', '#0F6437', '#10B981', '#c28a27', '#6B7280', '#34b87c', '#5ccf94', '#a2e9bc']
  var TEMP_COLOR = '#EF4444'
  var DARK_TEXT = '#1F2937'
  var MEDIUM_TEXT = '#6B7280'
  var Chart = window.Chart
  if (!Chart) { window.__chartsReady = true; return }
  Chart.defaults.animation = false
  Chart.defaults.font.family = 'Arial, Helvetica, sans-serif'

  var charts = (window.__reportData && window.__reportData.charts) || []
  var remaining = charts.length

  function drawChart(entry) {
    var el = document.getElementById(entry.canvasId)
    if (!el) { maybeDone(); return }
    var serie = entry.serie || []
    var pluviometros = entry.pluviometros || []
    if (!serie.length || !pluviometros.length) { maybeDone(); return }

    var maxMm = 1
    serie.forEach(function(p) {
      pluviometros.forEach(function(nome) {
        var v = Number(p[nome]) || 0
        if (v > maxMm) maxMm = v
      })
    })
    var temps = serie.map(function(p){ return p.temp_media }).filter(function(t){ return t != null })
    var maxTemp = temps.length ? Math.max.apply(null, temps) : 30

    var datasets = pluviometros.map(function(nome, i) {
      return {
        type: 'bar',
        label: nome,
        data: serie.map(function(p){ return Number(p[nome]) || 0 }),
        backgroundColor: PALETTE[i % PALETTE.length],
        borderRadius: 3,
        borderSkipped: false,
        yAxisID: 'y',
        order: 2,
        barPercentage: 0.7,
        categoryPercentage: 0.7,
      }
    })
    if (entry.hasTemp) {
      datasets.push({
        type: 'line',
        label: 'Temp. média (°C)',
        data: serie.map(function(p){ return p.temp_media != null ? Number(p.temp_media) : null }),
        borderColor: TEMP_COLOR,
        backgroundColor: TEMP_COLOR,
        borderWidth: 3,
        pointRadius: 5,
        pointBackgroundColor: TEMP_COLOR,
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 2,
        yAxisID: 'y1',
        order: 0,
        tension: 0.3,
        spanGaps: true,
      })
    }

    new Chart(el, {
      type: 'bar',
      data: { labels: serie.map(function(p){ return p.data_label }), datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 30, right: 20, bottom: 10, left: 10 } },
        plugins: {
          legend: {
            position: 'top',
            align: 'center',
            labels: { usePointStyle: true, pointStyle: 'circle', padding: 14, color: DARK_TEXT, font: { size: 12, weight: 'bold' } },
          },
          tooltip: { enabled: false },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: MEDIUM_TEXT, font: { size: 11 } },
            title: { display: true, text: 'Dias', color: MEDIUM_TEXT, font: { size: 12, weight: 'bold' }, padding: { top: 8 } },
          },
          y: {
            position: 'left',
            beginAtZero: true,
            suggestedMax: maxMm * 1.2,
            title: { display: true, text: 'Chuva (mm)', color: DARK_TEXT, font: { size: 12, weight: 'bold' } },
            ticks: { color: MEDIUM_TEXT, font: { size: 11 } },
            grid: { color: '#E5E7EB' },
          },
          y1: {
            display: entry.hasTemp === true,
            position: 'right',
            beginAtZero: true,
            suggestedMax: maxTemp * 1.3,
            title: { display: true, text: '°C', color: TEMP_COLOR, font: { size: 12, weight: 'bold' } },
            ticks: { color: TEMP_COLOR, font: { size: 11 } },
            grid: { display: false },
          },
        },
      },
      plugins: [{
        id: 'mmLabels',
        afterDatasetsDraw: function(chart) {
          var ctx = chart.ctx
          ctx.save()
          ctx.textAlign = 'center'
          ctx.font = 'bold 10px Arial, sans-serif'
          ctx.fillStyle = DARK_TEXT
          pluviometros.forEach(function(nome, di) {
            var meta = chart.getDatasetMeta(di)
            var ds = chart.data.datasets[di]
            meta.data.forEach(function(bar, j) {
              var v = Number(ds.data[j])
              if (!v) return
              ctx.fillText(v.toFixed(1), bar.x, bar.y - 4)
            })
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

function kpisHtml(kpis, hasTemp, hasUmidade) {
  const temp = (v) => (v != null ? `${numFmt(v, 1)}°C` : '—')
  const cards = [
    { value: `${numFmt(kpis.mm_total, 1)} mm`, label: 'Chuva acumulada' },
    { value: intFmt(kpis.n_leituras), label: 'Leituras' },
    { value: intFmt(kpis.dias_com_chuva), label: 'Dias com chuva' },
  ]
  if (hasTemp) {
    cards.push(
      { value: temp(kpis.temp_media), label: 'Temp. média' },
      { value: temp(kpis.temp_min), label: 'Temp. mínima' },
      { value: temp(kpis.temp_max), label: 'Temp. máxima' },
    )
  }
  if (hasUmidade) {
    cards.push({ value: kpis.umidade_media != null ? `${numFmt(kpis.umidade_media, 0)}%` : '—', label: 'Umidade média' })
  }
  return `<div class="kpi-grid">${cards.map((c) => kpi(c.value, c.label)).join('')}</div>`
}

// Monta colgroup + thead a partir de um array [título, largura], para que
// colunas opcionais (temperatura, umidade) possam ser omitidas sem depender
// de nth-child fixos no CSS.
function tableHeadHtml(cols) {
  const colgroup = `<colgroup>${cols.map(([, w]) => `<col style="width:${w}">`).join('')}</colgroup>`
  const header = `<thead><tr>${cols.map(([t]) => `<th>${t}</th>`).join('')}</tr></thead>`
  return colgroup + header
}

function resumoTableHtml(resumo, hasTemp) {
  const cols = [
    ['Pluviômetro', '16%'],
    ['Localização', '20%'],
    ['Leituras', '8%'],
    ['Total (mm)', '12%'],
    ['Média/leitura', '13%'],
    ['Maior leitura', '13%'],
  ]
  if (hasTemp) cols.push(['Temp. mín', '9%'], ['Temp. máx', '9%'])
  const rows = resumo
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.pluviometro_nome || '—')}</td><td>${escapeHtml(r.pluviometro_localizacao || '—')}</td><td class="numeric">${intFmt(r.n_medicoes)}</td><td class="numeric">${numFmt(r.mm_total, 1)} mm</td><td class="numeric">${r.mm_medio != null ? `${numFmt(r.mm_medio, 1)} mm` : '—'}</td><td class="numeric">${r.maior_leitura != null ? `${numFmt(r.maior_leitura, 1)} mm` : '—'}</td>${hasTemp ? `<td class="numeric">${r.temp_min != null ? `${numFmt(r.temp_min, 1)}°C` : '—'}</td><td class="numeric">${r.temp_max != null ? `${numFmt(r.temp_max, 1)}°C` : '—'}</td>` : ''}</tr>`,
    )
    .join('')
  return `<h3 class="table-title">Resumo por pluviômetro<span>${resumo.length} pluviômetro(s)</span></h3><div class="table-block"><table class="clima-resumo-table">${tableHeadHtml(cols)}<tbody>${rows}</tbody></table></div>`
}

function leiturasTableHtml(registros, total, hasTemp, hasUmidade) {
  const cols = [
    ['Data', '9%'],
    ['Horário', '7%'],
    ['Pluviômetro', '13%'],
    ['Chuva (mm)', '9%'],
  ]
  if (hasTemp) cols.push(['Temp. (°C)', '9%'])
  if (hasUmidade) cols.push(['Umidade', '9%'])
  cols.push(['Responsável', '16%'], ['Observação', '28%'])
  const rows = registros
    .map(
      (r) =>
        `<tr><td>${dateFmt(r.data)}</td><td>${escapeHtml(r.horario || '—')}</td><td>${escapeHtml(r.pluviometro_nome || '—')}</td><td class="numeric">${r.medicao_mm != null ? numFmt(r.medicao_mm, 1) : '—'}</td>${hasTemp ? `<td class="numeric">${r.temperatura != null ? numFmt(r.temperatura, 1) : '—'}</td>` : ''}${hasUmidade ? `<td class="numeric">${r.umidade_relativa != null ? `${numFmt(r.umidade_relativa, 0)}%` : '—'}</td>` : ''}<td>${escapeHtml(r.responsavel || r.nome_usuario || '—')}</td><td>${escapeHtml(r.observacao || '—')}</td></tr>`,
    )
    .join('')
  return `<h3 class="table-title">Leituras detalhadas<span>${total} leitura(s)</span></h3><div class="table-block"><table class="clima-leituras-table">${tableHeadHtml(cols)}<tbody>${rows}</tbody></table></div>`
}

function chunkArray(arr, size) {
  if (arr.length <= size) return [arr]
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

export async function renderClimaHtml(input) {
  const { dataInicio, dataFim, fazendaNome, logoGestao, logoFazenda, kpis, pluviometros, serie, resumo, registros } = input
  const brand = { logoGestao, logoFazenda, fazendaNome }
  const period = { dataInicio, dataFim }

  // O payload traz todos os pluviômetros disponíveis da fazenda; o gráfico e
  // a legenda só devem listar os que têm leitura no período filtrado.
  const nomesComDados = new Set(registros.map((r) => r.pluviometro_nome || '—'))
  const pluviometrosComDados = pluviometros.filter((n) => nomesComDados.has(n))

  // Quando a fazenda não registra temperatura/umidade no período, os cards,
  // a linha do gráfico e as colunas correspondentes são omitidos por completo.
  const hasTemp =
    registros.some((r) => r.temperatura != null || r.temperatura_media != null) ||
    serie.some((p) => p.temp_media != null)
  const hasUmidade = registros.some((r) => r.umidade_relativa != null)

  // Pré-calcula a paginação do detalhamento para saber o total de páginas
  // antes de montar (footer mostra "Página X de Y").
  const resumoH = resumo.length > 0 ? TABLE_TITLE_H + TABLE_HEAD_H + resumo.length * ROW_H + TABLE_GAP_H : 0
  const leiturasHeadH = registros.length > 0 ? TABLE_TITLE_H + TABLE_HEAD_H : 0
  const firstDetailCount =
    registros.length > 0 ? Math.max(0, Math.floor((CONTENT_H - resumoH - leiturasHeadH) / ROW_H)) : 0
  const firstChunk = registros.slice(0, firstDetailCount)
  const restChunks = chunkArray(registros.slice(firstDetailCount), ROWS_PER_PAGE)
  const temDetalhe = resumo.length > 0 || registros.length > 0
  const totalPages = 1 + (temDetalhe ? 1 + restChunks.length : 0)

  const chartsData = []
  const pagesHtml = []
  let pageIndex = 0

  // Página 1: resumo (KPIs + gráfico composto)
  pageIndex += 1
  const canvasId = 'chart-clima-1'
  if (serie.length > 0 && pluviometrosComDados.length > 0) {
    chartsData.push({ canvasId, serie, pluviometros: pluviometrosComDados, hasTemp })
  }
  pagesHtml.push(
    pageSection(`
      ${renderHeader({ ...brand, reportTitle: 'Relatório de Clima', section: 'Resumo', sectionLabel: 'Seção' })}
      <p class="section-kicker">Resumo do período</p>
      <div class="clima-content">
        <div class="period-badge">${dateFmt(dataInicio)} <span style="padding:0 7px;color:#9bb1a4">até</span> ${dateFmt(dataFim)}</div>
        ${kpisHtml(kpis, hasTemp, hasUmidade)}
        <div class="clima-chart">${chartCard({ canvasId, title: hasTemp ? 'Chuva diária (mm) e temperatura média (°C)' : 'Chuva diária (mm)', subtitle: `${registros.length} leitura(s) · ${pluviometrosComDados.length} pluviômetro(s)`, hasData: serie.length > 0 && pluviometrosComDados.length > 0 })}</div>
      </div>
      ${renderFooter({ ...period, page: pageIndex, totalPages })}
    `),
  )

  // Página 2: resumo por pluviômetro + primeiro bloco de leituras
  if (temDetalhe) {
    pageIndex += 1
    pagesHtml.push(
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: 'Relatório de Clima', section: 'Detalhamento', sectionLabel: 'Seção' })}
        <p class="section-kicker">Detalhamento</p>
        <div class="clima-content">
          ${resumo.length > 0 ? resumoTableHtml(resumo, hasTemp) : ''}
          ${firstChunk.length > 0 ? leiturasTableHtml(firstChunk, registros.length, hasTemp, hasUmidade) : ''}
        </div>
        ${renderFooter({ ...period, page: pageIndex, totalPages })}
      `),
    )

    // Páginas 3+: continuação das leituras detalhadas
    restChunks.forEach((chunk) => {
      pageIndex += 1
      pagesHtml.push(
        pageSection(`
          ${renderHeader({ ...brand, reportTitle: 'Relatório de Clima', section: 'Detalhamento (continuação)', sectionLabel: 'Seção' })}
          <p class="section-kicker">Leituras detalhadas (continuação)</p>
          <div class="clima-content">${leiturasTableHtml(chunk, registros.length, hasTemp, hasUmidade)}</div>
          ${renderFooter({ ...period, page: pageIndex, totalPages })}
        `),
      )
    })
  }

  const chartJsScript = await getChartJsScript()
  return htmlDocument({
    title: 'Relatório de Clima',
    extraCss: CLIMA_CSS,
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
    console.log('[PDF Clima] Iniciando renderização. Leituras:', body.registros.length, 'Dias:', body.serie.length)
    const html = await renderClimaHtml(body)
    console.log('[PDF Clima] HTML montado. Bytes:', Buffer.byteLength(html, 'utf8'))
    const pdf = await generatePdf({
      html,
      format: 'A4',
      landscape: true,
      beforePdf: async (page) => {
        await page.waitForFunction('window.__chartsReady === true', { timeout: 15000 }).catch(() => {})
      },
    })
    console.log('[PDF Clima] PDF gerado. Bytes:', pdf.length)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-clima.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PDF-Renderer', 'puppeteer')
    return res.status(200).send(pdf)
  } catch (error) {
    console.error('[PDF Clima] Erro ao gerar relatório:', error)
    console.error('[PDF Clima] Stack:', error?.stack || 'sem stack')
    return res.status(500).json({ error: 'Não foi possível gerar o PDF', detail: String(error) })
  }
}
