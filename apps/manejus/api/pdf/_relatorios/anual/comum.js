// Peças compartilhadas pelas seções do Infográfico Anual. Cada seção recebe o JSON
// de uma RPC get_infografico_anual_* (12 meses + KPIs do ano + rankings) e monta
// páginas com o motor de fluxo, como os relatórios mensais. Nada aqui é diário.

import { CHART_DPR, getChartJsScript } from '../../_shared/chartjs.js'
import { escapeHtml, intFmt, numFmt } from '../../_shared/formatters.js'
import { flowBlock, flowIntro, flowSection, flowTable } from '../../_shared/flowEngine.js'
import { chartCard, htmlDocument, kpi, renderFooter, renderHeader } from '../../_shared/template.js'

export { flowBlock, flowTable, kpi }

export const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export const CORES = {
  verde: '#0b6a42',
  verdeClaro: '#5fae84',
  dourado: '#c28a27',
  azul: '#1E3A5F',
  azulClaro: '#6F9BC8',
  vermelho: '#c94d46',
  cinza: '#9CA3AF',
}
export const PALETA = ['#0b6a42', '#c28a27', '#1E3A5F', '#c94d46', '#5fae84', '#6F9BC8', '#8B5CF6', '#84CC16']

export const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v))
export const fmt = (v, casas = 1) => (num(v) == null ? '—' : numFmt(num(v), casas))
export const fmtInt = (v) => (num(v) == null ? '—' : Number(Math.round(num(v))).toLocaleString('pt-BR'))
export const fmtMoeda = (v) =>
  num(v) == null ? '—' : `R$ ${num(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function mesesLabels(ultimoMes) {
  return MESES_ABREV.slice(0, Math.max(1, Math.min(12, Number(ultimoMes) || 12)))
}

export function periodoAno(ano, ultimoMes) {
  const hoje = new Date()
  const fim =
    Number(ultimoMes) >= 12 || Number(ano) < hoje.getUTCFullYear()
      ? `${ano}-12-31`
      : hoje.toISOString().slice(0, 10)
  return { dataInicio: `${ano}-01-01`, dataFim: fim }
}

export function rotuloPeriodo(ano, ultimoMes) {
  return Number(ultimoMes) >= 12 ? `Janeiro a Dezembro de ${ano}` : `Janeiro a ${MESES[Number(ultimoMes) - 1]} de ${ano} (ano em curso)`
}

/** Tabela simples: cols = [{ label, width?, numeric? }], rows = arrays de HTML já escapado. */
export function tabela(titulo, subtitulo, cols, rows) {
  if (!rows.length) return ''
  const colgroup = cols.some((c) => c.width) ? `<colgroup>${cols.map((c) => `<col${c.width ? ` style="width:${c.width}"` : ''}>`).join('')}</colgroup>` : ''
  const head = `<thead><tr>${cols.map((c) => `<th${c.numeric ? ' style="text-align:right"' : ''}>${escapeHtml(c.label)}</th>`).join('')}</tr></thead>`
  const body = rows
    .map((r, i) => `<tr${i % 2 ? ' class="striped"' : ''}>${r.map((cel, j) => `<td${cols[j]?.numeric ? ' class="numeric"' : ''}>${cel}</td>`).join('')}</tr>`)
    .join('')
  return `<div class="table-block"><h3 class="table-title">${escapeHtml(titulo)}${subtitulo ? `<span>${escapeHtml(subtitulo)}</span>` : ''}</h3><table>${colgroup}${head}<tbody>${body}</tbody></table></div>`
}

export function plural(n, singular, pluralTxt) {
  return `${fmtInt(n)} ${Number(n) === 1 ? singular : pluralTxt}`
}

export function nota(texto, tom = 'info') {
  if (!texto) return ''
  const cor = tom === 'alerta' ? '#c28a27' : '#0b6a42'
  return `<div class="insight-box" style="border-left-color:${cor}"><span class="insight-label" style="color:${cor}">${tom === 'alerta' ? 'Atenção' : 'Leitura do ano'}</span>${escapeHtml(texto)}</div>`
}

export function grade(cards, colunas = cards.length) {
  const itens = cards.filter(Boolean)
  if (!itens.length) return ''
  return `<div class="anual-grid" style="--cols:${Math.min(colunas, itens.length)}">${itens.join('')}</div>`
}

/**
 * Gráfico mensal. `datasets`: [{ label, data, cor, tipo: 'bar'|'line', eixo: 'y'|'y2', pilha? }].
 * Devolve { html, spec } — o spec vai em dataJson.charts e é desenhado pelo CHARTS_INIT_ANUAL.
 */
export function grafico({ id, titulo, subtitulo, labels, datasets, yTitulo = '', y2Titulo = '', empilhado = false, horizontal = false, rotulos = true, casas = 0, altura }) {
  const temDados = datasets.some((d) => (d.data || []).some((v) => num(v) != null && num(v) !== 0))
  return {
    html: chartCard({ canvasId: id, title: titulo, subtitle: subtitulo, hasData: temDados, height: altura }),
    spec: temDados ? { canvasId: id, labels, datasets, yTitulo, y2Titulo, empilhado, horizontal, rotulos, casas } : null,
  }
}

const CHARTS_INIT_ANUAL = `
(function(){
  var Chart = window.Chart
  if (!Chart) { window.__chartsReady = true; return }
  Chart.defaults.animation = false
  Chart.defaults.devicePixelRatio = ${CHART_DPR}
  Chart.defaults.font.family = 'Arial, Helvetica, sans-serif'
  var TXT = '#1F2937', MED = '#6B7280'
  function fmt(v, casas) {
    if (v == null || isNaN(v)) return ''
    return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
  }
  var rotulosPlugin = {
    id: 'rotulosAnual',
    afterDatasetsDraw: function(chart) {
      var spec = chart.options.__spec
      if (!spec || !spec.rotulos) return
      var ctx = chart.ctx
      ctx.save()
      ctx.font = 'bold 9px Arial'
      ctx.fillStyle = TXT
      var temBarra = chart.data.datasets.some(function(ds) { return ds.type !== 'line' })
      chart.data.datasets.forEach(function(ds, i) {
        if (spec.empilhado && ds.type !== 'line') return
        if (temBarra && ds.type === 'line') return
        var meta = chart.getDatasetMeta(i)
        if (meta.hidden) return
        meta.data.forEach(function(el, j) {
          var v = ds.data[j]
          if (v == null || v === 0) return
          var p = el.tooltipPosition()
          if (spec.horizontal) { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(fmt(v, ds.casas != null ? ds.casas : spec.casas), p.x + 4, p.y) }
          else { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(fmt(v, ds.casas != null ? ds.casas : spec.casas), p.x, p.y - 3) }
        })
      })
      if (spec.empilhado) {
        var totais = chart.data.labels.map(function(_, j) {
          return chart.data.datasets.reduce(function(s, ds) { return ds.type === 'line' ? s : s + (Number(ds.data[j]) || 0) }, 0)
        })
        var ultima = -1
        chart.data.datasets.forEach(function(ds, i) { if (ds.type !== 'line') ultima = i })
        if (ultima >= 0) {
          var meta = chart.getDatasetMeta(ultima)
          meta.data.forEach(function(el, j) {
            if (!totais[j]) return
            var p = el.tooltipPosition()
            ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
            ctx.fillText(fmt(totais[j], spec.casas), p.x, Math.min(p.y, el.y) - 3)
          })
        }
      }
      ctx.restore()
    }
  }
  var specs = (window.__reportData && window.__reportData.charts) || []
  specs.forEach(function(spec) {
    var el = document.getElementById(spec.canvasId)
    if (!el) return
    var temY2 = spec.datasets.some(function(d) { return d.eixo === 'y2' })
    var datasets = spec.datasets.map(function(d) {
      var linha = d.tipo === 'line'
      return {
        type: linha ? 'line' : 'bar',
        label: d.label,
        data: d.data,
        casas: d.casas,
        backgroundColor: d.cor,
        borderColor: d.cor,
        borderWidth: linha ? 2 : 0,
        pointRadius: linha ? 3 : 0,
        spanGaps: true,
        tension: 0.25,
        yAxisID: d.eixo === 'y2' ? 'y2' : 'y',
        xAxisID: 'x',
        stack: spec.empilhado && !linha ? 'pilha' : undefined,
        borderRadius: linha ? 0 : 3,
        order: linha ? 0 : 1,
        barPercentage: 0.8,
        categoryPercentage: 0.8,
        maxBarThickness: 26,
      }
    })
    var escalas = {
      x: { stacked: spec.empilhado, grid: { display: false }, ticks: { color: MED, font: { size: 10 } } },
      y: { stacked: spec.empilhado, beginAtZero: true, grace: '12%', grid: { color: '#E5E7EB' }, ticks: { color: MED, font: { size: 10 } },
           title: { display: !!spec.yTitulo, text: spec.yTitulo, color: TXT, font: { size: 10, weight: 'bold' } } },
    }
    if (temY2) escalas.y2 = { position: 'right', beginAtZero: true, grace: '12%', grid: { display: false }, ticks: { color: MED, font: { size: 10 } },
      title: { display: !!spec.y2Titulo, text: spec.y2Titulo, color: TXT, font: { size: 10, weight: 'bold' } } }
    if (spec.horizontal) { var t = escalas.x; escalas.x = escalas.y; escalas.y = t; escalas.x.position = 'bottom'; escalas.y.grid = { display: false } }
    new Chart(el, {
      type: 'bar',
      data: { labels: spec.labels, datasets: datasets },
      options: {
        __spec: spec,
        indexAxis: spec.horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 16, right: spec.horizontal ? 40 : 8, bottom: 2, left: 4 } },
        plugins: {
          legend: { display: spec.datasets.length > 1, position: 'top', labels: { usePointStyle: true, pointStyle: 'circle', padding: 10, color: TXT, font: { size: 10, weight: 'bold' } } },
          tooltip: { enabled: false },
        },
        scales: escalas,
      },
      plugins: [rotulosPlugin],
    })
  })
  window.__chartsReady = true
})();
`

const ANUAL_CSS = `
.anual-grid{display:grid;grid-template-columns:repeat(var(--cols),1fr);gap:7px;margin-bottom:6px}
.anual-grid .chart-card{height:60mm}
.anual-grid .table-block{margin-bottom:0}
.anual-ressalva{font-size:10.5px;color:#7a6a3a;background:#fbf6ea;border:1px solid #efe0bd;border-radius:5px;padding:5px 8px;margin-bottom:5px;line-height:1.35}
`

/**
 * Monta o HTML completo de uma seção anual.
 * blocos: [{ html, tipo: 'bloco'|'tabela', sec, lbl, quebra? }]
 */
export async function renderSecaoAnual({ titulo, dados, logoGestao, logoFazenda, fazendaNome, blocos, charts }) {
  const ano = dados.ano
  const ult = dados.ultimo_mes
  const periodo = periodoAno(ano, ult)
  const badge = `<div class="period-badge">${escapeHtml(rotuloPeriodo(ano, ult))}</div>`
  const primeiro = blocos.find((b) => b.html)
  const corpo = [
    flowBlock(flowIntro(`Ano ${ano}`, badge), { sec: primeiro?.sec, lbl: primeiro?.lbl, keepNext: true }),
    ...blocos.map((b) =>
      b.tipo === 'tabela'
        ? flowTable(b.html, { sec: b.sec, lbl: b.lbl, breakBefore: b.quebra, minRows: b.minRows ?? 4 })
        : flowBlock(b.html, { sec: b.sec, lbl: b.lbl, breakBefore: b.quebra }),
    ),
  ]
  const body = flowSection({
    headerHtml: renderHeader({ logoGestao, logoFazenda, fazendaNome, reportTitle: titulo, section: '__SEC__', sectionLabel: '__LBL__' }),
    footerHtml: renderFooter({ ...periodo, page: 0, totalPages: 0 }),
    blocks: corpo,
  })
  const specs = charts.filter(Boolean)
  return htmlDocument({
    title: titulo,
    extraCss: ANUAL_CSS,
    body,
    chartJsScript: specs.length ? await getChartJsScript() : '',
    chartsInit: specs.length ? CHARTS_INIT_ANUAL : 'window.__chartsReady=true',
    dataJson: { charts: specs },
  })
}

export function serie(mensal, campo, ultimoMes) {
  const porMes = new Map((mensal || []).map((m) => [Number(m.mes), m]))
  return mesesLabels(ultimoMes).map((_, i) => {
    const m = porMes.get(i + 1)
    const v = typeof campo === 'function' ? campo(m) : m?.[campo]
    return num(v)
  })
}

export { escapeHtml, intFmt }
