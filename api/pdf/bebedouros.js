// Endpoint fino do relatório de Bebedouros. Mesmo padrão do morte.js,
// consumo.js e abastecimento.js: só existe aqui o que é específico deste
// relatório (KPIs com barra lateral de status, ramificação dia-único vs
// período, gráfico de período paginado por espaço, tabela de ocorrências
// paginada). Toda a infraestrutura (Chrome, Chart.js, template base,
// formatadores) vem do _shared/.
//
// Diferenças estruturais em relação aos três relatórios já migrados (ver
// docs/ArquiteturaRelatoriosPDF.md):
//  - Dois modos mutuamente exclusivos na Seção 1: "dia único" (KPIs de
//    limpezas do dia + gráfico de intervalo) e "período" (KPIs de status +
//    alerta de maior atraso + gráfico de dias desde última limpeza com
//    paginação dinâmica por espaço vertical).
//  - KPIs com barra lateral colorida por status (verde/ambar/vermelho/cinza),
//    não o bloco verde preenchido do kpi() do template. Componente local
//    kpiStatus() preserva a codificação semântica de cor.
//  - Gráficos de barra horizontal com linha tracejada de meta INDIVIDUAL por
//    bebedouro (plugin metaLinha sobre a barra).
//  - Tabela de ocorrências com texto livre (obsItens/obsGeral), paginada em
//    15 linhas por página (mesmo padrão do abastecimento, sem cap de 60).

import { escapeHtml, dateFmt } from './_shared/formatters.js'
import { getChartJsScript } from './_shared/chartjs.js'
import { generatePdf } from './_shared/puppeteer.js'
import {
  renderHeader,
  page as pageSection,
  htmlDocument,
} from './_shared/template.js'

// === Limites do body ===
// O payload do bebedouros tem: statusPorBebedouro (~80 bytes/item) +
// limpezasDoDia (~80 bytes/item) + itensRanking (~60 bytes/item) +
// ocorrencias com texto livre (~560 bytes/item: data + bebedouro +
// itensNegativos + obsItens + obsGeral + responsavel). 5000 ocorrências =
// ~2.8MB, bem dentro de 8MB com folga para logos.
const MAX_BEBEDOUROS = 2000
const MAX_OCORRENCIAS = 5000
const MAX_BODY_BYTES = 8_000_000

// Linhas de ocorrências por página. Cada <tr> com 6 colunas de texto livre
// e font-size 11px ocupa ~30px de altura. 15 linhas cabem confortavelmente
// em A4 landscape com header/footer. Menos que os 18 do abastecimento
// porque as colunas de texto livre são mais altas.
const OCCURRENCES_PER_PAGE = 15

// === Dimensões para paginação dinâmica do gráfico de período ===
// A4 landscape = 297x210mm. Após padding (12+16mm), header (22+5mm) e footer
// (absolute, dentro do padding inferior), a área útil de conteúdo é ~155mm.
// Da primeira página, subtrai-se kicker+badge+título+KPIs+alerta; das
// continuações, só o kicker.
const TOTAL_CONTENT_H = 155
const KICKER_H = 6
const BADGE_H = 10
const TITLE_H = 6
const KPI_PERIOD_H = 18
const ALERT_H = 11
const BAR_H = 9
const CHART_PAD = 14
const SAFETY = 3

function isPDFData(value) {
  if (!value || typeof value !== 'object') return false
  if (typeof value.titulo !== 'string') return false
  if (typeof value.fazendaNome !== 'string') return false
  if (typeof value.dataInicio !== 'string') return false
  if (typeof value.dataFim !== 'string') return false
  if (typeof value.ehDiaUnico !== 'boolean') return false
  if (!value.checklistKPIs || typeof value.checklistKPIs !== 'object') return false
  if (!Array.isArray(value.itensRanking)) return false
  if (!Array.isArray(value.ocorrencias)) return false
  return true
}

// === CSS específico do bebedouros ===
// kpiStatus: card com barra lateral esquerda colorida por status (não o
// border-top do kpi() padrão). Preserva a codificação semântica de cor que
// existe no jsPDF original. Inclui também alert-box, info-pill,
// sem-registro-list, tabela de ocorrências e box de "nenhuma ocorrência".
const BEBEDOUROS_CSS = `
.page{display:flex;flex-direction:column}
.kpi-status-grid{display:grid;gap:7px;margin-bottom:3mm}
.kpi-status-grid.cols-5{grid-template-columns:repeat(5,1fr)}
.kpi-status-grid.cols-4{grid-template-columns:repeat(4,1fr)}
.kpi-status-grid.cols-3{grid-template-columns:repeat(3,1fr)}
.kpi-status-card{display:flex;align-items:stretch;border:1px solid #dce5df;border-radius:5px;background:#fff;overflow:hidden;min-height:15mm}
.kpi-status-bar{width:4px;flex-shrink:0}
.kpi-status-body{padding:5px 8px;display:flex;flex-direction:column;justify-content:center;flex:1;min-width:0}
.kpi-status-value{font-size:16px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi-status-label{font-size:11px;color:#6B7280;margin-top:2px}
.alert-box{display:flex;align-items:stretch;border-radius:5px;overflow:hidden;margin-bottom:3mm;border:1px solid #dce5df}
.alert-bar{width:4px;flex-shrink:0}
.alert-body{padding:5px 10px;font-size:12px;color:#1F2937;line-height:1.4}
.alert-box.tone-red{background:#FEF2F2}
.alert-box.tone-red .alert-bar{background:#FECACA}
.alert-box.tone-amber{background:#FFFBEB}
.alert-box.tone-amber .alert-bar{background:#FDE68A}
.info-pill{display:inline-block;background:#F3F4F6;border-radius:10px;padding:3px 10px;font-size:12px;color:#1F2937;margin-top:3mm}
.sem-registro-list{margin-top:3mm;font-size:12px;color:#1F2937;line-height:1.5}
.sem-registro-list strong{font-weight:700}
.ocorr-table th:nth-child(1){width:10%}
.ocorr-table th:nth-child(2){width:15%}
.ocorr-table th:nth-child(3){width:22%}
.ocorr-table th:nth-child(4){width:22%}
.ocorr-table th:nth-child(5){width:18%}
.ocorr-table th:nth-child(6){width:13%}
.ocorr-table th{background:#EF4444}
.ocorr-table th,.ocorr-table td{border-right:1px solid #d8e0db}
.ocorr-table th:last-child,.ocorr-table td:last-child{border-right:none}
.ocorr-table tbody tr:nth-child(even){background:#fef2f2}
.ocorr-table td{font-size:11px;padding:5px;line-height:1.3;vertical-align:top;overflow-wrap:anywhere}
.ocorr-table th{font-size:11px;padding:6px 5px;text-align:left}
.no-ocorr-box{background:#F0FDF4;border:1px solid #BBF7D0;border-radius:5px;padding:10px;text-align:center;color:#22C55E;font-size:13px;margin-top:4mm}
.beb-chart-legend{font-size:11px;color:#6B7280;margin-top:1mm}
`

// === Chart init JS (roda dentro do Chromium headless) ===
// Porta os 3 plugins do jsPDF: rótulo à direita da barra, linha tracejada
// de meta individual (limpeza/limpezaDia), e rótulo de % (problemas).
// Cada chart vem de window.__reportData.charts com kind + items.
const CHARTS_INIT_JS = `
(function(){
  var GREEN_DARK = '#0F6437'
  var MEDIUM_TEXT = '#6B7280'
  var Chart = window.Chart
  if (!Chart) { window.__chartsReady = true; return }
  Chart.defaults.animation = false
  Chart.defaults.font.family = 'Arial, Helvetica, sans-serif'

  var charts = (window.__reportData && window.__reportData.charts) || []
  var remaining = charts.length
  if (remaining === 0) { window.__chartsReady = true; return }

  function maybeDone() {
    remaining--
    if (remaining <= 0) window.__chartsReady = true
  }

  function drawLimpeza(canvasId, items) {
    var el = document.getElementById(canvasId)
    if (!el || !items || !items.length) { maybeDone(); return }
    var labels = items.map(function(d) { return d.label })
    var valores = items.map(function(d) { return d.valor })
    var cores = items.map(function(d) { return d.cor })
    var metas = items.map(function(d) { return d.meta })
    var maxVal = Math.max.apply(null, valores.concat(metas.map(function(m) { return m || 0 })).concat([1]))
    var limiteX = Math.ceil(maxVal * 1.15)
    var baseFont = items.length > 18 ? 8 : 10
    new Chart(el, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Dias desde última limpeza',
          data: valores,
          backgroundColor: cores,
          borderRadius: 4,
          borderSkipped: false,
          minBarLength: 20,
          barPercentage: 0.7,
          categoryPercentage: 0.8,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false, animation: false,
        layout: { padding: { right: 50 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            beginAtZero: true,
            max: limiteX,
            grid: { color: '#E5E7EB' },
            ticks: { color: MEDIUM_TEXT, font: { size: baseFont } },
          },
          y: {
            grid: { display: false },
            ticks: { color: '#374151', font: { size: baseFont }, autoSkip: false },
          },
        },
      },
      plugins: [{
        id: 'labels',
        afterDatasetsDraw: function(chart) {
          var ctx = chart.ctx
          var meta = chart.getDatasetMeta(0)
          ctx.save()
          ctx.font = baseFont + 'px Arial'
          ctx.fillStyle = MEDIUM_TEXT
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          meta.data.forEach(function(bar, i) {
            var label = valores[i] + 'd'
            ctx.fillText(label, bar.x + 4, bar.y)
          })
          ctx.restore()
        },
      }, {
        id: 'metaLinha',
        afterDatasetsDraw: function(chart) {
          var ctx = chart.ctx
          var xScale = chart.scales.x
          var meta = chart.getDatasetMeta(0)
          ctx.save()
          meta.data.forEach(function(bar, i) {
            var m = metas[i]
            if (!m || m <= 0) return
            if (valores[i] <= 0) return
            var metaX = xScale.getPixelForValue(m)
            var yTop = bar.y - bar.height / 2 - 3
            var yBot = bar.y + bar.height / 2 + 3
            ctx.strokeStyle = GREEN_DARK
            ctx.lineWidth = 1.5
            ctx.setLineDash([4, 3])
            ctx.beginPath()
            ctx.moveTo(metaX, yTop)
            ctx.lineTo(metaX, yBot)
            ctx.stroke()
          })
          ctx.setLineDash([])
          ctx.restore()
        },
      }],
    })
    maybeDone()
  }

  function drawLimpezaDia(canvasId, items) {
    var el = document.getElementById(canvasId)
    if (!el || !items || !items.length) { maybeDone(); return }
    var labels = items.map(function(d) { return d.label })
    var valores = items.map(function(d) { return d.valor })
    var cores = items.map(function(d) { return d.cor })
    var metas = items.map(function(d) { return d.meta })
    var primeiras = items.map(function(d) { return d.primeira })
    var maxVal = Math.max.apply(null, valores.concat(metas.map(function(m) { return m || 0 })).concat([1]))
    var limiteX = Math.ceil(maxVal * 1.15)
    new Chart(el, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Intervalo desde limpeza anterior (dias)',
          data: valores,
          backgroundColor: cores,
          borderRadius: 4,
          borderSkipped: false,
          barPercentage: 0.7,
          categoryPercentage: 0.8,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false, animation: false,
        layout: { padding: { right: 50 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            beginAtZero: true,
            max: limiteX,
            grid: { color: '#E5E7EB' },
            ticks: { color: MEDIUM_TEXT, font: { size: 10 } },
          },
          y: {
            grid: { display: false },
            ticks: { color: '#374151', font: { size: 10 } },
          },
        },
      },
      plugins: [{
        id: 'labelsDia',
        afterDatasetsDraw: function(chart) {
          var ctx = chart.ctx
          var meta = chart.getDatasetMeta(0)
          ctx.save()
          ctx.font = '10px Arial'
          ctx.fillStyle = MEDIUM_TEXT
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          meta.data.forEach(function(bar, i) {
            var label = primeiras[i] ? '1ª' : valores[i] + 'd'
            ctx.fillText(label, bar.x + 4, bar.y)
          })
          ctx.restore()
        },
      }, {
        id: 'metaLinhaDia',
        afterDatasetsDraw: function(chart) {
          var ctx = chart.ctx
          var xScale = chart.scales.x
          var meta = chart.getDatasetMeta(0)
          ctx.save()
          meta.data.forEach(function(bar, i) {
            var m = metas[i]
            if (!m || m <= 0) return
            if (valores[i] <= 0) return
            var metaX = xScale.getPixelForValue(m)
            var yTop = bar.y - bar.height / 2 - 3
            var yBot = bar.y + bar.height / 2 + 3
            ctx.strokeStyle = GREEN_DARK
            ctx.lineWidth = 1.5
            ctx.setLineDash([4, 3])
            ctx.beginPath()
            ctx.moveTo(metaX, yTop)
            ctx.lineTo(metaX, yBot)
            ctx.stroke()
          })
          ctx.setLineDash([])
          ctx.restore()
        },
      }],
    })
    maybeDone()
  }

  function drawProblemas(canvasId, items) {
    var el = document.getElementById(canvasId)
    if (!el || !items || !items.length) { maybeDone(); return }
    var labels = items.map(function(d) { return d.label })
    var valores = items.map(function(d) { return d.valor })
    new Chart(el, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '% negativo',
          data: valores,
          backgroundColor: '#EF4444',
          borderRadius: 4,
          borderSkipped: false,
          barPercentage: 0.7,
          categoryPercentage: 0.8,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false, animation: false,
        layout: { padding: { right: 50 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            beginAtZero: true,
            max: 100,
            grid: { color: '#E5E7EB' },
            ticks: { color: MEDIUM_TEXT, font: { size: 10 }, callback: function(v) { return v + '%' } },
          },
          y: {
            grid: { display: false },
            ticks: { color: '#374151', font: { size: 10 } },
          },
        },
      },
      plugins: [{
        id: 'labelsProblemas',
        afterDatasetsDraw: function(chart) {
          var ctx = chart.ctx
          var meta = chart.getDatasetMeta(0)
          ctx.save()
          ctx.font = '10px Arial'
          ctx.fillStyle = MEDIUM_TEXT
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          meta.data.forEach(function(bar, i) {
            ctx.fillText(valores[i] + '%', bar.x + 4, bar.y)
          })
          ctx.restore()
        },
      }],
    })
    maybeDone()
  }

  charts.forEach(function(entry) {
    if (entry.kind === 'limpeza') drawLimpeza(entry.canvasId, entry.items)
    else if (entry.kind === 'limpezaDia') drawLimpezaDia(entry.canvasId, entry.items)
    else if (entry.kind === 'problemas') drawProblemas(entry.canvasId, entry.items)
    else maybeDone()
  })
})();
`

// === Helpers HTML ===

function kpiStatus(value, label, cor) {
  return `<div class="kpi-status-card"><div class="kpi-status-bar" style="background:${cor}"></div><div class="kpi-status-body"><div class="kpi-status-value" style="color:${cor}">${escapeHtml(value)}</div><div class="kpi-status-label">${escapeHtml(label)}</div></div></div>`
}

function kpiStatusGrid(cards, cols) {
  return `<div class="kpi-status-grid cols-${cols}">${cards.join('')}</div>`
}

function alertBox(text, tone) {
  return `<div class="alert-box tone-${tone}"><div class="alert-bar"></div><div class="alert-body">${escapeHtml(text)}</div></div>`
}

function periodBadgeHtml(dados) {
  if (dados.ehDiaUnico && dados.diaUnico) {
    return `<div class="period-badge">Dia: ${dateFmt(dados.diaUnico)}</div>`
  }
  return `<div class="period-badge">${dateFmt(dados.dataInicio)} <span style="padding:0 7px;color:#9bb1a4">até</span> ${dateFmt(dados.dataFim)}</div>`
}

function footerHtml(dados, page, totalPages) {
  const periodo = dados.ehDiaUnico && dados.diaUnico
    ? `Dia: ${dateFmt(dados.diaUnico)}`
    : `${dateFmt(dados.dataInicio)} a ${dateFmt(dados.dataFim)}`
  return `<footer class="report-footer"><span>Gesta'Up · ${escapeHtml(periodo)}</span><span>Página ${page} de ${totalPages}</span></footer>`
}

function chartCardLocal({ canvasId, title, subtitle = '', hasData = true, height, emptyMsg = 'Sem dados no período' }) {
  const style = height ? ` style="height:${height}"` : ''
  const body = hasData
    ? `<div class="chart-body"><canvas id="${escapeHtml(canvasId)}"></canvas></div>`
    : `<div class="empty-chart">${escapeHtml(emptyMsg)}</div>`
  return `<div class="chart-card"${style}><div class="chart-heading"><strong>${escapeHtml(title)}</strong>${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ''}</div>${body}</div>`
}

function semRegistroListHtml(semRegistro) {
  const nomes = semRegistro.map((s) => escapeHtml(s.nome)).join(', ')
  return `<div class="sem-registro-list"><strong>Bebedouros sem registros:</strong> ${nomes}</div>`
}

function ocorrenciasTableHtml(chunk) {
  const header = `<thead><tr><th>Data</th><th>Bebedouro</th><th>Itens negativos</th><th>Obs. do item</th><th>Obs. geral</th><th>Responsável</th></tr></thead>`
  const rows = chunk
    .map((o) =>
      `<tr><td>${dateFmt(o.data)}</td><td>${escapeHtml(o.bebedouro)}</td><td>${escapeHtml(o.itensNegativos)}</td><td>${escapeHtml(o.obsItens || '—')}</td><td>${escapeHtml(o.obsGeral || '—')}</td><td>${escapeHtml(o.responsavel || '—')}</td></tr>`,
    )
    .join('')
  return `<table class="ocorr-table">${header}<tbody>${rows}</tbody></table>`
}

// === KPIs HTML ===

function kpisPeriodoHtml(kpis) {
  const cards = [
    kpiStatus(String(kpis.total), 'Cadastrados', '#1F2937'),
    kpiStatus(`${kpis.emDia} (${kpis.pctEmDia}%)`, 'Dentro da meta', '#22C55E'),
    kpiStatus(String(kpis.atrasado), 'Atrasados', '#F59E0B'),
    kpiStatus(String(kpis.critico), 'Atraso crítico', '#EF4444'),
    kpiStatus(String(kpis.semRegistro), 'Sem registro', '#6B7280'),
  ]
  return kpiStatusGrid(cards, 5)
}

function kpisDiaHtml(kpis) {
  const cards = [
    kpiStatus(String(kpis.limposNoDia), 'Limpos no dia', '#1F2937'),
    kpiStatus(String(kpis.dentroMeta), 'Dentro da meta', '#22C55E'),
    kpiStatus(String(kpis.acimaMeta), 'Acima da meta', '#F59E0B'),
    kpiStatus(String(kpis.muitoAcima), 'Muito acima', '#EF4444'),
  ]
  let html = kpiStatusGrid(cards, 4)
  if (kpis.intervaloMedio !== null && kpis.intervaloMedio !== undefined) {
    html += `<div class="info-pill">Intervalo médio: ${kpis.intervaloMedio}d</div>`
  }
  return html
}

function kpisChecklistHtml(kpis) {
  const cards = [
    kpiStatus(String(kpis.totalRegistros), 'Registros no período', '#1F2937'),
    kpiStatus(String(kpis.comChecklist), 'Registros com checklist', '#1F2937'),
    kpiStatus(`${kpis.negativos} (${kpis.pctNegativos}%)`, 'Registros com ponto de atenção', '#EF4444'),
  ]
  let html = kpiStatusGrid(cards, 3)
  if (kpis.itemMaisProblematico) {
    const ipm = kpis.itemMaisProblematico
    const txt = `Item mais problemático: ${ipm.label} com ${ipm.pctNegativo}% de respostas negativas (${ipm.negativos}/${ipm.total}).`
    html += alertBox(txt, 'amber')
  }
  return html
}

// === Pre-chunk dinâmico do gráfico de período ===

function preChunkStatus(items, maxFirst, maxCont) {
  if (items.length === 0) return []
  const chunks = []
  let i = 0
  let isFirst = true
  while (i < items.length) {
    const max = isFirst ? maxFirst : maxCont
    const size = Math.min(items.length - i, max)
    chunks.push(items.slice(i, i + size))
    i += size
    isFirst = false
  }
  return chunks
}

function chunkArray(arr, size) {
  if (arr.length <= size) return [arr]
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

// === Montagem das páginas ===

async function renderBebedourosHtml(input) {
  const { titulo, fazendaNome, logoGestao, logoFazenda } = input
  const brand = { logoGestao, logoFazenda, fazendaNome }
  const ehDiaUnico = input.ehDiaUnico
  const diaUnico = input.diaUnico
  const dados = { ...input, ehDiaUnico, diaUnico }

  // Normaliza arrays que podem ser undefined
  const statusPorBebedouro = input.statusPorBebedouro || []
  const limpezasDoDia = input.limpezasDoDia || []

  // Separa com/sem registro (modo período)
  const comRegistro = statusPorBebedouro
    .filter((s) => s.dias !== null)
    .slice()
    .sort((a, b) => b.dias - a.dias)
  const semRegistro = statusPorBebedouro
    .filter((s) => s.dias === null)
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome))

  // Calcula maxPerPage dinâmico para o gráfico de período
  const temAlerta = !ehDiaUnico && input.maisAtrasado
  const firstPageExtra = KICKER_H + BADGE_H + TITLE_H + KPI_PERIOD_H + (temAlerta ? ALERT_H : 0)
  const firstAvail = TOTAL_CONTENT_H - firstPageExtra
  const contAvail = TOTAL_CONTENT_H - KICKER_H
  const maxFirst = Math.max(1, Math.floor((firstAvail - CHART_PAD - SAFETY) / BAR_H))
  const maxCont = Math.max(1, Math.floor((contAvail - CHART_PAD - SAFETY) / BAR_H))

  // Pre-chunk o gráfico de período
  const periodChunks = ehDiaUnico ? [] : preChunkStatus(comRegistro, maxFirst, maxCont)

  // Decide se a lista de sem registro cabe na última página do gráfico
  let semRegistroNaUltimaPagina = false
  let semRegistroPaginaPropria = false
  if (!ehDiaUnico && semRegistro.length > 0) {
    if (periodChunks.length === 0) {
      // Sem gráfico, a lista vai na página de KPIs
      semRegistroNaUltimaPagina = true
    } else {
      const ultimoChunkLen = periodChunks[periodChunks.length - 1].length
      if (ultimoChunkLen < maxCont - 3) {
        semRegistroNaUltimaPagina = true
      } else {
        semRegistroPaginaPropria = true
      }
    }
  }

  // Pre-chunk a tabela de ocorrências
  const ocorrencias = input.ocorrencias || []
  const occChunks = ocorrencias.length > 0 ? chunkArray(ocorrencias, OCCURRENCES_PER_PAGE) : []

  // Calcula total de páginas
  let totalPages = 0
  const pageDescriptors = []

  if (ehDiaUnico) {
    pageDescriptors.push({ type: 'secao1-dia' })
    totalPages++
  } else if (comRegistro.length === 0 && semRegistro.length === 0) {
    pageDescriptors.push({ type: 'secao1-vazio' })
    totalPages++
  } else if (comRegistro.length === 0) {
    pageDescriptors.push({ type: 'secao1-sem-registro-only' })
    totalPages++
  } else {
    periodChunks.forEach((chunk, i) => {
      const isLast = i === periodChunks.length - 1
      pageDescriptors.push({
        type: 'secao1-grafico',
        chunk,
        isFirst: i === 0,
        isLast,
        semRegistro: isLast && semRegistroNaUltimaPagina ? semRegistro : [],
      })
      totalPages++
    })
    if (semRegistroPaginaPropria) {
      pageDescriptors.push({ type: 'secao1-sem-registro', semRegistro })
      totalPages++
    }
  }

  // Seção 2: KPIs + gráfico de problemas
  pageDescriptors.push({ type: 'secao2-kpis' })
  totalPages++

  // Páginas de ocorrências
  occChunks.forEach((chunk, i) => {
    pageDescriptors.push({
      type: 'secao2-ocorrencias',
      chunk,
      isFirst: i === 0,
      isLast: i === occChunks.length - 1,
      total: ocorrencias.length,
      startRow: i * OCCURRENCES_PER_PAGE,
    })
    totalPages++
  })

  // === Monta HTML de cada página ===
  const chartsData = []
  const pagesHtml = []
  let pageNumber = 0
  let periodChartIdx = 0

  for (const desc of pageDescriptors) {
    pageNumber++
    let html = ''

    if (desc.type === 'secao1-dia') {
      // Modo dia único: KPIs + gráfico de intervalo
      const tituloSecao = `1. Bebedouros limpos em ${dateFmt(diaUnico)}`
      const hasData = limpezasDoDia.length > 0
      const cardH = hasData
        ? Math.max(50, Math.min(limpezasDoDia.length * 10 + 14, 120))
        : 60
      if (hasData) {
        chartsData.push({
          canvasId: 'chart-dia',
          kind: 'limpezaDia',
          items: limpezasDoDia.map((l) => ({
            label: l.nome,
            valor: l.intervalo ?? 0,
            cor: l.cor,
            meta: l.meta,
            primeira: l.intervalo === null,
          })),
        })
      }
      html = pageSection(`
        ${renderHeader({ ...brand, reportTitle: titulo, section: 'Limpeza do dia', sectionLabel: 'Seção 1' })}
        <p class="section-kicker">Resumo do período</p>
        ${periodBadgeHtml(dados)}
        <div class="insight-box"><span class="insight-label">1. Bebedouros limpos no dia</span>${escapeHtml(dateFmt(diaUnico))}</div>
        ${input.limpezaDiaKPIs ? kpisDiaHtml(input.limpezaDiaKPIs) : ''}
        ${chartCardLocal({
          canvasId: 'chart-dia',
          title: 'Intervalo desde a limpeza anterior',
          subtitle: 'Marca verde tracejada = meta individual de cada bebedouro',
          hasData,
          height: `${cardH}mm`,
          emptyMsg: 'Nenhum bebedouro foi limpo neste dia',
        })}
        ${footerHtml(dados, pageNumber, totalPages)}
      `)
    } else if (desc.type === 'secao1-vazio') {
      // Período sem nenhum bebedouro
      html = pageSection(`
        ${renderHeader({ ...brand, reportTitle: titulo, section: 'Status de limpeza', sectionLabel: 'Seção 1' })}
        <p class="section-kicker">Resumo do período</p>
        ${periodBadgeHtml(dados)}
        <div class="insight-box"><span class="insight-label">1. Status de limpeza dos bebedouros</span>Status de limpeza dos bebedouros no período.</div>
        ${input.limpezaKPIs ? kpisPeriodoHtml(input.limpezaKPIs) : ''}
        ${input.maisAtrasado ? alertBox(`Maior atraso: ${input.maisAtrasado.nome} com ${input.maisAtrasado.dias} dias desde a última limpeza. Meta: ${input.maisAtrasado.meta} dias.`, 'red') : ''}
        ${chartCardLocal({
          canvasId: 'chart-period-empty',
          title: 'Dias desde a última limpeza por bebedouro',
          subtitle: 'Marca verde tracejada = meta individual de cada bebedouro',
          hasData: false,
          height: '60mm',
          emptyMsg: 'Nenhum bebedouro cadastrado',
        })}
        ${footerHtml(dados, pageNumber, totalPages)}
      `)
    } else if (desc.type === 'secao1-sem-registro-only') {
      // Período com só bebedouros sem registro
      html = pageSection(`
        ${renderHeader({ ...brand, reportTitle: titulo, section: 'Status de limpeza', sectionLabel: 'Seção 1' })}
        <p class="section-kicker">Resumo do período</p>
        ${periodBadgeHtml(dados)}
        <div class="insight-box"><span class="insight-label">1. Status de limpeza dos bebedouros</span>Status de limpeza dos bebedouros no período.</div>
        ${input.limpezaKPIs ? kpisPeriodoHtml(input.limpezaKPIs) : ''}
        ${input.maisAtrasado ? alertBox(`Maior atraso: ${input.maisAtrasado.nome} com ${input.maisAtrasado.dias} dias desde a última limpeza. Meta: ${input.maisAtrasado.meta} dias.`, 'red') : ''}
        ${chartCardLocal({
          canvasId: 'chart-period-empty',
          title: 'Dias desde a última limpeza por bebedouro',
          hasData: false,
          height: '60mm',
          emptyMsg: 'Nenhum bebedouro com registro de limpeza no período',
        })}
        ${semRegistroListHtml(semRegistro)}
        ${footerHtml(dados, pageNumber, totalPages)}
      `)
    } else if (desc.type === 'secao1-grafico') {
      // Período: chunk do gráfico de status
      const { chunk, isFirst, isLast, semRegistro: semReg } = desc
      const canvasId = `chart-period-${periodChartIdx++}`
      const cardH = chunk.length * BAR_H + CHART_PAD
      chartsData.push({
        canvasId,
        kind: 'limpeza',
        items: chunk.map((s) => ({
          label: s.nome,
          valor: s.dias ?? 0,
          cor: s.cor,
          meta: s.meta,
        })),
      })
      const tituloGrafico = isFirst
        ? 'Dias desde a última limpeza por bebedouro'
        : 'Dias desde a última limpeza por bebedouro (continuação)'
      const subtitulo = isFirst ? 'Marca verde tracejada = meta individual de cada bebedouro' : ''
      const sectionLabel = isFirst ? 'Status de limpeza' : 'Status (continuação)'
      const section = isFirst ? 'Status de limpeza' : 'Continuação'

      let content = `
        ${renderHeader({ ...brand, reportTitle: titulo, section, sectionLabel: 'Seção 1' })}
        <p class="section-kicker">Resumo do período</p>
      `
      if (isFirst) {
        content += `
          ${periodBadgeHtml(dados)}
          <div class="insight-box"><span class="insight-label">1. Status de limpeza dos bebedouros</span>Status de limpeza dos bebedouros no período.</div>
          ${input.limpezaKPIs ? kpisPeriodoHtml(input.limpezaKPIs) : ''}
          ${input.maisAtrasado ? alertBox(`Maior atraso: ${input.maisAtrasado.nome} com ${input.maisAtrasado.dias} dias desde a última limpeza. Meta: ${input.maisAtrasado.meta} dias.`, 'red') : ''}
        `
      }
      content += chartCardLocal({
        canvasId,
        title: tituloGrafico,
        subtitle: subtitulo,
        hasData: true,
        height: `${cardH}mm`,
      })
      if (isLast && semReg && semReg.length > 0) {
        content += semRegistroListHtml(semReg)
      }
      content += footerHtml(dados, pageNumber, totalPages)
      html = pageSection(content)
    } else if (desc.type === 'secao1-sem-registro') {
      // Página própria para lista de sem registro
      html = pageSection(`
        ${renderHeader({ ...brand, reportTitle: titulo, section: 'Sem registro', sectionLabel: 'Seção 1' })}
        <p class="section-kicker">Bebedouros sem registro de limpeza</p>
        ${periodBadgeHtml(dados)}
        ${semRegistroListHtml(desc.semRegistro)}
        ${footerHtml(dados, pageNumber, totalPages)}
      `)
    } else if (desc.type === 'secao2-kpis') {
      // Seção 2: KPIs checklist + gráfico de problemas + box verde (se 0 ocorrências)
      const hasData = input.itensRanking.length > 0
      const cardH = hasData
        ? Math.max(50, Math.min(input.itensRanking.length * 10 + 14, 80))
        : 60
      if (hasData) {
        chartsData.push({
          canvasId: 'chart-problemas',
          kind: 'problemas',
          items: input.itensRanking.map((r) => ({
            label: r.label,
            valor: r.pctNegativo,
          })),
        })
      }
      let content = `
        ${renderHeader({ ...brand, reportTitle: titulo, section: 'Pontos de atenção', sectionLabel: 'Seção 2' })}
        <p class="section-kicker">Resumo do período</p>
        ${periodBadgeHtml(dados)}
        <div class="insight-box"><span class="insight-label">2. Pontos de atenção nos bebedouros</span>Pontos de atenção nos checklists dos bebedouros.</div>
        ${kpisChecklistHtml(input.checklistKPIs)}
        ${chartCardLocal({
          canvasId: 'chart-problemas',
          title: 'Problemas mais frequentes nos checklists',
          hasData,
          height: `${cardH}mm`,
          emptyMsg: 'Nenhum checklist respondido no período',
        })}
      `
      if (ocorrencias.length === 0) {
        content += `<div class="no-ocorr-box">Nenhuma ocorrência negativa nos checklists do período.</div>`
      }
      content += footerHtml(dados, pageNumber, totalPages)
      html = pageSection(content)
    } else if (desc.type === 'secao2-ocorrencias') {
      // Tabela de ocorrências paginada
      const { chunk, total, startRow } = desc
      const suffix = occChunks.length > 1 ? ` <span>· exibindo ${startRow + 1}–${startRow + chunk.length} de ${total}</span>` : ` <span>${total} ocorrência(s)</span>`
      html = pageSection(`
        ${renderHeader({ ...brand, reportTitle: titulo, section: 'Ocorrências', sectionLabel: 'Seção 2' })}
        <p class="section-kicker">Ocorrências negativas nos checklists</p>
        <h2 class="table-title">Ocorrências negativas${suffix}</h2>
        <div class="table-block">${ocorrenciasTableHtml(chunk)}</div>
        ${footerHtml(dados, pageNumber, totalPages)}
      `)
    }

    pagesHtml.push(html)
  }

  const chartJsScript = await getChartJsScript()
  return htmlDocument({
    title: titulo,
    extraCss: BEBEDOUROS_CSS,
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
  if (!isPDFData(body)) {
    return res.status(400).json({ error: 'Payload de relatório inválido' })
  }

  const statusCount = (body.statusPorBebedouro || []).length + (body.limpezasDoDia || []).length
  if (statusCount > MAX_BEBEDOUROS) {
    return res.status(400).json({ error: 'Payload de relatório inválido ou grande demais' })
  }
  if (body.ocorrencias.length > MAX_OCORRENCIAS) {
    return res.status(400).json({ error: 'Número de ocorrências excede o limite permitido' })
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Payload do relatório excede o limite permitido' })
  }

  try {
    console.log('[PDF Bebedouros] Iniciando renderização. Bebedouros:', statusCount, 'Ocorrências:', body.ocorrencias.length, 'Dia único:', body.ehDiaUnico)
    const html = await renderBebedourosHtml(body)
    console.log('[PDF Bebedouros] HTML montado. Bytes:', Buffer.byteLength(html, 'utf8'))
    const pdf = await generatePdf({
      html,
      format: 'A4',
      landscape: true,
      beforePdf: async (page) => {
        await page.waitForFunction('window.__chartsReady === true', { timeout: 15000 }).catch(() => {})
      },
    })
    console.log('[PDF Bebedouros] PDF gerado. Bytes:', pdf.length)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-bebedouros.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PDF-Renderer', 'puppeteer')
    return res.status(200).send(pdf)
  } catch (error) {
    console.error('[PDF Bebedouros] Erro ao gerar relatório:', error)
    console.error('[PDF Bebedouros] Stack:', error?.stack || 'sem stack')
    return res.status(500).json({ error: 'Não foi possível gerar o PDF', detail: String(error) })
  }
}
