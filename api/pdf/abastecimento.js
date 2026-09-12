// Endpoint fino do relatório de Abastecimento. Mesmo padrão do morte.js e
// consumo.js: só existe aqui o que é específico deste relatório (KPIs laterais
// + pills condicionais de filtro + 3 gráficos de barras + 2 tabelas de
// detalhamento paginadas). Toda a infraestrutura (Chrome, Chart.js, template
// base, formatadores) vem do _shared/.
//
// Diferenças estruturais em relação ao consumo/morte (ver
// docs/ArquiteturaRelatoriosPDF.md):
//  - Relatório de fazenda única, não multi-lote. Uma página de gráficos +
//    páginas de tabelas paginadas (pre-chunked, mesmo padrão do morte.js).
//  - 3 gráficos: 1 barras vertical full-width (Litros por Máquina) + 2
//    barras horizontais lado a lado (Combustível, Operação).
//  - 2 tabelas: Detalhamento por Máquina (8 colunas + linha de total) e
//    Detalhamento Operacional (3 colunas). Ambas pre-chunked em
//    DETAIL_ROWS_PER_PAGE linhas por página.
//  - Pills de filtro condicionais (0 a 3) com fallback "Sem filtros".

import { escapeHtml, dateFmt, numFmt, titleCase } from './_shared/formatters.js'
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

// Limite do body. O payload do abastecimento é bem mais enxuto que consumo
// ou morte: ~3 agregados (porMaquina, porCombustivel, porOperacao) com poucas
// dezenas de itens cada + detalhesPorMaquina (uma linha por máquina, ~200
// bytes em JSON). Mesmo uma fazenda com 200 máquinas gera ~40KB de payload.
// 8MB cobre com folga gigantesca; o limite real aqui é defensivo.
const MAX_MAQUINAS = 5000
const MAX_BODY_BYTES = 8_000_000

// Linhas de detalhamento por página. Cada <tr> com 13px de fonte e ~30px de
// altura cabe ~18 linhas em A4 landscape com header/footer. Mesmo cálculo do
// morte.js (20), arredondado para 18 por causa das 8 colunas da tabela 1.
const DETAIL_ROWS_PER_PAGE = 18

function isPDFData(value) {
  if (!value || typeof value !== 'object') return false
  if (typeof value.titulo !== 'string') return false
  if (typeof value.fazendaNome !== 'string') return false
  if (!value.filtros || typeof value.filtros !== 'object') return false
  if (!Array.isArray(value.porMaquina)) return false
  if (!Array.isArray(value.porCombustivel)) return false
  if (!Array.isArray(value.porOperacao)) return false
  if (typeof value.totalLitros !== 'number') return false
  if (typeof value.totalRegistros !== 'number') return false
  if (!Array.isArray(value.detalhesPorMaquina)) return false
  return true
}

// Mapa de abreviacao de marcas conhecidas. A chave e case-insensitive.
// As chaves podem ter uma ou mais palavras. O algoritmo procura as
// palavras-chave na string e retorna a abreviacao correspondente.
// Usado para transformar "John Deere 6125" em "JD 6125" no relatorio,
// mesmo quando o cadastro so tem "Deere" ou "Jonh Deere".
const MARCA_ABREV = {
  'John Deere': 'JD',
  'Jonh Deere': 'JD',
  'Deere': 'JD',
  'JohnDeere': 'JD',
  'Volkswagen': 'VW',
  'Volks': 'VW',
  'Massey Ferguson': 'MF',
  'New Holland': 'NH',
  'Case': 'Case',
  'Ford': 'Ford',
  'JCB': 'JCB',
  'Honda': 'Honda',
  'Liugong': 'Liugong',
}

function normalizarMarca(value) {
  if (!value) return ''
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ')
}

function tokensDaMarca(value) {
  return normalizarMarca(value).split(' ')
}

function abreviarMarca(value) {
  if (!value) return ''
  const tokens = tokensDaMarca(value)
  for (const [marca, abrev] of Object.entries(MARCA_ABREV)) {
    const alvo = tokensDaMarca(marca)
    let idx = 0
    for (const t of tokens) {
      if (t === alvo[idx]) idx++
      if (idx === alvo.length) return abrev
    }
  }
  // Se nao encontrar, retorna a primeira palavra da marca (ou a marca toda).
  const partes = value.trim().split(/\s+/)
  return partes[0] || value
}

// Quando nao temos marca separada, tenta abreviar a marca no inicio da
// string completa (ex: "John Deere 6125" vira "JD 6125").
function abreviarMarcaNaString(value) {
  if (!value) return value
  const tokens = tokensDaMarca(value)
  const raw = value.trim()
  const rawLower = raw.toLowerCase()
  for (const [marca, abrev] of Object.entries(MARCA_ABREV)) {
    const alvo = tokensDaMarca(marca)
    let idx = 0
    let alvoPos = 0
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === alvo[idx]) {
        if (idx === 0) alvoPos = i
        idx++
      }
      if (idx === alvo.length) {
        // Encontrou a marca nas primeiras palavras. Pega o resto a partir
        // do fim da marca na string original.
        const posFim = rawLower.indexOf(alvo.join(' '), rawLower.indexOf(tokens[alvoPos])) + alvo.join(' ').length
        const resto = raw.slice(posFim).trim()
        return resto ? `${abrev} ${resto}` : abrev
      }
    }
  }
  return value
}

function montarLabelMaquina(item) {
  if (item.marca) {
    const modelo = item.modelo ? String(item.modelo).trim() : ''
    const marca = abreviarMarca(item.marca)
    if (marca && modelo) return `${marca} ${modelo}`
    if (modelo) return modelo
    return abreviarMarca(item.marca)
  }
  return abreviarMarcaNaString(item.maquina || '')
}

// Formatador local: intFmt do _shared não usa separador de milhar, mas o
// abastecimento mostra litros e registros que frequentemente passam de 1000.
const intFmtLocale = (value) =>
  value == null || Number.isNaN(value)
    ? '—'
    : Math.round(Number(value)).toLocaleString('pt-BR')

// Data curta DD/MM (sem ano), usada na coluna "Período" da tabela 1.
const dateShortFmt = (value) => {
  if (!value) return '—'
  const parts = String(value).split('-')
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : String(value)
}

// CSS específico do abastecimento: grid da página de gráficos (KPIs em
// coluna à esquerda + área de conteúdo à direita), pills condicionais, grid
// de 2 colunas para os gráficos inferiores, larguras das colunas das tabelas.
// Mesmo critério do MORTE_CSS/CONSUMO_CSS: específico demais para o _shared/.
const ABASTECIMENTO_CSS = `
.page{display:flex;flex-direction:column}
.abast-content{flex:1;display:flex;flex-direction:column;min-height:0}
.pills-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:3mm}
.abast-pill{background:#0b6a42;color:#fff;border-radius:5px;padding:5px 10px;text-align:center;min-width:0;flex:1 1 80px}
.abast-pill .pill-value{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.abast-pill .pill-label{font-size:10px;opacity:.9;margin-top:1px}
.period-badge{background:#f7f9f8;border:1px solid #e5ebe7;color:#4f5f56}
.abast-body{display:grid;grid-template-columns:40mm 1fr;gap:6px;flex:1;min-height:0}
.kpi-col{display:flex;flex-direction:column;gap:5px}
.kpi-col .kpi-card{min-height:0;padding:6px 8px}
.kpi-col .kpi-value{font-size:15px}
.kpi-col .kpi-label{font-size:11px;margin-top:3px}
.charts-col{display:flex;flex-direction:column;gap:6px;min-height:0}
.charts-col .chart-card{height:auto}
.chart-main{height:120mm}
.chart-pair{display:grid;grid-template-columns:1fr 1fr;gap:10px;height:135mm}
.detail-table th:nth-child(1){width:22%}
.detail-table th:nth-child(2){width:11%}
.detail-table th:nth-child(3){width:8%}
.detail-table th:nth-child(4){width:9%}
.detail-table th:nth-child(5){width:9%}
.detail-table th:nth-child(6){width:9%}
.detail-table th:nth-child(7){width:12%}
.detail-table th:nth-child(8){width:20%}
.detail-table td{font-size:12px;padding:6px 5px;line-height:1.25}
.detail-table th{font-size:11px;padding:6px 5px}
.detail-table tr.total-row{font-weight:700;background:#eef5f0}
.detail-table tr.total-row td{color:#0b6a42}
.detail-table th, .detail-table td{border-right:1px solid #d8e0db}
.detail-table th:last-child, .detail-table td:last-child{border-right:none}
.detail-table tbody tr:nth-child(even){background:#f7faf8}
.oper-table th:nth-child(1){width:30%}
.oper-table th:nth-child(2){width:45%}
.oper-table th:nth-child(3){width:25%}
.oper-table th, .oper-table td{border-right:1px solid #d8e0db}
.oper-table th:last-child, .oper-table td:last-child{border-right:none}
.oper-table tbody tr:nth-child(even){background:#f7faf8}
.oper-table td{font-size:12px;padding:6px 5px;line-height:1.25}
.oper-table th{font-size:11px;padding:6px 5px}
`

// Script rodado dentro do Chromium headless para desenhar os 3 gráficos de
// barras do abastecimento. Recebe os dados via window.__reportData.charts.
// Porta a lógica de rótulos do jsPDF: posicionamento acima da barra no
// gráfico vertical (com ajuste anti-clipping nas bordas) e à direita da
// barra nos gráficos horizontais. Truncamento de labels em 10/12/14 chars.
const CHARTS_INIT_JS = `
(function(){
  var GREEN_DARK = '#0F6437'
  var BLUE_BAR = '#1E3A5F'
  var DARK_TEXT = '#1F2937'
  var MEDIUM_TEXT = '#6B7280'
  var Chart = window.Chart
  if (!Chart) { window.__chartsReady = true; return }
  Chart.defaults.animation = false
  Chart.defaults.font.family = 'Arial, Helvetica, sans-serif'

  var charts = (window.__reportData && window.__reportData.charts) || []
  var remaining = charts.length

  function trunc(s, n) {
    if (!s) return s
    s = String(s)
    return s.length > n ? s.substring(0, n - 1) + '…' : s
  }

  function fmtInt(n) {
    return Math.round(Number(n)).toLocaleString('pt-BR') + 'L'
  }

  function drawVertical(canvasId, items, cor) {
    var el = document.getElementById(canvasId)
    if (!el) { maybeDone(); return }
    if (!items || !items.length) { maybeDone(); return }
    var labels = items.map(function(d){return trunc(d.label, 14)})
    var valores = items.map(function(d){return d.valor})
    var maxVal = Math.max.apply(null, valores.concat([1]))
    new Chart(el, {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: 'Litros', data: valores, backgroundColor: cor, borderRadius: 4, borderSkipped: false, barPercentage: 0.5, categoryPercentage: 0.7 }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        layout: { padding: { top: 26, right: 25, bottom: 25, left: 25 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            ticks: { color: DARK_TEXT, font: { size: 11 }, maxRotation: 35, minRotation: 35, callback: function(value) { var lbl = this.getLabelForValue(value); return trunc(lbl, 10) } },
            grid: { color: '#E5E7EB' },
          },
          y: {
            beginAtZero: true,
            ticks: { color: DARK_TEXT, font: { size: 10 } },
            grid: { color: '#E5E7EB' },
          },
        },
      },
      plugins: [{
        id: 'dataLabels',
        afterDatasetsDraw: function(chart) {
          var ctx = chart.ctx
          var meta = chart.getDatasetMeta(0)
          var dataset = chart.data.datasets[0]
          ctx.save()
          ctx.textAlign = 'center'
          ctx.font = 'bold 11px Arial, sans-serif'
          ctx.fillStyle = DARK_TEXT
          meta.data.forEach(function(bar, j) {
            var value = fmtInt(dataset.data[j])
            var metrics = ctx.measureText(value)
            var canvasWidth = chart.width
            var minX = metrics.width / 2 + 8
            var maxX = canvasWidth - metrics.width / 2 - 8
            var labelX = Math.min(Math.max(bar.x, minX), maxX)
            ctx.fillText(value, labelX, bar.y - 6)
          })
          ctx.restore()
        },
      }],
    })
    maybeDone()
  }

  function drawHorizontal(canvasId, items, cor) {
    var el = document.getElementById(canvasId)
    if (!el) { maybeDone(); return }
    if (!items || !items.length) { maybeDone(); return }
    var labels = items.map(function(d){return trunc(d.label, 12)})
    var valores = items.map(function(d){return d.valor})
    var maxVal = Math.max.apply(null, valores.concat([1]))
    new Chart(el, {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: 'Litros', data: valores, backgroundColor: cor, borderRadius: 4, borderSkipped: false, barPercentage: 0.5, categoryPercentage: 0.7 }] },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false, animation: false,
        layout: { padding: { top: 18, right: 95, bottom: 25, left: 22 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            beginAtZero: true,
            suggestedMax: maxVal * 1.15,
            ticks: { color: DARK_TEXT, font: { size: 10 } },
            grid: { color: '#E5E7EB' },
          },
          y: {
            ticks: { color: DARK_TEXT, font: { size: 11 }, callback: function(value) { var lbl = this.getLabelForValue(value); return trunc(lbl, 12) } },
            grid: { display: false },
          },
        },
      },
      plugins: [{
        id: 'dataLabels',
        afterDatasetsDraw: function(chart) {
          var ctx = chart.ctx
          var meta = chart.getDatasetMeta(0)
          var dataset = chart.data.datasets[0]
          ctx.save()
          ctx.textAlign = 'left'
          ctx.font = 'bold 10px Arial, sans-serif'
          ctx.fillStyle = DARK_TEXT
          meta.data.forEach(function(bar, j) {
            var value = fmtInt(dataset.data[j])
            ctx.fillText(value, bar.x + 4, bar.y + 3)
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
  charts.forEach(function(entry) {
    if (entry.kind === 'vertical') drawVertical(entry.canvasId, entry.items, entry.color)
    else if (entry.kind === 'horizontal') drawHorizontal(entry.canvasId, entry.items, entry.color)
    else maybeDone()
  })
})();
`

function pillsHtml(filtros) {
  const pills = []
  if (filtros.maquinas && filtros.maquinas.length > 0) {
    pills.push({
      label: 'Máquinas',
      value: filtros.maquinas.length === 1 ? filtros.maquinas[0] : `${filtros.maquinas.length} selecionadas`,
    })
  }
  if (filtros.combustiveis && filtros.combustiveis.length > 0) {
    pills.push({
      label: 'Combustíveis',
      value: filtros.combustiveis.length === 1 ? filtros.combustiveis[0] : `${filtros.combustiveis.length} selecionados`,
    })
  }
  if (filtros.operacoes && filtros.operacoes.length > 0) {
    pills.push({
      label: 'Operações',
      value: filtros.operacoes.length === 1 ? filtros.operacoes[0] : `${filtros.operacoes.length} selecionadas`,
    })
  }
  if (pills.length === 0) {
    return `<div class="pills-row"><div class="abast-pill"><div class="pill-value">Sem filtros (todos os dados)</div><div class="pill-label">Filtros</div></div></div>`
  }
  return `<div class="pills-row">${pills
    .map((p) => `<div class="abast-pill"><div class="pill-value">${escapeHtml(p.value)}</div><div class="pill-label">${escapeHtml(p.label)}</div></div>`)
    .join('')}</div>`
}

function kpisHtml(dados) {
  const maiorConsumidor = dados.porMaquina.length > 0 ? dados.porMaquina[0].label : '—'
  const cards = [
    { value: `${intFmtLocale(dados.totalLitros)} L`, label: 'Total Litros' },
    { value: intFmtLocale(dados.totalRegistros), label: 'Registros' },
    { value: maiorConsumidor.length > 12 ? maiorConsumidor.substring(0, 11) + '…' : maiorConsumidor, label: 'Maior Consumidor' },
    { value: intFmtLocale(dados.porMaquina.length), label: 'Máquinas' },
    { value: intFmtLocale(dados.porCombustivel.length), label: 'Combustíveis' },
    { value: intFmtLocale(dados.porOperacao.length), label: 'Operações' },
  ]
  return `<div class="kpi-col">${cards.map((c) => kpi(c.value, c.label)).join('')}</div>`
}

function detailTable1Html(detalhes, totalLitros, totalRegistros) {
  const header = `<thead><tr><th>Máquina/Veículo</th><th>Litros</th><th>% Total</th><th>Nº abast.</th><th>Média (L)</th><th>Maior (L)</th><th>Período</th><th>Combustíveis</th></tr></thead>`
  const rows = detalhes
    .map((d) => {
      const pct = totalLitros > 0 ? (d.totalLitros / totalLitros) * 100 : 0
      const periodo = `${dateShortFmt(d.primeiraData)}-${dateShortFmt(d.ultimaData)}`
      return `<tr><td>${escapeHtml(d.maquina)}</td><td class="numeric">${intFmtLocale(d.totalLitros)} L</td><td class="numeric">${numFmt(pct, 1)}%</td><td class="numeric">${intFmtLocale(d.numAbastecimentos)}</td><td class="numeric">${intFmtLocale(d.mediaLitros)}</td><td class="numeric">${intFmtLocale(d.maiorAbastecimento)}</td><td>${escapeHtml(periodo)}</td><td>${escapeHtml(d.combustiveis.join(', ') || '—')}</td></tr>`
    })
    .join('')
  const totalRow = `<tr class="total-row"><td>Total</td><td class="numeric">${intFmtLocale(totalLitros)} L</td><td class="numeric">100%</td><td class="numeric">${intFmtLocale(totalRegistros)}</td><td></td><td></td><td></td><td></td></tr>`
  return `<table class="detail-table">${header}<tbody>${rows}${totalRow}</tbody></table>`
}

function detailTable2Html(detalhes) {
  const header = `<thead><tr><th>Máquina/Veículo</th><th>Operador(es)</th><th>Placa(s)</th></tr></thead>`
  const rows = detalhes
    .map(
      (d) =>
        `<tr><td>${escapeHtml(d.maquina)}</td><td>${escapeHtml(d.operadores.join(', ') || '—')}</td><td>${escapeHtml(d.placas.join(', ') || '—')}</td></tr>`,
    )
    .join('')
  return `<table class="oper-table">${header}<tbody>${rows}</tbody></table>`
}

function chunkArray(arr, size) {
  if (arr.length <= size) return [arr]
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

async function renderAbastecimentoHtml(input) {
  const { titulo, fazendaNome, logoGestao, logoFazenda, filtros, porMaquina, porCombustivel, porOperacao, totalLitros, totalRegistros, detalhesPorMaquina } = input
  const brand = { logoGestao, logoFazenda, fazendaNome }
  const period = { dataInicio: filtros.dataInicio, dataFim: filtros.dataFim }

  // Normaliza os labels das maquinas: abrevia a marca e junta com o modelo.
  // Mantem o label original como fallback quando marca/modelo nao sao enviados.
  const porMaquinaFmt = porMaquina.map((item) => ({
    ...item,
    label: montarLabelMaquina(item),
  }))
  const detalhesPorMaquinaFmt = detalhesPorMaquina.map((item) => ({
    ...item,
    maquina: montarLabelMaquina(item),
  }))

  // Pré-calcula páginas de tabelas para saber o total antes de montar (footer
  // mostra "Página X de Y" com Y dinâmico, como no morte e consumo).
  // Layout: página 1 = gráfico principal + KPIs; página 2 = gráficos
  // combustível e operação; páginas 3+ = tabelas de detalhamento.
  const chunks1 = detalhesPorMaquinaFmt.length === 0 ? [[]] : chunkArray(detalhesPorMaquinaFmt, DETAIL_ROWS_PER_PAGE)
  const chunks2 = detalhesPorMaquinaFmt.length === 0 ? [[]] : chunkArray(detalhesPorMaquinaFmt, DETAIL_ROWS_PER_PAGE)
  const totalPages = 2 + chunks1.length + chunks2.length

  const chartsData = [
    { canvasId: 'chart-maquina', kind: 'vertical', items: porMaquinaFmt, color: '#0F6437' },
    { canvasId: 'chart-combustivel', kind: 'horizontal', items: porCombustivel, color: '#1E3A5F' },
    { canvasId: 'chart-operacao', kind: 'horizontal', items: porOperacao, color: '#0F6437' },
  ]

  // Página 1: gráfico principal (Litros por Máquina) + KPIs laterais
  const page1 = pageSection(`
    ${renderHeader({ ...brand, reportTitle: titulo, section: 'Visão geral', sectionLabel: 'Resumo' })}
    <p class="section-kicker">Consumo de combustível</p>
    <div class="period-badge">${dateFmt(filtros.dataInicio) || 'Início'} <span style="padding:0 7px;color:#9bb1a4">até</span> ${dateFmt(filtros.dataFim) || 'Hoje'}</div>
    ${pillsHtml(filtros)}
    <div class="abast-body">
      ${kpisHtml({ ...input, porMaquina: porMaquinaFmt })}
      <div class="charts-col" style="gap:0">
        ${chartCard({ canvasId: 'chart-maquina', title: 'Litros por Máquina/Veículo', subtitle: 'Distribuição total no período', hasData: porMaquina.length > 0, height: '120mm' })}
      </div>
    </div>
    ${renderFooter({ ...period, page: 1, totalPages })}
  `)

  // Página 2: gráficos de Combustível e Operação lado a lado
  const page2 = pageSection(`
    ${renderHeader({ ...brand, reportTitle: titulo, section: 'Combustível e Operação', sectionLabel: 'Análise cruzada' })}
    <p class="section-kicker">Por tipo</p>
    <div class="chart-pair">
      ${chartCard({ canvasId: 'chart-combustivel', title: 'Litros por Combustível', subtitle: 'Distribuição por tipo de combustível', hasData: porCombustivel.length > 0, height: '100%' })}
      ${chartCard({ canvasId: 'chart-operacao', title: 'Litros por Operação', subtitle: 'Distribuição por tipo de operação', hasData: porOperacao.length > 0, height: '100%' })}
    </div>
    ${renderFooter({ ...period, page: 2, totalPages })}
  `)

  // Páginas de Detalhamento por Máquina (tabela 1)
  const detail1Pages = chunks1
    .map((chunk, chunkIndex) => {
      const startRow = chunkIndex * DETAIL_ROWS_PER_PAGE
      const isLast = chunkIndex === chunks1.length - 1
      const suffix = chunks1.length > 1 ? ` (${chunkIndex + 1}/${chunks1.length})` : ''
      const content = chunk.length
        ? `<div class="table-block"><h2 class="table-title">Detalhamento por Máquina/Veículo <span>${detalhesPorMaquinaFmt.length} máquina(s)${chunks1.length > 1 ? ` · exibindo ${startRow + 1}–${startRow + chunk.length}` : ''}</span></h2>${detailTable1Html(chunk, isLast ? totalLitros : 0, isLast ? totalRegistros : 0)}</div>`
        : '<div class="empty-chart" style="height:40mm">Nenhum registro de abastecimento no período</div>'
      return pageSection(`
        ${renderHeader({ ...brand, reportTitle: titulo, section: `Detalhamento${suffix}`, sectionLabel: 'Tabela' })}
        <p class="section-kicker">Detalhamento por máquina</p>
        ${content}
        ${renderFooter({ ...period, page: 3 + chunkIndex, totalPages })}
      `)
    })
    .join('')

  // Páginas de Detalhamento Operacional (tabela 2)
  const detail2Pages = chunks2
    .map((chunk, chunkIndex) => {
      const startRow = chunkIndex * DETAIL_ROWS_PER_PAGE
      const suffix = chunks2.length > 1 ? ` (${chunkIndex + 1}/${chunks2.length})` : ''
      const content = chunk.length
        ? `<div class="table-block"><h2 class="table-title">Detalhamento Operacional <span>${detalhesPorMaquinaFmt.length} máquina(s)${chunks2.length > 1 ? ` · exibindo ${startRow + 1}–${startRow + chunk.length}` : ''}</span></h2>${detailTable2Html(chunk)}</div>`
        : '<div class="empty-chart" style="height:40mm">Nenhum registro de abastecimento no período</div>'
      return pageSection(`
        ${renderHeader({ ...brand, reportTitle: titulo, section: `Operacional${suffix}`, sectionLabel: 'Tabela' })}
        <p class="section-kicker">Operadores e placas</p>
        ${content}
        ${renderFooter({ ...period, page: 3 + chunks1.length + chunkIndex, totalPages })}
      `)
    })
    .join('')

  const chartJsScript = await getChartJsScript()
  return htmlDocument({
    title: titulo,
    extraCss: ABASTECIMENTO_CSS,
    body: `${page1}${page2}${detail1Pages}${detail2Pages}`,
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
  if (!isPDFData(body) || body.detalhesPorMaquina.length > MAX_MAQUINAS) {
    return res.status(400).json({ error: 'Payload de relatório inválido ou grande demais' })
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Payload do relatório excede o limite permitido' })
  }

  try {
    console.log('[PDF Abastecimento] Iniciando renderização. Máquinas:', body.detalhesPorMaquina.length, 'Litros:', body.totalLitros)
    const html = await renderAbastecimentoHtml(body)
    console.log('[PDF Abastecimento] HTML montado. Bytes:', Buffer.byteLength(html, 'utf8'))
    const pdf = await generatePdf({
      html,
      format: 'A4',
      landscape: true,
      beforePdf: async (page) => {
        await page.waitForFunction('window.__chartsReady === true', { timeout: 15000 }).catch(() => {})
      },
    })
    console.log('[PDF Abastecimento] PDF gerado. Bytes:', pdf.length)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-abastecimento.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PDF-Renderer', 'puppeteer')
    return res.status(200).send(pdf)
  } catch (error) {
    console.error('[PDF Abastecimento] Erro ao gerar relatório:', error)
    console.error('[PDF Abastecimento] Stack:', error?.stack || 'sem stack')
    return res.status(500).json({ error: 'Não foi possível gerar o PDF', detail: String(error) })
  }
}
