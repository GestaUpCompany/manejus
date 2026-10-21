// Endpoint fino do relatório de Clima. Mesmo padrão do consumo.js e
// abastecimento.js: só existe aqui o que é específico deste relatório
// (KPIs, gráficos de acumulado, calendário de chuva, chuva por mês e tabela
// por pluviômetro). Toda a infraestrutura (Chrome, Chart.js, template base,
// formatadores) vem do _shared/.
//
// Estrutura (ver docs/ArquiteturaRelatoriosPDF.md):
//  - Página 1: KPIs + chuva por mês (barras). Se o período cabe num único
//    mês, o calendário daquele mês ocupa o lugar do gráfico mensal.
//  - Página 2: dois gráficos de acumulado lado a lado, com a página toda:
//    acumulado por pluviômetro × média da fazenda (barras horizontais) e
//    evolução do acumulado da fazenda com faixa mín–máx entre pluviômetros
//    (+ temperatura média).
//  - Calendários de chuva (2 meses ou mais): 6 meses por página; um quadrado
//    por dia, só a classe do dia (forte ◆ / torrencial ▲, em alguma região).
//  - Última página: tabela "Resumo por pluviômetro" com a linha da fazenda.
//    Não há mais "Leituras detalhadas" no PDF.

import { escapeHtml, dateFmt, numFmt, intFmt } from './_shared/formatters.js'
import { CHART_DPR, getChartJsScript } from './_shared/chartjs.js'
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
.clima-charts{flex:1;min-height:0;display:flex;gap:8px}
.clima-chart{flex:1;min-width:0;min-height:0}
.clima-chart .chart-card{height:100%}

.clima-content > .clima-chart{flex:1}
.clima-eventos{margin:6px 2px 0;font-size:12px;font-weight:700;color:#30463a}
.clima-mensal{flex:1;min-height:0;margin-top:6px}
.clima-mensal .chart-card{height:100%}

/* Calendário de chuva: 3 colunas de meses; quadrado por dia (tom + símbolo + borda, legível em P&B) */
.cal-legenda{display:flex;flex-wrap:wrap;align-items:center;gap:4px 14px;font-size:11px;color:#30463a;margin-bottom:5px}
.cal-legenda i{display:inline-block;width:11px;height:11px;border-radius:2px;vertical-align:-2px;margin-right:4px}
.cal-legenda em{flex-basis:100%;font-style:normal;color:#63736a;font-size:10.5px}
.cal-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;align-content:start}
.cal-mes{border:1px solid #dce5df;border-radius:5px;padding:4px 6px;background:#fff}
.cal-mes h4{margin:0 0 2px;font-size:11.5px;color:#30463a}
.cal-sem,.cal-dias{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
.cal-sem span{font-size:8.5px;text-align:center;color:#63736a;font-weight:700}
.cal-d{height:6.1mm;border-radius:2px;padding:0 2px;display:flex;flex-direction:column;justify-content:space-between;line-height:1;overflow:hidden}
.cal-dia{font-size:7px;opacity:.85}
.cal-topo{display:flex;justify-content:space-between;align-items:baseline;font-size:7px}
.cal-ev{font-weight:700;font-size:7.5px}
.cal-val{text-align:center;font-weight:700;font-size:10.5px;line-height:1;padding-bottom:1px}
.cal-0{background:#fff;border:1px solid #e5e7eb;color:#9ca3af}
.cal-n{background:#dce8f2;border:1px solid #9db7ce;color:#1f2937}
.cal-f{background:#6f9bc8;border:2px solid #1e3a5f;color:#0f172a}
.cal-t{background:#1e3a5f;border:2px solid #0f172a;color:#fff}
.cal-legenda i.cal-0,.cal-legenda i.cal-n{border-width:1px}
/* 4 a 6 meses: duas fileiras, quadrados de tamanho médio (sobra espaço na página) */
.cal-medio .cal-mes{padding:5px 8px}
.cal-medio .cal-mes h4{font-size:12.5px}
.cal-medio .cal-d{height:8.4mm;padding:1px 2px}
.cal-medio .cal-topo,.cal-medio .cal-dia{font-size:7.5px}
.cal-medio .cal-ev{font-size:8.5px}
.cal-medio .cal-val{font-size:12px}
/* até 3 meses na página: uma só fileira, então os quadrados podem ser maiores */
.cal-grande .cal-mes{padding:6px 10px}
.cal-grande .cal-mes h4{font-size:13px;margin-bottom:4px}
.cal-grande .cal-sem,.cal-grande .cal-dias{gap:3px}
.cal-grande .cal-sem span{font-size:10px}
.cal-grande .cal-d{height:9.2mm;padding:1px 3px}
.cal-grande .cal-topo,.cal-grande .cal-dia{font-size:8.5px}
.cal-grande .cal-ev{font-size:9.5px}
.cal-grande .cal-val{font-size:13.5px}

.clima-resumo-table td{font-size:12px;padding:6px 5px;line-height:1.25}
.clima-resumo-table th{font-size:11px;padding:6px 5px}
.clima-resumo-table th, .clima-resumo-table td{border-right:1px solid #d8e0db}
.clima-resumo-table th:last-child, .clima-resumo-table td:last-child{border-right:none}
.clima-resumo-table tbody tr:nth-child(even){background:#f7faf8}
`

// Script rodado dentro do Chromium headless para desenhar os dois gráficos da
// página 1: (1) barras horizontais com o acumulado de cada pluviômetro e a
// linha da média da fazenda; (2) evolução do acumulado da fazenda com a faixa
// entre o pluviômetro que menos e o que mais acumulou (+ temperatura opcional).
const CHARTS_INIT_JS = `
(function(){
  var COR_ACIMA = '#1E3A5F'
  var COR_ABAIXO = '#8FB3A0'
  var TEMP_COLOR = '#EF4444'
  var DARK_TEXT = '#1F2937'
  var MEDIUM_TEXT = '#6B7280'
  var Chart = window.Chart
  if (!Chart) { window.__chartsReady = true; return }
  Chart.defaults.animation = false
  Chart.defaults.devicePixelRatio = ${CHART_DPR}
  Chart.defaults.font.family = 'Arial, Helvetica, sans-serif'

  var charts = (window.__reportData && window.__reportData.charts) || []

  function fmt(v) { return Number(v).toFixed(1).replace('.', ',') }

  function drawPorPluviometro(entry) {
    var el = document.getElementById(entry.canvasId)
    var resumo = entry.resumo || []
    if (!el || !resumo.length) return
    var media = Number(entry.media) || 0
    var maxMm = Math.max.apply(null, resumo.map(function(r){ return Number(r.mm_total) || 0 }).concat([media, 1]))
    new Chart(el, {
      type: 'bar',
      data: {
        labels: resumo.map(function(r){ return r.pluviometro_nome || '—' }),
        datasets: [{
          data: resumo.map(function(r){ return Number(r.mm_total) || 0 }),
          backgroundColor: resumo.map(function(r){ return (Number(r.mm_total) || 0) >= media ? COR_ACIMA : COR_ABAIXO }),
          borderRadius: 3,
          barPercentage: 0.75,
          categoryPercentage: 0.9,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 18, right: 135, bottom: 4, left: 4 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            beginAtZero: true,
            suggestedMax: maxMm * 1.1,
            title: { display: true, text: 'Chuva acumulada (mm)', color: MEDIUM_TEXT, font: { size: 11, weight: 'bold' } },
            ticks: { color: MEDIUM_TEXT, font: { size: 10 } },
            grid: { color: '#E5E7EB' },
          },
          y: { grid: { display: false }, ticks: { color: DARK_TEXT, font: { size: 11, weight: 'bold' } } },
        },
      },
      plugins: [{
        id: 'valoresEMedia',
        afterDatasetsDraw: function(chart) {
          var ctx = chart.ctx
          var meta = chart.getDatasetMeta(0)
          ctx.save()
          ctx.font = 'bold 11px Arial, sans-serif'
          ctx.fillStyle = DARK_TEXT
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          // desenhado depois da linha da média, com halo branco, para o valor
          // continuar legível quando a linha passa por cima dele
          var desenharValores = function() {
            ctx.font = 'bold 11px Arial, sans-serif'
            ctx.fillStyle = DARK_TEXT
            ctx.textAlign = 'left'
            ctx.textBaseline = 'middle'
            ctx.lineWidth = 4
            ctx.strokeStyle = '#FFFFFF'
            meta.data.forEach(function(bar, i) {
              var v = chart.data.datasets[0].data[i]
              var t = fmt(v) + ' mm'
              if (resumo.length > 1) {
                var dif = v - media
                t += Math.abs(dif) < 0.05 ? '  = média' : (dif > 0 ? '  \\u25B2 +' : '  \\u25BC -') + fmt(Math.abs(dif))
              }
              // coluna fixa à direita da área do gráfico: a linha da média nunca cruza os valores
              ctx.strokeText(t, chart.chartArea.right + 8, bar.y)
              ctx.fillText(t, chart.chartArea.right + 8, bar.y)
            })
          }
          if (resumo.length > 1) {
            var x = chart.scales.x.getPixelForValue(media)
            var area = chart.chartArea
            ctx.setLineDash([6, 4])
            ctx.strokeStyle = '#111827'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(x, area.top - 4)
            ctx.lineTo(x, area.bottom)
            ctx.stroke()
            ctx.setLineDash([])
            ctx.textAlign = 'center'
            ctx.textBaseline = 'bottom'
            ctx.font = 'bold 11px Arial, sans-serif'
            ctx.fillText('Média da fazenda: ' + fmt(media) + ' mm', x, area.top - 6)
          }
          desenharValores()
          ctx.restore()
        },
      }],
    })
  }

  function drawEvolucao(entry) {
    var el = document.getElementById(entry.canvasId)
    var serie = entry.serie || []
    if (!el || !serie.length) return
    var comFaixa = entry.comFaixa === true
    var maxMm = Math.max.apply(null, serie.map(function(p){ return Number(p.acum_max) || 0 }).concat([1]))
    var temps = serie.map(function(p){ return p.temp_media }).filter(function(t){ return t != null })
    var maxTemp = temps.length ? Math.max.apply(null, temps) : 30
    // Eixo X proporcional ao tempo (dias desde a 1ª data): datas esparsas não
    // podem ocupar o mesmo espaço, senão a inclinação da linha engana.
    var DIA = 86400000
    var base = Date.parse(serie[0].data + 'T00:00:00Z')
    var xs = serie.map(function(p){ return Math.round((Date.parse(p.data + 'T00:00:00Z') - base) / DIA) })
    var span = Math.max(xs[xs.length - 1], 1)
    function pts(fn) { return serie.map(function(p, i){ var y = fn(p); return { x: xs[i], y: y } }) }
    function labelDe(dias) {
      var d = new Date(base + dias * DIA)
      return ('0' + d.getUTCDate()).slice(-2) + '/' + ('0' + (d.getUTCMonth() + 1)).slice(-2)
    }
    var datasets = []
    if (comFaixa) {
      datasets.push({
        label: 'Menor acumulado',
        data: pts(function(p){ return Number(p.acum_min) || 0 }),
        borderColor: 'rgba(30,58,95,0.35)', borderWidth: 1, borderDash: [3, 3], pointRadius: 0,
        backgroundColor: 'rgba(30,58,95,0.12)', fill: '+1', yAxisID: 'y', order: 3, tension: 0,
      })
      datasets.push({
        label: 'Maior acumulado',
        data: pts(function(p){ return Number(p.acum_max) || 0 }),
        borderColor: 'rgba(30,58,95,0.35)', borderWidth: 1, borderDash: [3, 3], pointRadius: 0,
        fill: false, yAxisID: 'y', order: 3, tension: 0,
      })
    }
    datasets.push({
      label: 'Média da fazenda (mm)',
      data: pts(function(p){ return Number(p.acum_fazenda) || 0 }),
      borderColor: COR_ACIMA, backgroundColor: COR_ACIMA, borderWidth: 3,
      pointRadius: 5, pointBackgroundColor: COR_ACIMA, pointBorderColor: '#FFFFFF', pointBorderWidth: 2,
      yAxisID: 'y', order: 1, tension: 0,
    })
    var idxMedia = datasets.length - 1
    if (entry.hasTemp) {
      datasets.push({
        label: 'Temp. média (°C)',
        data: pts(function(p){ return p.temp_media != null ? Number(p.temp_media) : null }),
        borderColor: TEMP_COLOR, backgroundColor: TEMP_COLOR, borderWidth: 1.5, pointRadius: 3,
        yAxisID: 'y1', order: 2, tension: 0.3, spanGaps: true,
      })
    }
    new Chart(el, {
      type: 'line',
      data: { datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 24, right: 20, bottom: 4, left: 4 } },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              usePointStyle: true, pointStyle: 'circle', padding: 10, color: DARK_TEXT, font: { size: 10, weight: 'bold' },
              // a faixa já é explicada no subtítulo do card; fora da legenda
              filter: function(item) { return !(comFaixa && item.datasetIndex < 2) },
            },
          },
          tooltip: { enabled: false },
        },
        scales: {
          x: {
            type: 'linear',
            min: -span * 0.04,
            max: span * 1.04,
            grid: { display: false },
            // um tick em cada data com leitura (até 12), pulando as que ficam coladas na anterior
            // (senão os rótulos se sobrepõem); sempre mantém a última data. Acima de 12, ticks automáticos.
            afterBuildTicks: function(scale) {
              if (xs.length > 12) return
              var minGap = span * 0.1
              var mantidos = []
              xs.forEach(function(v) {
                if (!mantidos.length || v - mantidos[mantidos.length - 1] >= minGap) mantidos.push(v)
              })
              var ultimo = xs[xs.length - 1]
              if (mantidos[mantidos.length - 1] !== ultimo) {
                if (mantidos.length > 1 && ultimo - mantidos[mantidos.length - 1] < minGap) mantidos.pop()
                mantidos.push(ultimo)
              }
              scale.ticks = mantidos.map(function(v){ return { value: v } })
            },
            ticks: { color: MEDIUM_TEXT, font: { size: 10 }, callback: function(v){ return labelDe(v) } },
          },
          y: {
            beginAtZero: true, suggestedMax: maxMm * 1.15,
            title: { display: true, text: 'Chuva acumulada (mm)', color: MEDIUM_TEXT, font: { size: 11, weight: 'bold' } },
            ticks: { color: MEDIUM_TEXT, font: { size: 10 } }, grid: { color: '#E5E7EB' },
          },
          y1: {
            display: entry.hasTemp === true, position: 'right', beginAtZero: true, suggestedMax: maxTemp * 1.3,
            title: { display: true, text: '°C', color: TEMP_COLOR, font: { size: 11, weight: 'bold' } },
            ticks: { color: TEMP_COLOR, font: { size: 10 } }, grid: { display: false },
          },
        },
      },
      plugins: [{
        id: 'valoresMedia',
        afterDatasetsDraw: function(chart) {
          var ctx = chart.ctx
          var meta = chart.getDatasetMeta(idxMedia)
          ctx.save()
          ctx.font = 'bold 11px Arial, sans-serif'
          ctx.fillStyle = DARK_TEXT
          ctx.textAlign = 'center'
          ctx.textBaseline = 'bottom'
          ctx.lineWidth = 4
          ctx.strokeStyle = '#FFFFFF'
          meta.data.forEach(function(pt, j) {
            // com muitas datas os valores se sobrepõem: só o primeiro e o último ponto
            if (serie.length > 8 && j !== 0 && j !== serie.length - 1) return
            var t = fmt(chart.data.datasets[idxMedia].data[j].y)
            ctx.strokeText(t, pt.x, pt.y - 9)
            ctx.fillText(t, pt.x, pt.y - 9)
          })
          ctx.restore()
        },
      }],
    })
  }

  // Chuva por mês: uma barra por mês (média da fazenda), com o valor em cima.
  // Meses sem leitura vêm zerados do cliente, então a seca também aparece.
  function drawMensal(entry) {
    var el = document.getElementById(entry.canvasId)
    var mensal = entry.mensal || []
    if (!el || !mensal.length) return
    var maxMm = Math.max.apply(null, mensal.map(function(p){ return Number(p.mm_fazenda) || 0 }).concat([1]))
    new Chart(el, {
      type: 'bar',
      data: {
        labels: mensal.map(function(p){ return p.mes_label }),
        datasets: [{
          data: mensal.map(function(p){ return Number(p.mm_fazenda) || 0 }),
          backgroundColor: COR_ACIMA, borderRadius: 3, maxBarThickness: 56, barPercentage: 0.8, categoryPercentage: 0.9,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        layout: { padding: { top: 22, right: 12, bottom: 2, left: 4 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: DARK_TEXT, font: { size: 11, weight: 'bold' } } },
          y: {
            beginAtZero: true, suggestedMax: maxMm * 1.15,
            title: { display: true, text: 'Chuva no mês (mm)', color: MEDIUM_TEXT, font: { size: 11, weight: 'bold' } },
            ticks: { color: MEDIUM_TEXT, font: { size: 10 } }, grid: { color: '#E5E7EB' },
          },
        },
      },
      plugins: [{
        id: 'valoresMes',
        afterDatasetsDraw: function(chart) {
          var ctx = chart.ctx
          var meta = chart.getDatasetMeta(0)
          ctx.save()
          ctx.font = 'bold 11px Arial, sans-serif'
          ctx.fillStyle = DARK_TEXT
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
          meta.data.forEach(function(bar, i) {
            ctx.fillText(fmt(chart.data.datasets[0].data[i]), bar.x, bar.y - 4)
          })
          ctx.restore()
        },
      }],
    })
  }

  charts.forEach(function(entry) {
    if (entry.kind === 'evolucao') drawEvolucao(entry)
    else if (entry.kind === 'mensal') drawMensal(entry)
    else drawPorPluviometro(entry)
  })
  window.__chartsReady = true
})();
`

function kpisHtml(kpis, hasTemp, hasUmidade) {
  const temp = (v) => (v != null ? `${numFmt(v, 1)}°C` : '—')
  const cards = [
    // mm_total já vem como média dos pluviômetros (cada um é uma região)
    { value: `${numFmt(kpis.mm_total, 1)} mm`, label: kpis.n_pluviometros > 1 ? `Chuva acumulada (média de ${kpis.n_pluviometros} pluviômetros)` : 'Chuva acumulada' },
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

// Linha "Fazenda": média dos pluviômetros (a soma não representa a fazenda).
function fazendaRowHtml(resumo, hasTemp) {
  if (resumo.length < 2) return ''
  const media = (vals) => (vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null)
  const mmTotal = media(resumo.map((r) => Number(r.mm_total) || 0))
  const mmMedio = media(resumo.map((r) => r.mm_medio).filter((v) => v != null))
  const maior = Math.max(...resumo.map((r) => (r.maior_leitura != null ? r.maior_leitura : -Infinity)))
  const leituras = resumo.reduce((s, r) => s + (r.n_medicoes || 0), 0)
  return `<tr style="font-weight:700;background:#e8f1ec"><td colspan="2">Fazenda (média de ${resumo.length} pluviômetros)</td><td class="numeric">${intFmt(leituras)}</td><td class="numeric">${numFmt(mmTotal, 1)} mm</td><td class="numeric">${mmMedio != null ? `${numFmt(mmMedio, 1)} mm` : '—'}</td><td class="numeric">${Number.isFinite(maior) ? `${numFmt(maior, 1)} mm` : '—'}</td>${hasTemp ? '<td></td><td></td>' : ''}</tr>`
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
  return `<h3 class="table-title">Resumo por pluviômetro<span>${resumo.length} pluviômetro(s)</span></h3><div class="table-block"><table class="clima-resumo-table">${tableHeadHtml(cols)}<tbody>${rows}${fazendaRowHtml(resumo, hasTemp)}</tbody></table></div>`
}

// Frase-resumo dos eventos de chuva forte/torrencial do período filtrado.
function eventosTexto(diaria, limites) {
  const torrencial = diaria.filter((p) => p.nivel === 'torrencial').length
  const forte = diaria.filter((p) => p.nivel === 'forte').length
  const maior = diaria.reduce((m, p) => (m === null || p.mm_max_regiao > m.mm_max_regiao ? p : m), null)
  let texto = `No período: ${torrencial} dia(s) com chuva torrencial (≥ ${limites.torrencial} mm) · ${forte} dia(s) com chuva forte (${limites.forte} a ${limites.torrencial} mm)`
  if (maior && maior.mm_max_regiao > 0) {
    texto += ` · maior chuva: ${numFmt(maior.mm_max_regiao, 1)} mm na região ${maior.regiao_max} em ${dateFmt(maior.data)}`
  }
  return `${texto}.`
}

const MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const MESES_POR_PAGINA = 6

// Um calendário por mês, do primeiro ao último dia com leitura (semanas de
// domingo a sábado). Mesma regra da tela pública (montarCalendario).
function montarMeses(diaria) {
  if (diaria.length === 0) return []
  const porData = new Map(diaria.map((p) => [p.data, p]))
  const [anoIni, mesIni] = diaria[0].data.slice(0, 7).split('-').map(Number)
  const [anoFim, mesFim] = diaria[diaria.length - 1].data.slice(0, 7).split('-').map(Number)
  const meses = []
  let a = anoIni
  let m = mesIni
  while (a < anoFim || (a === anoFim && m <= mesFim)) {
    const diasNoMes = new Date(Date.UTC(a, m, 0)).getUTCDate()
    const primeiro = new Date(Date.UTC(a, m - 1, 1)).getUTCDay()
    const celulas = Array.from({ length: primeiro }, () => null)
    for (let dia = 1; dia <= diasNoMes; dia++) {
      const iso = `${a}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
      celulas.push({ dia, ponto: porData.get(iso) || null })
    }
    while (celulas.length % 7 !== 0) celulas.push(null)
    meses.push({ titulo: `${MESES_NOME[m - 1]} de ${a}`, celulas })
    if (m === 12) { a += 1; m = 1 } else { m += 1 }
  }
  return meses
}

// Célula do calendário: número do dia, média da fazenda no centro e, nos dias de
// chuva forte/torrencial, o símbolo (◆/▲) com a maior chuva de uma região.
// Tom + símbolo + borda mais grossa: legível em impressão preto e branco.
function celulaHtml(c) {
  if (!c) return '<span class="cal-vazio"></span>'
  const p = c.ponto
  if (!p) return `<div class="cal-d cal-0"><span class="cal-dia">${c.dia}</span></div>`
  const cls = p.nivel === 'torrencial' ? 'cal-t' : p.nivel === 'forte' ? 'cal-f' : 'cal-n'
  const simbolo = p.nivel === 'normal' ? '' : `<span class="cal-ev">${p.nivel === 'torrencial' ? '▲' : '◆'}${numFmt(p.mm_max_regiao, 0)}</span>`
  return `<div class="cal-d ${cls}"><span class="cal-topo"><span class="cal-dia">${c.dia}</span>${simbolo}</span><span class="cal-val">${numFmt(p.mm_fazenda, 0)}</span></div>`
}

function mesHtml(mes) {
  const semana = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d) => `<span>${d}</span>`).join('')
  return `<div class="cal-mes"><h4>${escapeHtml(mes.titulo)}</h4><div class="cal-sem">${semana}</div><div class="cal-dias">${mes.celulas.map(celulaHtml).join('')}</div></div>`
}

function legendaCalendarioHtml(limites) {
  return `<div class="cal-legenda">
    <span><i class="cal-0"></i> Sem leitura</span>
    <span><i class="cal-n"></i> Leitura sem chuva forte (&lt; ${limites.forte} mm em todas as regiões)</span>
    <span><i class="cal-f"></i> ◆ Forte (${limites.forte} a ${limites.torrencial} mm em alguma região)</span>
    <span><i class="cal-t"></i> ▲ Torrencial (≥ ${limites.torrencial} mm em alguma região)</span>
    <em>Número grande = média da fazenda no dia · símbolo + valor = maior chuva do dia em alguma região (a fazenda toda pode ter recebido bem menos) · dia em branco = sem leitura registrada</em>
  </div>`
}

export async function renderClimaHtml(input) {
  const { dataInicio, dataFim, fazendaNome, logoGestao, logoFazenda, kpis, serie, resumo, registros } = input
  const diaria = Array.isArray(input.diaria) ? input.diaria : []
  // O gráfico mensal só ajuda a partir de 2 meses; com 1 só, o calendário já diz tudo
  const mensal = Array.isArray(input.mensal) && input.mensal.length >= 2 ? input.mensal : []
  const limites = input.limites && input.limites.forte && input.limites.torrencial ? input.limites : { forte: 25, torrencial: 50 }
  const brand = { logoGestao, logoFazenda, fazendaNome }
  const period = { dataInicio, dataFim }

  // Quando a fazenda não registra temperatura/umidade no período, os cards,
  // a linha do gráfico e as colunas correspondentes são omitidos por completo.
  const hasTemp =
    registros.some((r) => r.temperatura != null || r.temperatura_media != null) ||
    serie.some((p) => p.temp_media != null)
  const hasUmidade = registros.some((r) => r.umidade_relativa != null)

  // Estrutura (o rodapé mostra "Página X de Y", então o total é conhecido de antemão):
  //  1. KPIs + chuva por mês (ou, se o período cabe num único mês, o calendário daquele mês);
  //  2. os dois gráficos de acumulado (por pluviômetro × média e evolução), com a página toda;
  //  3. calendários de chuva, 6 meses por página, quando o período tem 2 meses ou mais;
  //  4. resumo por pluviômetro.
  const meses = montarMeses(diaria)
  const umMes = mensal.length === 0 && meses.length > 0
  const chunksMeses = []
  if (!umMes) for (let i = 0; i < meses.length; i += MESES_POR_PAGINA) chunksMeses.push(meses.slice(i, i + MESES_POR_PAGINA))
  const temDados = serie.length > 0 && resumo.length > 0
  const temResumo = resumo.length > 0
  const totalPages = 1 + (temDados ? 1 : 0) + chunksMeses.length + (temResumo ? 1 : 0)

  const chartsData = []
  const pagesHtml = []
  let pageIndex = 0

  // Página 1: KPIs + distribuição da chuva no tempo
  pageIndex += 1
  const graficoMensalHtml = `<div class="clima-mensal">${chartCard({ canvasId: 'chart-clima-mensal', title: 'Chuva por mês', subtitle: 'Média da fazenda em cada mês (a soma das barras é a chuva acumulada do período). Meses sem leitura aparecem zerados.', hasData: true })}</div>`
  const calendarioHtml = (chunk) =>
    `${legendaCalendarioHtml(limites)}<div class="cal-grid${chunk.length <= 3 ? ' cal-grande' : ' cal-medio'}" style="grid-template-columns:repeat(${Math.min(chunk.length, 3)},1fr)">${chunk.map(mesHtml).join('')}</div>`
  let corpoPrimeira = ''
  if (mensal.length > 0) {
    chartsData.push({ kind: 'mensal', canvasId: 'chart-clima-mensal', mensal })
    corpoPrimeira = graficoMensalHtml
  } else if (umMes) {
    corpoPrimeira = `${calendarioHtml(meses)}<p class="clima-eventos">${escapeHtml(eventosTexto(diaria, limites))}</p>`
  }
  pagesHtml.push(
    pageSection(`
      ${renderHeader({ ...brand, reportTitle: 'Relatório de Clima', section: 'Resumo', sectionLabel: 'Seção' })}
      <p class="section-kicker">Resumo do período</p>
      <div class="clima-content">
        <div class="period-badge">${dateFmt(dataInicio)} <span style="padding:0 7px;color:#9bb1a4">até</span> ${dateFmt(dataFim)}</div>
        ${kpisHtml(kpis, hasTemp, hasUmidade)}
        ${corpoPrimeira}
      </div>
      ${renderFooter({ ...period, page: pageIndex, totalPages })}
    `),
  )

  // Página 2: acumulado da chuva (os dois gráficos lado a lado, com a altura da página)
  if (temDados) {
    pageIndex += 1
    chartsData.push({ kind: 'porPluviometro', canvasId: 'chart-clima-pluv', resumo, media: kpis.mm_total })
    chartsData.push({ kind: 'evolucao', canvasId: 'chart-clima-evolucao', serie, hasTemp, comFaixa: resumo.length > 1 })
    pagesHtml.push(
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: 'Relatório de Clima', section: 'Acumulado da chuva', sectionLabel: 'Seção' })}
        <p class="section-kicker">Acumulado da chuva por região e ao longo do tempo</p>
        <div class="clima-content">
          <div class="clima-charts">
            <div class="clima-chart">${chartCard({ canvasId: 'chart-clima-pluv', title: 'Acumulado por pluviômetro × média da fazenda', subtitle: resumo.length > 1 ? '▲ acima · ▼ abaixo da média da fazenda (diferença em mm)' : `${registros.length} leitura(s) · ${resumo.length} pluviômetro(s)`, hasData: temDados })}</div>
            <div class="clima-chart">${chartCard({ canvasId: 'chart-clima-evolucao', title: hasTemp ? 'Evolução do acumulado da fazenda e temperatura' : 'Evolução do acumulado da fazenda', subtitle: resumo.length > 1 ? 'Linha: média da fazenda até cada data; mais inclinada = mais chuva no intervalo. Faixa: só as regiões extremas (cima = a que mais choveu, baixo = a que menos). Borda de cima longe da linha = região bem mais molhada; borda de baixo longe = região bem atrás da média. Não mostra quantas regiões estão em cada borda: veja o gráfico ao lado.' : 'Acumulado do pluviômetro no período', hasData: temDados })}</div>
          </div>
        </div>
        ${renderFooter({ ...period, page: pageIndex, totalPages })}
      `),
    )
  }

  // Calendários de chuva (2 meses ou mais): um quadrado por dia, 6 meses por página (3 x 2)
  chunksMeses.forEach((chunk, idx) => {
    pageIndex += 1
    const ultima = idx === chunksMeses.length - 1
    pagesHtml.push(
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: 'Relatório de Clima', section: 'Calendário de chuva', sectionLabel: 'Seção' })}
        <p class="section-kicker">Calendário de chuva${chunksMeses.length > 1 ? ` (${idx + 1}/${chunksMeses.length})` : ''}</p>
        <div class="clima-content">
          ${calendarioHtml(chunk)}
          ${ultima ? `<p class="clima-eventos">${escapeHtml(eventosTexto(diaria, limites))}</p>` : ''}
        </div>
        ${renderFooter({ ...period, page: pageIndex, totalPages })}
      `),
    )
  })

  // Última página: resumo por pluviômetro
  if (temResumo) {
    pageIndex += 1
    pagesHtml.push(
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: 'Relatório de Clima', section: 'Detalhamento', sectionLabel: 'Seção' })}
        <p class="section-kicker">Detalhamento</p>
        <div class="clima-content">${resumoTableHtml(resumo, hasTemp)}</div>
        ${renderFooter({ ...period, page: pageIndex, totalPages })}
      `),
    )
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
