// Peças compartilhadas pelas seções do Infográfico Anual. Cada seção recebe o JSON
// de uma RPC get_infografico_anual_* (12 meses + KPIs do ano + rankings) e monta
// páginas com o motor de fluxo, como os relatórios mensais. Nada aqui é diário.

import { CHART_DPR, getChartJsScript } from '../../_shared/chartjs.js'
import { escapeHtml, intFmt, numFmt } from '../../_shared/formatters.js'
import { flowBlock, flowSection, flowTable } from '../../_shared/flowEngine.js'
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

export function rotuloCurto(ano, ultimoMes) {
  const ult = Math.max(1, Math.min(12, Number(ultimoMes) || 12))
  return ult >= 12 ? `Ano ${ano}` : `Jan–${MESES_ABREV[ult - 1]} ${ano}`
}

// Tons das métricas: cor sólida (texto/barras) e base RGB do mapa de calor.
export const TONS = {
  verde: { cor: '#0b6a42', rgb: '11,106,66' },
  dourado: { cor: '#9a6b17', rgb: '194,138,39' },
  azul: { cor: '#1E3A5F', rgb: '30,58,95' },
  vermelho: { cor: '#b5413a', rgb: '201,77,70' },
}

/**
 * KPIs com hierarquia: um destaque (fundo verde, valor grande) + até 3 secundários.
 * Cada item: { valor, rotulo, contexto?, tom? }.
 */
export function kpisAnuais(destaque, outros) {
  const card = (k, hero) =>
    `<div class="ak${hero ? ' ak-hero' : ''}${k.tom ? ` ak-${k.tom}` : ''}"><div class="ak-rot">${escapeHtml(k.rotulo)}</div><div class="ak-val">${escapeHtml(k.valor)}</div>${k.contexto ? `<div class="ak-ctx">${escapeHtml(k.contexto)}</div>` : ''}</div>`
  return `<div class="ak-row">${card(destaque, true)}${outros.filter(Boolean).map((k) => card(k)).join('')}</div>`
}

/**
 * Régua anual: uma linha por métrica, uma coluna por mês + coluna do ano. Cada célula é
 * pintada pela intensidade dentro da própria linha; meses ainda não decorridos ficam hachurados.
 * linhas: [{ rotulo, valores: (number|null)[] (até 12), ano: string (total/índice do ano já formatado),
 *            formato: (v) => string, tom?: keyof TONS, sub?: boolean, semCor?: boolean }]
 */
export function reguaAnual(titulo, nota, linhas, ultimoMes) {
  const validas = linhas.filter(Boolean)
  if (!validas.length) return ''
  const ult = Math.max(1, Math.min(12, Number(ultimoMes) || 12))
  const head = `<thead><tr><th class="rg-met">Métrica</th>${MESES_ABREV.map((m, i) => `<th class="${i >= ult ? 'rg-fut' : ''}">${m}</th>`).join('')}<th class="rg-ano">Ano</th></tr></thead>`
  const corpo = validas
    .map((l) => {
      const tom = TONS[l.tom ?? 'verde']
      const vals = MESES_ABREV.map((_, i) => (i < ult ? num(l.valores?.[i]) : undefined))
      const max = Math.max(0, ...vals.filter((v) => v != null).map((v) => Math.abs(v)))
      const cel = vals
        .map((v) => {
          if (v === undefined) return '<td class="rg-fut"></td>'
          if (v == null) return '<td class="rg-nulo">·</td>'
          if (v === 0) return '<td class="rg-zero">0</td>'
          const a = l.semCor || max === 0 ? 0 : 0.12 + 0.78 * (Math.abs(v) / max)
          const claro = a > 0.55
          return `<td style="background:rgba(${tom.rgb},${a.toFixed(2)})${claro ? ';color:#fff' : ''}">${escapeHtml(l.formato(v))}</td>`
        })
        .join('')
      return `<tr${l.sub ? ' class="rg-sub"' : ''}><td class="rg-met">${escapeHtml(l.rotulo)}</td>${cel}<td class="rg-ano" style="color:${tom.cor}">${escapeHtml(l.ano ?? '')}</td></tr>`
    })
    .join('')
  return `<div class="rg-bloco"><div class="ab-tit"><strong>${escapeHtml(titulo)}</strong>${nota ? `<span>${escapeHtml(nota)}</span>` : ''}</div><table class="regua">${head}<tbody>${corpo}</tbody></table></div>`
}

/** Ranking em barras HTML. itens: [{ rotulo, valor, texto?, extra? }]. */
export function ranking(titulo, nota, itens, { tom = 'verde', max = 8, formato = fmtInt } = {}) {
  const lista = (itens || []).filter((i) => num(i.valor) != null).slice(0, max)
  if (!lista.length) return ''
  const cor = TONS[tom].cor
  const topo = Math.max(...lista.map((i) => Math.abs(num(i.valor)))) || 1
  const linhas = lista
    .map(
      (i) =>
        `<div class="rk-l"><span class="rk-r" title="${escapeHtml(i.rotulo)}">${escapeHtml(i.rotulo)}</span><span class="rk-b"><i style="width:${Math.max(2, (Math.abs(num(i.valor)) / topo) * 100).toFixed(1)}%;background:${cor}"></i></span><span class="rk-v">${escapeHtml(i.texto ?? formato(i.valor))}</span>${i.extra != null ? `<span class="rk-x">${escapeHtml(i.extra)}</span>` : ''}</div>`,
    )
    .join('')
  return `<div class="rk"><div class="ab-tit"><strong>${escapeHtml(titulo)}</strong>${nota ? `<span>${escapeHtml(nota)}</span>` : ''}</div>${linhas}</div>`
}

/** Mini-barras de 12 meses (resumo do ano). */
export function miniBarras(valores, ultimoMes, tom = 'verde') {
  const ult = Math.max(1, Math.min(12, Number(ultimoMes) || 12))
  const vals = MESES_ABREV.map((_, i) => (i < ult ? Math.max(0, num(valores?.[i]) ?? 0) : null))
  const max = Math.max(0, ...vals.filter((v) => v != null)) || 1
  return `<div class="mb">${vals
    .map((v, i) => `<span class="mb-c${v == null ? ' mb-fut' : ''}" title="${MESES_ABREV[i]}"><i style="height:${v == null ? 0 : v === 0 ? 0 : Math.max(6, (v / max) * 100).toFixed(0)}%;background:${TONS[tom].cor}"></i></span>`)
    .join('')}</div><div class="mb-eixo">${MESES_ABREV.map((m) => `<span>${m[0]}</span>`).join('')}</div>`
}

/** Nota de rodapé discreta (ressalvas metodológicas). */
export function rodape(textos) {
  const lista = textos.filter(Boolean)
  if (!lista.length) return ''
  return `<div class="ab-notas">${lista.map((t) => `<p>${escapeHtml(t)}</p>`).join('')}</div>`
}

export function colunas(itens, proporcao = '1fr 1fr') {
  const lista = itens.filter(Boolean)
  if (!lista.length) return ''
  return `<div class="ab-cols" style="grid-template-columns:${lista.length === 1 ? '1fr' : proporcao}">${lista.map((h) => `<div>${h}</div>`).join('')}</div>`
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
.page{padding:10mm 13mm 22mm}
.report-header{height:19mm;margin-bottom:4mm;padding-bottom:3mm}
.report-title{font-size:23px}
.ab-tit{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:0 0 2mm}
.ab-tit strong{font-size:12.5px;color:#26352e;letter-spacing:.2px}
.ab-tit span{font-size:10px;color:#8a9890}
.ab-cols{display:grid;gap:6mm;margin-bottom:4mm}
.ak-row{display:grid;grid-template-columns:1.35fr 1fr 1fr 1fr;gap:3mm;margin-bottom:4.5mm}
.ak{border:1px solid #dce5df;border-radius:6px;padding:3mm 3.5mm;background:#fff;display:flex;flex-direction:column;min-height:23mm}
.ak-rot{font-size:9.5px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:#6b7b72}
.ak-val{font-size:21px;font-weight:700;color:#0b6a42;line-height:1.15;margin-top:1.5mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.ak-ctx{font-size:10px;color:#7a8981;margin-top:auto;padding-top:1.5mm;line-height:1.3}
.ak-hero{background:#0b6a42;border-color:#0b6a42}
.ak-hero .ak-rot{color:#cfe6d9}
.ak-hero .ak-val{color:#fff;font-size:30px}
.ak-hero .ak-ctx{color:#d9eee2}
.ak-vermelho .ak-val{color:#b5413a}
.ak-dourado .ak-val{color:#9a6b17}
.ak-azul .ak-val{color:#1E3A5F}
.rg-bloco{margin-bottom:4.5mm}
table.regua{table-layout:fixed;border:0;border-radius:0}
table.regua th{background:transparent;color:#7a8981;font-size:9.5px;font-weight:700;text-align:center;padding:2px 1px;border-bottom:1.5px solid #26352e;letter-spacing:.3px}
table.regua th.rg-met{text-align:left;width:20%}
table.regua th.rg-ano,table.regua td.rg-ano{width:9.5%;text-align:right;border-left:1.5px solid #26352e;padding-right:4px}
table.regua td{font-size:10px;text-align:center;padding:4px 1px;border-bottom:1px solid #fff;border-right:1px solid #fff;color:#26352e;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden}
table.regua td.rg-met{text-align:left;font-weight:700;font-size:10px;color:#30463a;white-space:normal;padding-left:2px}
table.regua td.rg-ano{font-weight:700;font-size:11px;background:#f4f8f5}
table.regua tr.rg-sub td.rg-met{font-weight:400;padding-left:10px;color:#63736a}
table.regua td.rg-zero{color:#b7c2bb}
table.regua td.rg-nulo{color:#c9d2cc}
table.regua .rg-fut{background:repeating-linear-gradient(135deg,#f3f5f4 0 3px,#e6ebe8 3px 4px);color:#b7c2bb}
.rk-l{display:grid;grid-template-columns:34% 1fr 15% auto;align-items:center;gap:2.5mm;padding:1.3mm 0;border-bottom:1px solid #eef2ef;font-size:10.5px}
.rk-r{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#30463a}
.rk-b{height:3.2mm;background:#eef2ef;border-radius:2px;overflow:hidden}
.rk-b i{display:block;height:100%;border-radius:2px}
.rk-v{text-align:right;font-weight:700;color:#26352e;font-variant-numeric:tabular-nums;white-space:nowrap}
.rk-x{text-align:right;color:#7a8981;font-size:9.5px;white-space:nowrap;min-width:14mm}
.anual-grid{display:grid;grid-template-columns:repeat(var(--cols),1fr);gap:6mm;margin-bottom:4mm}
.anual-grid .chart-card,.ab-cols .chart-card{height:62mm}
.anual-grid .table-block,.ab-cols .table-block{margin-bottom:0}
.ab-notas{border-top:1px solid #dce5df;padding-top:2mm;margin-top:1mm}
.ab-notas p{margin:0 0 1mm;font-size:9px;line-height:1.35;color:#7a8981}
.ab-notas p::before{content:'Nota · ';font-weight:700;color:#9a6b17}
.mb{display:grid;grid-template-columns:repeat(12,1fr);gap:1px;height:13mm;align-items:end;border-bottom:1px solid #cfdad3}
.mb-c{height:100%;display:flex;align-items:flex-end}
.mb-c i{display:block;width:100%;border-radius:1.5px 1.5px 0 0}
.mb-fut{background:repeating-linear-gradient(135deg,#f3f5f4 0 2px,#e6ebe8 2px 3px)}
.mb-eixo{display:grid;grid-template-columns:repeat(12,1fr);font-size:7.5px;color:#9aa69f;text-align:center;margin-top:.8mm}
`

/**
 * Monta o HTML completo de uma seção anual. O período vai no cabeçalho (rótulo acima da seção),
 * sem faixa de introdução: a primeira coisa abaixo do cabeçalho já é número.
 * blocos: [{ html, tipo: 'bloco'|'tabela', sec, quebra?, minRows? }]
 */
export async function renderSecaoAnual({ titulo, dados, logoGestao, logoFazenda, fazendaNome, blocos, charts }) {
  const periodo = periodoAno(dados.ano, dados.ultimo_mes)
  const lbl = rotuloCurto(dados.ano, dados.ultimo_mes)
  const corpo = blocos.map((b) =>
    b.tipo === 'tabela'
      ? flowTable(b.html, { sec: b.sec, lbl, breakBefore: b.quebra, minRows: b.minRows ?? 4 })
      : flowBlock(b.html, { sec: b.sec, lbl, breakBefore: b.quebra }),
  )
  const body = flowSection({
    headerHtml: renderHeader({ logoGestao, logoFazenda, fazendaNome, reportTitle: titulo, section: '__SEC__', sectionLabel: '__LBL__' }),
    footerHtml: renderFooter({ ...periodo, page: 0, totalPages: 0 }),
    blocks: corpo,
  })
  const specs = (charts || []).filter(Boolean)
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
