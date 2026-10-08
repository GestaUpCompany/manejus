// Endpoint fino do relatório de Rodeio. Mesmo padrão do clima.js e
// morte.js: só existe aqui o que é específico deste relatório (página de
// resumo com KPIs + gráficos, página de análise com lista de alertas e
// resumo por lote, e páginas de detalhamento com os registros). Toda a
// infraestrutura (Chrome, Chart.js, template base, formatadores, labels de
// diagnóstico) vem do _shared/.
//
// Estrutura:
//  - Página 1: KPIs consolidados + faixa de alertas do período + gráficos
//    "cabeças por dia" (barras empilhadas por categoria) e "distribuição
//    de escore" (barras agrupadas por faixa, gado e fezes).
//  - Página 2: lista detalhada de alertas (data/pasto/lote/observação) +
//    tabela única "Resumo por lote" (com pasto atual do lote).
//  - Página 3+: tabela "Registros detalhados" pre-chunked, com composição
//    resumida (só categorias com cabeças) e equipe abreviada.

import { escapeHtml, dateFmt, numFmt, intFmt } from './_shared/formatters.js'
import { rodeioAlertas } from './_shared/labels.js'
import { getChartJsScript } from './_shared/chartjs.js'
import { generatePdf } from './_shared/puppeteer.js'
import {
  renderHeader,
  renderFooter,
  kpi,
  chartCard,
  htmlDocument,
} from './_shared/template.js'
import { flowBlock, flowIntro, flowSection, flowTable } from './_shared/flowEngine.js'

const MAX_REGISTROS = 20000
const MAX_BODY_BYTES = 8_000_000

const CATEGORIAS = [
  { key: 'vaca', label: 'Vacas', short: 'Vac' },
  { key: 'touro', label: 'Touros', short: 'Tou' },
  { key: 'bezerro', label: 'Bezerros', short: 'Bez' },
  { key: 'boi', label: 'Bois', short: 'Boi' },
  { key: 'garrote', label: 'Garrotes', short: 'Gar' },
  { key: 'novilha', label: 'Novilhas', short: 'Nov' },
]

const CATEGORIA_COLORS = {
  vaca: '#0F6437',
  touro: '#1E3A5F',
  bezerro: '#10B981',
  boi: '#c28a27',
  garrote: '#6B7280',
  novilha: '#EC4899',
}

// Faixas de escore (1-5) usadas no gráfico de distribuição. Degrau de 0,5:
// índice 0 cobre "< 2,0" e o último ">= 4,5".
const ESCORE_BUCKETS = ['< 2,0', '2,0', '2,5', '3,0', '3,5', '4,0', '≥ 4,5']

function bucketIndex(valor) {
  if (valor == null || Number.isNaN(Number(valor))) return -1
  const v = Number(valor)
  if (v < 1.75) return 0
  if (v < 2.25) return 1
  if (v < 2.75) return 2
  if (v < 3.25) return 3
  if (v < 3.75) return 4
  if (v < 4.25) return 5
  return 6
}

// "Carlos Henrique Schemmer" -> "Carlos H." — primeiro nome + inicial do
// último sobrenome, curto o suficiente para a coluna não quebrar a linha.
function abreviarNome(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return ''
  if (partes.length === 1) return partes[0]
  return `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`
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

// CSS específico do rodeio: header mais compacto que o padrão dos demais
// relatórios, gráficos lado a lado na página 1, faixa de alertas, lista de
// alertas e tabela única de resumo na página 2.
const RODEIO_CSS = `
.report-header{height:16mm;margin-bottom:4mm;padding-bottom:3mm}
.brand-logo{width:44px;height:44px}
.report-title{font-size:22px}
.farm-logo{max-height:56px;max-width:120px}
.page{display:flex;flex-direction:column}
.rodeio-content{flex:1;display:flex;flex-direction:column;min-height:0}
.rodeio-charts{display:grid;grid-template-columns:repeat(var(--cols,2),1fr);gap:8px;height:58mm}
.rodeio-charts .chart-card{height:100%}
.rodeio-nota{font-size:12px;color:#7a8981;margin:0}
.rodeio-alertas-mini{border:1px solid #efd8d6;border-left:3px solid #c94d46;border-radius:0 5px 5px 0;background:#fdf6f5;padding:6px 10px;margin-bottom:3mm}
.rodeio-alertas-mini .am-title{color:#c94d46;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:3px}
.rodeio-alertas-mini .am-item{font-size:11px;color:#7a4a45;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rodeio-alertas-mini .am-item b{color:#b03a33}
.rodeio-alertas-mini .am-more{font-size:10px;color:#a08a86;margin-top:2px}
.rodeio-alertas-table td{font-size:10px;padding:4px 5px;line-height:1.3}
.rodeio-alertas-table th{font-size:10px;padding:5px}
.rodeio-resumo-table td, .rodeio-detail-table td{font-size:11px;padding:5px 4px;line-height:1.25}
.rodeio-resumo-table th, .rodeio-detail-table th{font-size:10px;padding:5px 4px}
.rodeio-resumo-table th, .rodeio-resumo-table td,
.rodeio-detail-table th, .rodeio-detail-table td{border-right:1px solid #d8e0db}
.rodeio-resumo-table th:last-child, .rodeio-resumo-table td:last-child,
.rodeio-detail-table th:last-child, .rodeio-detail-table td:last-child{border-right:none}
.rodeio-resumo-table tbody tr:nth-child(even), .rodeio-detail-table tbody tr:nth-child(even){background:#f7faf8}
.rodeio-alerta{color:#c94d46;font-weight:600}
.rodeio-alerta-obs{display:block;color:#8a9890;font-weight:400;font-size:9px}
.rodeio-meta-fora{color:#c94d46;font-size:9px;font-weight:700}
.rodeio-meta-ok{color:#8a9890;font-size:9px}
.rodeio-equipe{font-size:10px;color:#4f5f56}
`

// Script rodado dentro do Chromium headless. Cada entrada de
// __reportData.charts carrega um `kind` que decide o tipo de gráfico:
// 'cabecas' (barras empilhadas por categoria) ou 'escoreDist' (barras
// agrupadas por faixa de escore, gado e fezes).
const CHARTS_INIT_JS = `
(function(){
  var DARK_TEXT = '#1F2937'
  var MEDIUM_TEXT = '#6B7280'
  var CATEGORIA_COLORS = ${JSON.stringify(CATEGORIA_COLORS)}
  var Chart = window.Chart
  if (!Chart) { window.__chartsReady = true; return }
  Chart.defaults.animation = false
  Chart.defaults.devicePixelRatio = 3
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

  function drawEscoreDist(el, entry) {
    var labels = entry.labels || []
    var gado = entry.gado || []
    var fezes = entry.fezes || []
    if (!labels.length) return
    new Chart(el, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Escore gado',
            data: gado,
            backgroundColor: '#0F6437',
            borderRadius: 3,
            borderSkipped: false,
            barPercentage: 0.85,
            categoryPercentage: 0.75,
          },
          {
            label: 'Escore fezes',
            data: fezes,
            backgroundColor: '#c28a27',
            borderRadius: 3,
            borderSkipped: false,
            barPercentage: 0.85,
            categoryPercentage: 0.75,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 18, right: 10, bottom: 6, left: 6 } },
        plugins: { legend: baseLegend(), tooltip: { enabled: false } },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: MEDIUM_TEXT, font: { size: 10 } },
            title: { display: true, text: 'Escore (1-5)', color: DARK_TEXT, font: { size: 11, weight: 'bold' } },
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Nº de rodeios', color: DARK_TEXT, font: { size: 11, weight: 'bold' } },
            ticks: { color: MEDIUM_TEXT, font: { size: 10 }, precision: 0 },
            grid: { color: '#E5E7EB' },
          },
        },
      },
      plugins: [{
        id: 'distLabels',
        afterDatasetsDraw: function(chart) {
          var ctx = chart.ctx
          ctx.save()
          ctx.textAlign = 'center'
          ctx.font = 'bold 9px Arial, sans-serif'
          ctx.fillStyle = DARK_TEXT
          chart.data.datasets.forEach(function(ds, di) {
            var meta = chart.getDatasetMeta(di)
            meta.data.forEach(function(bar, j) {
              var v = Number(ds.data[j])
              if (!v) return
              ctx.fillText(String(v), bar.x, bar.y - 3)
            })
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
    else if (entry.kind === 'escoreDist') drawEscoreDist(el, entry)
  })
  window.__chartsReady = true
})();
`

function tableHeadHtml(cols) {
  const colgroup = `<colgroup>${cols.map(([, w]) => `<col style="width:${w}">`).join('')}</colgroup>`
  const header = `<thead><tr>${cols.map(([t]) => `<th>${t}</th>`).join('')}</tr></thead>`
  return colgroup + header
}

// Lista plana de todos os alertas do período, mais recentes primeiro.
// Serve tanto para a faixa da página 1 quanto para a lista da página 2.
function listaAlertas(registros) {
  const itens = []
  for (const r of registros) {
    for (const a of rodeioAlertas(r.diagnosticos)) {
      itens.push({
        data: r.data,
        pasto: r.pasto || '—',
        lote: r.lote || '—',
        label: a.label,
        observacao: a.observacao || '',
      })
    }
  }
  return itens.sort((a, b) => String(b.data).localeCompare(String(a.data)))
}

// Faixa compacta na página 1: os 3 alertas mais recentes + quanto resta.
function alertasMiniHtml(itens) {
  if (!itens.length) return ''
  const linhas = itens
    .slice(0, 3)
    .map(
      (a) =>
        `<div class="am-item"><b>${dateFmt(a.data)}</b> · ${escapeHtml(a.pasto)} · ${escapeHtml(a.label)}${a.observacao ? ` — <i>${escapeHtml(a.observacao)}</i>` : ''}</div>`,
    )
    .join('')
  const resto = itens.length > 3 ? `<div class="am-more">+ ${itens.length - 3} alerta(s) listados em Diagnósticos e locais</div>` : ''
  return `<div class="rodeio-alertas-mini"><div class="am-title">Alertas do período (${itens.length})</div>${linhas}${resto}</div>`
}

// Lista completa de alertas na página 2, substituindo o gráfico de uma
// barra que desperdiçava espaço quando havia poucos diagnósticos.
function alertasTableHtml(itens) {
  if (!itens.length) {
    return `<div class="table-block"><h3 class="table-title">Alertas do período<span>0 alerta(s)</span></h3><p style="font-size:12px;color:#7a8981;margin:0">Nenhum diagnóstico fora do padrão foi registrado nos rodeios do período.</p></div>`
  }
  const cols = [
    ['Data', '10%'],
    ['Pasto', '16%'],
    ['Lote', '22%'],
    ['Diagnóstico', '24%'],
    ['Observação', '28%'],
  ]
  const rows = itens
    .map(
      (a) =>
        `<tr><td>${dateFmt(a.data)}</td><td>${escapeHtml(a.pasto)}</td><td>${escapeHtml(a.lote)}</td><td><span class="rodeio-alerta">${escapeHtml(a.label)}</span></td><td>${a.observacao ? escapeHtml(a.observacao) : '—'}</td></tr>`,
    )
    .join('')
  return `<div class="table-block"><h3 class="table-title">Alertas do período<span>${itens.length} alerta(s)</span></h3><table class="rodeio-alertas-table">${tableHeadHtml(cols)}<tbody>${rows}</tbody></table></div>`
}

// Tabela única por lote: o pasto mostrado é o do rodeio mais recente do
// lote (pasto é atributo do rodeio, não do lote). A tabela por pasto foi
// fundida aqui porque pasto e lote são quase 1:1 na prática. `itens` é um
// slice paginado; `total` é o total de lotes para o contador do título.
// Classificação da meta de intervalo entre rodeios (mesma regra de
// situacaoMetaRodeio em relatorioRodeio/agregacao.ts — mantida em JS aqui
// porque o endpoint não importa o módulo TS do front).
function situacaoMeta(r) {
  if (r.meta_intervalo_dias == null || r.meta_intervalo_dias <= 0) return 'sem_meta'
  if (r.dias_desde_anterior == null) return 'sem_anterior'
  return r.dias_desde_anterior <= r.meta_intervalo_dias ? 'dentro' : 'fora'
}

function resumoLoteTableHtml(itens, pastoPorLote, total, temMeta) {
  const cols = temMeta
    ? [
        ['Lote', '20%'],
        ['Pasto', '14%'],
        ['Rodeios', '7%'],
        ['Última contagem', '15%'],
        ['Média cabeças', '11%'],
        ['Escore médio', '10%'],
        ['Meta intervalo', '12%'],
        ['Alertas', '11%'],
      ]
    : [
        ['Lote', '24%'],
        ['Pasto', '16%'],
        ['Rodeios', '10%'],
        ['Última contagem', '16%'],
        ['Média cabeças', '12%'],
        ['Escore médio', '11%'],
        ['Alertas', '11%'],
      ]
  const rows = itens
    .map((r) => {
      const alertaTd = r.alertas > 0
        ? `<td class="numeric rodeio-alerta">${intFmt(r.alertas)}</td>`
        : '<td class="numeric">—</td>'
      const metaTd = temMeta
        ? `<td class="numeric">${r.meta_dias != null ? `${intFmt(r.meta_dias)}d` : '—'}${r.fora_meta > 0 ? `<br><span class="rodeio-meta-fora">${intFmt(r.fora_meta)} fora</span>` : r.dentro_meta > 0 ? `<br><span class="rodeio-meta-ok">${intFmt(r.dentro_meta)} dentro</span>` : ''}</td>`
        : ''
      return `<tr><td>${escapeHtml(r.nome)}</td><td>${escapeHtml(pastoPorLote.get(r.nome) || '—')}</td><td class="numeric">${intFmt(r.rodeios)}</td><td class="numeric">${r.cabecas_ultima != null ? intFmt(r.cabecas_ultima) : '—'}${r.data_ultima ? ` <span style="color:#8a9890">(${dateFmt(r.data_ultima)})</span>` : ''}</td><td class="numeric">${r.cabecas_media != null ? numFmt(r.cabecas_media, 0) : '—'}</td><td class="numeric">${r.escore_medio != null ? numFmt(r.escore_medio, 1) : '—'}</td>${metaTd}${alertaTd}</tr>`
    })
    .join('')
  return `<div class="table-block"><h3 class="table-title">Resumo por lote<span>${total} lote(s)</span></h3><table class="rodeio-resumo-table">${tableHeadHtml(cols)}<tbody>${rows}</tbody></table></div>`
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

function equipeHtml(r) {
  if (Array.isArray(r.equipe_nomes) && r.equipe_nomes.length) {
    const abreviados = r.equipe_nomes.map(abreviarNome).filter(Boolean)
    return escapeHtml(abreviados.join(', ') || '—')
  }
  return r.equipe != null ? intFmt(r.equipe) : '—'
}

function detailTableHtml(registros, total) {
  const cols = [
    ['Data', '8%'],
    ['Usuário', '10%'],
    ['Pasto', '11%'],
    ['Lote', '12%'],
    ['Total', '6%'],
    ['Esc. gado', '7%'],
    ['Esc. fezes', '7%'],
    ['Equipe', '12%'],
    ['Alertas', '27%'],
  ]
  const num = (v) => (v != null ? intFmt(v) : '—')
  const rows = registros
    .map(
      (r) =>
        `<tr><td>${dateFmt(r.data)}</td><td>${escapeHtml(r.nome_usuario || '—')}</td><td>${escapeHtml(r.pasto || '—')}</td><td>${escapeHtml(r.lote || '—')}${situacaoMeta(r) === 'fora' ? `<br><span class="rodeio-meta-fora">Atraso de ${intFmt(r.dias_desde_anterior - r.meta_intervalo_dias)} dias</span>` : ''}</td><td class="numeric"><strong>${num(r.total_cabecas)}</strong></td><td class="numeric">${r.escore_gado != null ? numFmt(r.escore_gado, 1) : '—'}</td><td class="numeric">${r.escore_fezes != null ? intFmt(r.escore_fezes) : '—'}</td><td><span class="rodeio-equipe">${equipeHtml(r)}</span></td>${alertasCellHtml(r)}</tr>`,
    )
    .join('')
  return `<div class="table-block"><h3 class="table-title">Registros detalhados<span>${total} registro(s)</span></h3><table class="rodeio-detail-table">${tableHeadHtml(cols)}<tbody>${rows}</tbody></table></div>`
}

export async function renderRodeioHtml(input) {
  const { dataInicio, dataFim, fazendaNome, logoGestao, logoFazenda, resumo, registros } = input
  const brand = { logoGestao, logoFazenda, fazendaNome }
  const period = { dataInicio, dataFim }

  const serie = resumo.serie_diaria ?? []
  const porLote = resumo.por_lote ?? []
  const categoriasComDados = CATEGORIAS.filter((cat) => serie.some((p) => (Number(p[cat.key]) || 0) > 0))


  // Alertas planos e distribuição de escore são calculados aqui dos
  // registros brutos — o resumo já vem agregado do cliente.
  const alertas = listaAlertas(registros)
  const distGado = new Array(ESCORE_BUCKETS.length).fill(0)
  const distFezes = new Array(ESCORE_BUCKETS.length).fill(0)
  for (const r of registros) {
    const ig = bucketIndex(r.escore_gado)
    const iff = bucketIndex(r.escore_fezes)
    if (ig >= 0) distGado[ig] += 1
    if (iff >= 0) distFezes[iff] += 1
  }
  const temEscore = distGado.some((v) => v > 0) || distFezes.some((v) => v > 0)

  // Pasto atual de cada lote = pasto do rodeio mais recente daquele lote.
  const pastoPorLote = new Map()
  for (const r of [...registros].sort((a, b) => String(a.data).localeCompare(String(b.data)))) {
    if (r.lote) pastoPorLote.set(r.lote, r.pasto || '—')
  }

  // Meta de intervalo entre rodeios: só aparece quando ao menos um lote do
  // período tem meta_intervalo_rodeio_dias configurada.
  const temMeta = Number(resumo.rodeios_com_meta) > 0

  const chartsData = []

  const canvasCabecas = 'chart-rodeio-cabecas'
  const canvasEscore = 'chart-rodeio-escore'
  const temCabecas = serie.length > 0 && categoriasComDados.length > 0
  if (temCabecas) {
    chartsData.push({ canvasId: canvasCabecas, kind: 'cabecas', serie, categorias: categoriasComDados })
  }
  if (temEscore) {
    chartsData.push({ canvasId: canvasEscore, kind: 'escoreDist', labels: ESCORE_BUCKETS, gado: distGado, fezes: distFezes })
  }
  const totalAlertas = resumo.alertas_sanitarios + resumo.pendencias_infra
  const metaClassificaveis = (resumo.dentro_meta || 0) + (resumo.fora_meta || 0)
  const metaPct = metaClassificaveis > 0 ? Math.round((resumo.dentro_meta / metaClassificaveis) * 100) : null

  // Gráficos: só entram os que têm dados; o número de colunas acompanha.
  const cards = []
  if (temCabecas) cards.push(chartCard({ canvasId: canvasCabecas, title: 'Cabeças contadas por dia', subtitle: 'Composição por categoria', hasData: true }))
  if (temEscore) cards.push(chartCard({ canvasId: canvasEscore, title: 'Distribuição de escore', subtitle: 'Rodeios por faixa de escore (gado e fezes)', hasData: true }))
  const chartsHtml = cards.length
    ? `<div class="rodeio-charts" style="--cols:${cards.length}">${cards.join('')}</div>`
    : '<p class="rodeio-nota">Sem contagem de cabeças nem escores registrados no período.</p>'

  const kpisHtml = `<div class="${temMeta ? 'kpi-grid' : 'kpi-grid secondary'}">
        ${kpi(intFmt(resumo.total_rodeios), 'Rodeios realizados', 'No período selecionado')}
        ${kpi(resumo.escore_gado_medio != null ? numFmt(resumo.escore_gado_medio, 1) : '—', 'Escore médio do gado', `Fezes: ${resumo.escore_fezes_medio != null ? numFmt(resumo.escore_fezes_medio, 1) : '—'} (1-5)`)}
        ${kpi(intFmt(totalAlertas), 'Alertas de diagnóstico', `${intFmt(resumo.alertas_sanitarios)} sanitários · ${intFmt(resumo.pendencias_infra)} infra · ${intFmt(resumo.rodeios_com_alerta)} rodeio(s)`, totalAlertas > 0 ? 'red' : 'green')}
        ${temMeta ? kpi(metaPct != null ? `${metaPct}%` : '—', 'Aderência à meta de intervalo', `${intFmt(resumo.dentro_meta)} dentro · ${intFmt(resumo.fora_meta)} fora · ${intFmt(metaClassificaveis)} avaliados`, resumo.fora_meta > 0 ? 'red' : 'green') : ''}
      </div>`

  const periodBadge = `<div class="period-badge">${dateFmt(dataInicio)} <span style="padding:0 7px;color:#9bb1a4">até</span> ${dateFmt(dataFim)}</div>`
  const resumoSec = { sec: 'Resumo executivo', lbl: 'Visão geral' }
  const analiseSec = { sec: 'Diagnósticos e locais', lbl: 'Análise' }
  const registrosSec = { sec: 'Detalhamento', lbl: 'Registros' }

  // Cada bloco só existe se há conteúdo; o motor de fluxo (flowEngine) mede
  // e distribui em quantas páginas forem necessárias.
  const blocks = [
    flowBlock(flowIntro('Resumo do período', periodBadge), { ...resumoSec, keepNext: true }),
    flowBlock(resumo.insights ? `<div class="insight-box"><span class="insight-label">Resumo</span>${escapeHtml(resumo.insights)}</div>` : '', resumoSec),
    flowBlock(kpisHtml, resumoSec),
    flowBlock(alertasMiniHtml(alertas), resumoSec),
    flowBlock(chartsHtml, resumoSec),
    alertas.length
      ? flowTable(alertasTableHtml(alertas), analiseSec)
      : flowBlock(alertasTableHtml(alertas), analiseSec),
    flowTable(resumoLoteTableHtml(porLote, pastoPorLote, porLote.length, temMeta), analiseSec),
    flowTable(detailTableHtml(registros, registros.length), registrosSec),
  ]

  const body = flowSection({
    headerHtml: renderHeader({ ...brand, reportTitle: 'Relatório de Rodeio de Gado', section: '__SEC__', sectionLabel: '__LBL__' }),
    footerHtml: renderFooter({ ...period, page: 0, totalPages: 0 }),
    blocks,
  })

  const chartJsScript = await getChartJsScript()
  return htmlDocument({
    title: 'Relatório de Rodeio de Gado',
    extraCss: RODEIO_CSS,
    body,
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
