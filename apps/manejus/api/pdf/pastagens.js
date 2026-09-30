// Endpoint do relatório de Manejo de Pastagens. Mesmo padrão do
// rodeio.js: só existe aqui o que é específico deste relatório (KPIs +
// gráficos na página 1, alertas + taxa de lotação na página 2, resumo por
// pasto, histórico de ocupação e detalhamento das movimentações). Toda a
// infraestrutura (Chrome, Chart.js, template base, formatadores, labels de
// diagnóstico) vem do _shared/.
//
// Estrutura:
//  - Página 1: KPIs + faixa de alertas + Gantt "mapa de ocupação" por
//    pasto (barras flutuantes entrada→saída; vazios = descanso).
//  - Página 2: página de análise em L — coluna esquerda com a tabela
//    "Condição na entrada e na saída" (excedente pagina), coluna
//    direita com os gráficos "Taxa de lotação" e "Descanso entre
//    ocupações". Alertas têm página(s) próprias em seguida.
//  - Página 3: tabela "Resumo por pasto" (movimentações + ocupação + UA/ha).
//  - Página 4+: tabela "Histórico de ocupação" (períodos que intersectam o
//    intervalo, incluindo ocupações ainda abertas).
//  - Últimas páginas: tabela "Movimentações detalhadas" pre-chunked.

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
const MAX_OCUPACOES = 50000
const MAX_BODY_BYTES = 12_000_000

// Linhas por página (A4 landscape, ~140mm úteis). O detalhamento usa 12
// porque registros com vários alertas esticam a linha; acima disso a
// última linha era cortada pelo rodapé.
const DETAIL_ROWS_PER_PAGE = 9
const OCUPACAO_ROWS_PER_PAGE = 16
const PASTO_ROWS_PER_PAGE = 18

// Alertas têm página própria depois da página de análise visual.
const ALERTAS_ROWS_PAGE = 24
// Tabela de condição: a coluna esquerda da página 2 comporta 20
// linhas com folga; o excedente pagina em páginas de continuação.
const CONDICAO_ROWS_P2 = 20
const CONDICAO_ROWS_PAGE = 22

const CATEGORIAS = [
  { key: 'vaca', label: 'Vacas', short: 'Vac' },
  { key: 'touro', label: 'Touros', short: 'Tou' },
  { key: 'bezerro', label: 'Bezerros', short: 'Bez' },
  { key: 'boi_magro', label: 'Bois magros', short: 'Boi' },
  { key: 'garrote', label: 'Garrotes', short: 'Gar' },
  { key: 'novilha', label: 'Novilhas', short: 'Nov' },
]

// "Carlos Henrique Schemmer" -> "Carlos H."
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
  if (!Array.isArray(value.ocupacoes)) return false
  return true
}

// CSS específico de pastagens: header compacto, gráficos lado a lado,
// faixa de alertas e tabelas densas no padrão do rodeio.
const PASTAGENS_CSS = `
.report-header{height:16mm;margin-bottom:4mm;padding-bottom:3mm}
.brand-logo{width:44px;height:44px}
.report-title{font-size:22px}
.farm-logo{max-height:56px;max-width:120px}
.page{display:flex;flex-direction:column}
.past-content{flex:1;display:flex;flex-direction:column;min-height:0}
.past-gantt-wrap{flex:1;min-height:0;display:flex;flex-direction:column}
.past-gantt-wrap .chart-card{flex:1;min-height:0}
.gantt-legend{display:flex;gap:14px;font-size:9px;color:#6B7280;margin-top:4px}
.gantt-dot{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.gantt-hatch{border:1px solid #c28a27;background:repeating-linear-gradient(45deg,transparent 0,transparent 2px,#c28a27 2px,#c28a27 4px)}
.past-quad{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:8px}
.past-quad .chart-card{height:auto;min-height:0}
.past-quad .past-tall{grid-row:1/-1;display:flex;flex-direction:column;min-height:0}
.past-quad .past-tall > .chart-card{flex:1;min-height:0}
.past-quad .past-tall .past-condicao{flex:1;min-height:0;overflow:hidden}
.past-condicao .table-block{display:flex;flex-direction:column;height:100%}
.past-alertas-mini{border:1px solid #efd8d6;border-left:3px solid #c94d46;border-radius:0 5px 5px 0;background:#fdf6f5;padding:6px 10px;margin-bottom:3mm}
.past-alertas-mini .am-title{color:#c94d46;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:3px}
.past-alertas-mini .am-item{font-size:11px;color:#7a4a45;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.past-alertas-mini .am-item b{color:#b03a33}
.past-alertas-mini .am-more{font-size:10px;color:#a08a86;margin-top:2px}
.past-alertas-table td{font-size:10px;padding:4px 5px;line-height:1.3}
.past-alertas-table th{font-size:10px;padding:5px}
.past-resumo-wrap{margin-top:6mm}
.past-resumo-table td, .past-detail-table td, .past-ocupacao-table td, .past-condicao-table td{font-size:11px;padding:5px 4px;line-height:1.25}
.past-resumo-table th, .past-detail-table th, .past-ocupacao-table th, .past-condicao-table th{font-size:10px;padding:5px 4px}
.past-resumo-table th, .past-resumo-table td,
.past-detail-table th, .past-detail-table td,
.past-ocupacao-table th, .past-ocupacao-table td,
.past-condicao-table th, .past-condicao-table td{border-right:1px solid #d8e0db}
.past-resumo-table th:last-child, .past-resumo-table td:last-child,
.past-detail-table th:last-child, .past-detail-table td:last-child,
.past-ocupacao-table th:last-child, .past-ocupacao-table td:last-child,
.past-condicao-table th:last-child, .past-condicao-table td:last-child{border-right:none}
.past-resumo-table tbody tr:nth-child(even), .past-detail-table tbody tr:nth-child(even), .past-ocupacao-table tbody tr:nth-child(even), .past-condicao-table tbody tr:nth-child(even){background:#f7faf8}
.past-alerta{display:block;color:#c94d46;font-weight:600;line-height:1.3}
.past-alerta-obs{display:block;color:#8a9890;font-weight:400;font-size:9px}
.past-anomalia{color:#c94d46;font-weight:600}
.past-melhora{color:#0F6437;font-weight:600}
.past-composicao{font-size:10px;color:#4f5f56}
.past-equipe{font-size:10px;color:#4f5f56}
.past-detail-table td{overflow-wrap:break-word;word-break:normal}
.past-alertas-table td{overflow-wrap:break-word;word-break:normal}
.past-status{display:inline-block;font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px}
.past-status.aberto{background:#e2f3e7;color:#0F6437}
.past-status.fechado{background:#eef1f0;color:#5b6b63}
`

// Script rodado dentro do Chromium headless. Kinds suportados:
// 'gantt' (mapa de ocupação: barras flutuantes entrada→saída por pasto),
// 'descanso' (dias sem gado entre ocupações) e 'uaPasto' (UA/ha por
// pasto com linha da média da fazenda).
const CHARTS_INIT_JS = `
(function(){
  var DARK_TEXT = '#1F2937'
  var MEDIUM_TEXT = '#6B7280'
  var GREEN = '#0F6437'
  var GOLD = '#c28a27'
  var RED = '#c94d46'
  var BLUE = '#1E3A5F'
  var Chart = window.Chart
  if (!Chart) { window.__chartsReady = true; return }
  Chart.defaults.animation = false
  // Sem isso o canvas rasteriza na resolução CSS (~96dpi) e pixela no
  // zoom do PDF. 3x mantém o tamanho visual e triplica a densidade.
  Chart.defaults.devicePixelRatio = 3
  Chart.defaults.font.family = 'Arial, Helvetica, sans-serif'

  var charts = (window.__reportData && window.__reportData.charts) || []

  // Trunca nomes de pasto preservando o sufixo ("2A", "B1"), que é o
  // que distingue pastos do mesmo bloco ("Belito de Cima 2A" vs "2D").
  function truncNome(label, max) {
    label = String(label || '')
    if (label.length <= max) return label
    var ultimo = label.split(' ').pop()
    var sufixo = ultimo && ultimo.length <= 4 && label.length > ultimo.length ? ' ' + ultimo : ''
    var keep = Math.max(4, max - 1 - sufixo.length)
    return label.slice(0, keep).trimEnd() + '…' + sufixo
  }

  // epoch-day -> 'dd/mm' (o eixo x do Gantt é linear, em dias desde epoch)
  function fmtDia(diaEpoch) {
    var d = new Date(diaEpoch * 86400000)
    var dd = ('0' + d.getUTCDate()).slice(-2)
    var mm = ('0' + (d.getUTCMonth() + 1)).slice(-2)
    return dd + '/' + mm
  }

  // Gantt de ocupação: uma linha por pasto, cada janela entrada→saída
  // é uma barra flutuante ([min,max] no eixo linear de dias epoch).
  // Em andamento = barra sólida; encerrada = hachura diagonal. Cor E
  // padrão codificam o estado juntos: na impressão P&B a distinção
  // cheio vs listrado continua legível sem depender de cor.
  function drawGantt(el, entry) {
    var m = entry.mapa
    if (!m || !m.pts || !m.pts.length) return
    // Tile 8x8 com diagonais; tile transparente, o traço é a cor do status.
    var tile = document.createElement('canvas')
    tile.width = 8
    tile.height = 8
    var tp = tile.getContext('2d')
    tp.strokeStyle = GOLD
    tp.lineWidth = 2
    tp.beginPath()
    tp.moveTo(-2, 2)
    tp.lineTo(2, -2)
    tp.moveTo(0, 8)
    tp.lineTo(8, 0)
    tp.moveTo(6, 10)
    tp.lineTo(10, 6)
    tp.stroke()
    var hatch = el.getContext('2d').createPattern(tile, 'repeat')
    new Chart(el, {
      type: 'bar',
      data: {
        labels: m.labels,
        datasets: [{
          data: m.pts,
          backgroundColor: m.pts.map(function(p){ return p.aberta ? BLUE : hatch }),
          borderColor: m.pts.map(function(p){ return p.aberta ? BLUE : GOLD }),
          borderWidth: m.pts.map(function(p){ return p.aberta ? 0 : 1.5 }),
          borderRadius: 2,
          borderSkipped: false,
          barPercentage: 0.8,
          categoryPercentage: 0.8,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 6, right: 10, bottom: 4, left: 4 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            min: m.min,
            max: m.max,
            grid: { color: '#E5E7EB' },
            ticks: {
              color: MEDIUM_TEXT,
              font: { size: 9 },
              maxTicksLimit: 8,
              callback: function(v) { return fmtDia(v) },
            },
          },
          y: {
            grid: { display: false },
            ticks: {
              color: DARK_TEXT,
              font: { size: 9 },
              autoSkip: false,
              callback: function(v) {
                var label = this.getLabelForValue(v) || ''
                return truncNome(label, 15)
              },
            },
          },
        },
      },
      plugins: [{
        id: 'ganttRows',
        // Fundo zebrado por linha: guia o olho do rótulo do pasto até
        // a barra sem precisar de grade horizontal.
        beforeDatasetsDraw: function(chart) {
          var ctx = chart.ctx
          var y = chart.scales.y
          var area = chart.chartArea
          if (m.labels.length < 2) return
          var half = Math.abs(y.getPixelForValue(1) - y.getPixelForValue(0)) / 2
          ctx.save()
          ctx.fillStyle = '#F3F6F4'
          for (var i = 0; i < m.labels.length; i += 2) {
            var cy = y.getPixelForValue(i)
            ctx.fillRect(area.left, Math.max(area.top, cy - half), area.right - area.left, Math.min(area.bottom, cy + half) - Math.max(area.top, cy - half))
          }
          ctx.restore()
        },
        // Sigla do lote dentro da barra quando ela é larga o suficiente —
        // o PDF não tem tooltip, então essa é a única forma de saber qual
        // lote está em cada janela. Branco sobre o azul sólido; escuro
        // sobre a hachura, que tem faixas claras.
        afterDatasetsDraw: function(chart) {
          var ctx = chart.ctx
          var meta = chart.getDatasetMeta(0)
          ctx.save()
          ctx.font = 'bold 7px Arial, sans-serif'
          ctx.textAlign = 'left'
          meta.data.forEach(function(bar, j) {
            var pt = m.pts[j]
            var lote = pt && pt.lote
            if (!lote || (bar.width || 0) < 40) return
            var txt = String(lote)
            var tw = ctx.measureText(txt).width
            if (txt.length > 12) { txt = txt.slice(0, 11) + '…'; tw = ctx.measureText(txt).width }
            var x0 = bar.x - bar.width / 2 + 3
            var x1 = x0 + tw
            if (x1 > chart.chartArea.right - 2) x1 = chart.chartArea.right - 2
            ctx.fillStyle = pt.aberta ? '#fff' : DARK_TEXT
            ctx.fillText(txt, x1 - tw, bar.y + 2)
          })
          ctx.restore()
        },
      }],
    })
  }

  // Condição do pasto na entrada × saída: duas barras por pasto (1-5).
  // A agregação entrega ordenado pela pior saída, que é quem precisa de
  // mais descanso. A linha tracejada marca a referência "3".
  // Condição entrada×saída virou tabela (condicaoTableHtml): com muitos
  // pastos, barras lado a lado eram menos legíveis que colunas
  // numéricas com a variação explícita.

  // Descanso: dias médios sem gado entre ocupações consecutivas do
  // mesmo pasto, ordenado do mais apertado para o mais folgado.
  function drawDescanso(el, entry) {
    var itens = entry.itens || []
    if (!itens.length) return
    new Chart(el, {
      type: 'bar',
      data: {
        labels: itens.map(function(p){ return p.nome }),
        datasets: [{
          data: itens.map(function(p){ return p.descanso_medio }),
          backgroundColor: GREEN,
          borderRadius: 2,
          borderSkipped: false,
          barPercentage: 0.7,
          categoryPercentage: 0.75,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 6, right: 26, bottom: 4, left: 4 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            beginAtZero: true,
            title: { display: true, text: 'dias', color: DARK_TEXT, font: { size: 10, weight: 'bold' } },
            grid: { color: '#E5E7EB' },
            ticks: { color: MEDIUM_TEXT, font: { size: 9 }, precision: 0 },
          },
          y: {
            grid: { display: false },
            ticks: {
              color: DARK_TEXT,
              font: { size: 9 },
              autoSkip: false,
              callback: function(v) {
                var label = this.getLabelForValue(v) || ''
                return truncNome(label, 13)
              },
            },
          },
        },
      },
      plugins: [{
        id: 'descansoLabels',
        afterDatasetsDraw: function(chart) {
          var ctx = chart.ctx
          var meta = chart.getDatasetMeta(0)
          ctx.save()
          ctx.textAlign = 'left'
          ctx.font = 'bold 8px Arial, sans-serif'
          ctx.fillStyle = DARK_TEXT
          meta.data.forEach(function(bar, j) {
            var v = Number(itens[j].descanso_medio)
            if (!isFinite(v)) return
            ctx.fillText(v.toFixed(0) + 'd', bar.x + 3, bar.y + 3)
          })
          ctx.restore()
        },
      }],
    })
  }

  function drawUaPasto(el, entry) {
    var itens = entry.itens || []
    if (!itens.length) return
    new Chart(el, {
      type: 'bar',
      data: {
        labels: itens.map(function(p){ return p.nome }),
        datasets: [{
          label: 'UA/ha',
          data: itens.map(function(p){ return p.ua_ha_media }),
          backgroundColor: BLUE,
          borderRadius: 3,
          borderSkipped: false,
          barPercentage: 0.75,
          categoryPercentage: 0.7,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 16, right: 8, bottom: 4, left: 4 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: MEDIUM_TEXT,
              font: { size: 9 },
              autoSkip: false,
              maxRotation: 45,
              callback: function(val) {
                var label = this.getLabelForValue(val) || ''
                return truncNome(label, 10)
              },
            },
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'UA/ha', color: DARK_TEXT, font: { size: 11, weight: 'bold' } },
            ticks: { color: MEDIUM_TEXT, font: { size: 10 } },
            grid: { color: '#E5E7EB' },
          },
        },
      },
      plugins: [{
        id: 'uaLabels',
        afterDatasetsDraw: function(chart) {
          var ctx = chart.ctx
          var meta = chart.getDatasetMeta(0)
          var media = Number(entry.media)
          ctx.save()
          // Linha da média da fazenda: sem referência as barras de UA/ha
          // não dizem se estão altas ou baixas.
          if (isFinite(media) && media > 0) {
            var ym = chart.scales.y.getPixelForValue(media)
            ctx.strokeStyle = '#9ca3af'
            ctx.setLineDash([3, 3])
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(chart.chartArea.left, ym)
            ctx.lineTo(chart.chartArea.right, ym)
            ctx.stroke()
            ctx.setLineDash([])
            ctx.font = '7px Arial, sans-serif'
            ctx.fillStyle = MEDIUM_TEXT
            ctx.textAlign = 'right'
            var label = 'média ' + media.toFixed(2).replace('.', ',')
            ctx.fillText(label, chart.chartArea.right - 2, chart.chartArea.top + 6)
          }
          ctx.textAlign = 'center'
          ctx.font = 'bold 8px Arial, sans-serif'
          ctx.fillStyle = DARK_TEXT
          meta.data.forEach(function(bar, j) {
            var v = Number(itens[j].ua_ha_media)
            if (!v) return
            ctx.fillText(v.toFixed(2).replace('.', ','), bar.x, bar.y - 3)
          })
          ctx.restore()
        },
      }],
    })
  }

  charts.forEach(function(entry) {
    var el = document.getElementById(entry.canvasId)
    if (!el) return
    if (entry.kind === 'gantt') drawGantt(el, entry)
    else if (entry.kind === 'descanso') drawDescanso(el, entry)
    else if (entry.kind === 'uaPasto') drawUaPasto(el, entry)
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
// avaliacao_geral usa as mesmas chaves/semântica S/N do diagnosticos do
// rodeio, então rodeioAlertas serve direto.
function listaAlertas(registros) {
  const itens = []
  const norm = (label) => String(label).replace(/\//g, '/\u200B')
  for (const r of registros) {
    for (const a of rodeioAlertas(r.avaliacao_geral)) {
      itens.push({
        data: r.data,
        trajeto: `${r.pasto_saida || '—'} → ${r.pasto_entrada || '—'}`,
        lote: r.lote || '—',
        label: norm(a.label),
        observacao: a.observacao || '',
      })
    }
  }
  return itens.sort((a, b) => String(b.data).localeCompare(String(a.data)))
}

// Gantt do rotativo: linhas por pasto com as janelas de ocupação
// (duplicata em JS de mapaOcupacaoPorPasto do agregacao.ts; o endpoint
// não importa TS). pts em epoch-day para o eixo linear do Chart.js e
// ocupações abertas terminam em dataFim. maxPastos baixo proposital:
// acima de ~10 linhas os rótulos se sobrepõem na área restante da pág. 1.
function mapaOcupacao(ocupacoes, dataFim, maxPastos = 10) {
  const porPasto = new Map()
  let min = null
  let max = null
  for (const o of ocupacoes) {
    if (!o.pasto || !o.data_entrada) continue
    const inicio = String(o.data_entrada).slice(0, 10)
    let fim = String(o.data_saida || dataFim || inicio).slice(0, 10)
    if (fim < inicio) fim = inicio
    const arr = porPasto.get(o.pasto) || []
    arr.push({ inicio, fim, lote: o.lote || null, aberta: !!o.em_andamento })
    porPasto.set(o.pasto, arr)
    if (!min || inicio < min) min = inicio
    if (!max || fim > max) max = fim
  }
  const toDay = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86400000)
  // Ordena do mais usado para o menos usado (dias com gado no período),
  // desempatando pela ocupação mais recente.
  const todas = [...porPasto.entries()]
    .map(([pasto, barras]) => ({
      pasto,
      barras: barras.sort((a, b) => a.inicio.localeCompare(b.inicio)),
      dias: 0,
    }))
  for (const l of todas) {
    l.dias = l.barras.reduce((s, b) => s + Math.max(0, toDay(b.fim) - toDay(b.inicio) + 1), 0)
  }
  todas.sort((a, b) => b.dias - a.dias || b.barras[b.barras.length - 1].fim.localeCompare(a.barras[a.barras.length - 1].fim))
  const linhas = todas.slice(0, maxPastos)
  const pts = []
  for (const linha of linhas) {
    for (const b of linha.barras) {
      pts.push({ x: [toDay(b.inicio), toDay(b.fim) + 1], y: linha.pasto, lote: b.lote, aberta: b.aberta })
    }
  }
  return {
    labels: linhas.map((l) => l.pasto),
    pts,
    min: min ? toDay(min) : 0,
    max: max ? toDay(max) + 1 : 1,
    omitidos: todas.length - linhas.length,
  }
}

// "1 pasto" / "5 pastos" sem o padrão "(s)" que entrega relatório
// gerado por sistema.
function pl(n, singular, plural) {
  return n === 1 ? singular : plural
}

// Faixa compacta na página 1: os 3 alertas mais recentes + quanto resta.
function alertasMiniHtml(itens) {
  if (!itens.length) return ''
  const linhas = itens
    .slice(0, 3)
    .map(
      (a) =>
        `<div class="am-item"><b>${dateFmt(a.data)}</b> · ${escapeHtml(a.trajeto)} · ${escapeHtml(a.label)}${a.observacao ? ` — <i>${escapeHtml(a.observacao)}</i>` : ''}</div>`,
    )
    .join('')
  const restoN = itens.length - 3
  const resto = itens.length > 3 ? `<div class="am-more">+ ${restoN} ${pl(restoN, 'alerta listado', 'alertas listados')} em Diagnósticos</div>` : ''
  return `<div class="past-alertas-mini"><div class="am-title">Alertas do período (${itens.length})</div>${linhas}${resto}</div>`
}

function alertasTableHtml(itens, total = itens.length) {
  if (!total) {
    return `<div class="table-block"><h3 class="table-title">Alertas do período<span>0 alertas</span></h3><p style="font-size:12px;color:#7a8981;margin:0">Nenhum diagnóstico fora do padrão foi registrado nas movimentações do período.</p></div>`
  }
  const cols = [
    ['Data', '10%'],
    ['Trajeto', '24%'],
    ['Lote', '20%'],
    ['Diagnóstico', '20%'],
    ['Observação', '26%'],
  ]
  const rows = itens
    .map(
      (a) =>
        `<tr><td>${dateFmt(a.data)}</td><td>${escapeHtml(a.trajeto)}</td><td>${escapeHtml(a.lote)}</td><td><span class="past-alerta">${escapeHtml(a.label)}</span></td><td>${a.observacao ? escapeHtml(a.observacao) : '—'}</td></tr>`,
    )
    .join('')
  return `<div class="table-block"><h3 class="table-title">Alertas do período<span>${total} ${pl(total, 'alerta', 'alertas')}</span></h3><table class="past-alertas-table">${tableHeadHtml(cols)}<tbody>${rows}</tbody></table></div>`
}

// Resumo por pasto: movimentações (entradas/saídas, avaliação média) +
// ocupação (dias média, UA/ha, desvio da meta) + alertas. Colunas que
// sairiam 100% vazias no período (módulo sem vínculo, desvio sem meta)
// são omitidas para não desperdiçar largura.
// Condição na entrada e na saída por pasto (avaliação 1–5), pior
// saída primeiro. Substituiu o gráfico de barras na página de análise:
// com muitos pastos, colunas numéricas com a variação explícita são
// mais legíveis que barras empilhadas lado a lado.
function condicaoTableHtml(itens, total = itens.length) {
  if (!total) {
    return `<div class="table-block"><h3 class="table-title">Condição na entrada e na saída<span>0 pastos</span></h3><p style="font-size:12px;color:#7a8981;margin:0">Nenhuma avaliação de condição registrada nas movimentações do período.</p></div>`
  }
  const cols = [
    ['Pasto', '36%'],
    ['Aval. entrada', '18%'],
    ['Aval. saída', '18%'],
    ['Variação', '16%'],
    ['Avaliações', '12%'],
  ]
  const fmt = (v) => (v != null ? numFmt(v, 1) : '—')
  const rows = itens
    .map((p) => {
      const saidaTd = p.avaliacao_saida_media != null
        ? `<td class="numeric${p.avaliacao_saida_media < 3 ? ' past-anomalia' : ''}">${numFmt(p.avaliacao_saida_media, 1)}</td>`
        : '<td class="numeric">—</td>'
      const deltaTd = p.delta != null
        ? `<td class="numeric${p.delta < 0 ? ' past-anomalia' : ' past-melhora'}">${p.delta > 0 ? '+' : ''}${numFmt(p.delta, 1)}</td>`
        : '<td class="numeric">—</td>'
      // n de avaliações: média sobre 1 leitura é ruído, sobre 5 é sinal.
      return `<tr><td>${escapeHtml(p.nome)}</td><td class="numeric">${fmt(p.avaliacao_entrada_media)}</td>${saidaTd}${deltaTd}<td class="numeric" style="color:#7a8981">${p.avaliacoes || '—'}</td></tr>`
    })
    .join('')
  return `<div class="table-block"><h3 class="table-title">Condição na entrada e na saída<span>${total} ${pl(total, 'pasto', 'pastos')}</span></h3><table class="past-condicao-table">${tableHeadHtml(cols)}<tbody>${rows}</tbody></table></div>`
}

function resumoPastoTableHtml(itens, total, semMovimentacao) {
  const temModulo = itens.some((p) => p.modulo)
  const temDesvio = itens.some((p) => p.desvio_medio_percent != null)
  const cols = [
    ['Pasto', temModulo && temDesvio ? '18%' : '24%'],
    ...(temModulo ? [['Módulo', '13%']] : []),
    ['Área (ha)', '8%'],
    ['Entradas', '8%'],
    ['Saídas', '7%'],
    ['Aval. média', '9%'],
    ['Ocup. (dias)', '10%'],
    ['UA/ha', '9%'],
    ...(temDesvio ? [['Desvio', '9%']] : []),
    ['Alertas', '9%'],
  ]
  const rows = itens
    .map((p) => {
      const desvioTd = temDesvio
        ? (p.desvio_medio_percent != null
          ? `<td class="numeric${p.desvio_medio_percent > 0 ? ' past-anomalia' : ''}">${numFmt(p.desvio_medio_percent, 0)}%</td>`
          : '<td class="numeric">—</td>')
        : ''
      const alertaTd = p.alertas > 0
        ? `<td class="numeric past-alerta">${intFmt(p.alertas)}</td>`
        : '<td class="numeric">—</td>'
      const diasTd = p.ocupacao_dias_media != null
        ? `<td class="numeric${p.ocupacao_dias_media < 0 ? ' past-anomalia' : ''}">${numFmt(p.ocupacao_dias_media, 1)}</td>`
        : '<td class="numeric">—</td>'
      const uaTd = p.ua_ha_media != null && p.ua_ha_media > 0 ? `<td class="numeric">${numFmt(p.ua_ha_media, 2)}</td>` : '<td class="numeric">—</td>'
      return `<tr><td>${escapeHtml(p.nome)}</td>${temModulo ? `<td>${escapeHtml(p.modulo || '—')}</td>` : ''}<td class="numeric">${p.area_util_ha != null ? numFmt(p.area_util_ha, 1) : '—'}</td><td class="numeric">${p.entradas || '—'}</td><td class="numeric">${p.saidas || '—'}</td><td class="numeric">${p.avaliacao_media != null ? numFmt(p.avaliacao_media, 1) : '—'}</td>${diasTd}${uaTd}${desvioTd}${alertaTd}</tr>`
    })
    .join('')
  const notaSemMov = semMovimentacao > 0
    ? `<p style="font-size:10px;color:#7a8981;margin:0 0 4px">${semMovimentacao} ${pl(semMovimentacao, 'pasto sem movimentação', 'pastos sem movimentação')} no período ${pl(semMovimentacao, 'aparece', 'aparecem')} apenas porque ${pl(semMovimentacao, 'tem', 'têm')} ocupação registrada.</p>`
    : ''
  return `<div class="table-block"><h3 class="table-title">Resumo por pasto<span>${total} ${pl(total, 'pasto', 'pastos')}</span></h3>${notaSemMov}<table class="past-resumo-table">${tableHeadHtml(cols)}<tbody>${rows}</tbody></table></div>`
}

// Histórico de ocupação: períodos que intersectam o intervalo. "Dias"
// para ocupações abertas é a contagem parcial até a data do relatório.
// Colunas sem nenhum valor no período (módulo, meta, desvio) são
// omitidas; dias negativos (saída antes da entrada, erro na fonte)
// saem em vermelho para não parecer cálculo errado do relatório.
function ocupacaoTableHtml(itens, total) {
  const temModulo = itens.some((o) => o.modulo)
  const temMeta = itens.some((o) => o.meta_ocupacao_dias != null)
  const temDesvio = itens.some((o) => o.desvio_percent != null)
  const cols = [
    ['Lote', '16%'],
    ['Pasto', '14%'],
    ...(temModulo ? [['Módulo', '11%']] : []),
    ['Entrada', '9%'],
    ['Saída', '9%'],
    ['Dias', '7%'],
    ['Cab.', '7%'],
    ['UA/ha', '8%'],
    ...(temMeta ? [['Meta', '7%']] : []),
    ...(temDesvio ? [['Desvio', '7%']] : []),
    ['Status', '8%'],
  ]
  const rows = itens
    .map((o) => {
      const desvioTd = temDesvio
        ? (o.desvio_percent != null
          ? `<td class="numeric${o.desvio_percent > 0 ? ' past-anomalia' : ''}">${numFmt(o.desvio_percent, 0)}%</td>`
          : '<td class="numeric">—</td>')
        : ''
      const metaTd = temMeta
        ? `<td class="numeric">${o.meta_ocupacao_dias != null ? `${intFmt(o.meta_ocupacao_dias)}d` : '—'}</td>`
        : ''
      const status = o.em_andamento
        ? '<span class="past-status aberto">ABERTA</span>'
        : '<span class="past-status fechado">ENCERRADA</span>'
      const diasTd = o.dias != null
        ? `<td class="numeric${o.dias < 0 ? ' past-anomalia' : ''}">${numFmt(o.dias, 1)}${o.dias < 0 ? '<span class="past-alerta-obs">saída &lt; entrada</span>' : ''}</td>`
        : '<td class="numeric">—</td>'
      const uaTd = o.taxa_lotacao_ua_ha != null && o.taxa_lotacao_ua_ha > 0 ? `<td class="numeric">${numFmt(o.taxa_lotacao_ua_ha, 2)}</td>` : '<td class="numeric">—</td>'
      return `<tr><td>${escapeHtml(o.lote || '—')}</td><td>${escapeHtml(o.pasto || '—')}</td>${temModulo ? `<td>${escapeHtml(o.modulo || '—')}</td>` : ''}<td>${dateFmt(o.data_entrada)}</td><td>${o.data_saida ? dateFmt(o.data_saida) : '—'}</td>${diasTd}<td class="numeric">${o.cabecas_entrada != null ? intFmt(o.cabecas_entrada) : '—'}</td>${uaTd}${metaTd}${desvioTd}<td>${status}</td></tr>`
    })
    .join('')
  return `<div class="table-block"><h3 class="table-title">Histórico de ocupação<span>${total} ${pl(total, 'período', 'períodos')}</span></h3><table class="past-ocupacao-table">${tableHeadHtml(cols)}<tbody>${rows}</tbody></table></div>`
}

function alertasCellHtml(registro) {
  const alertas = rodeioAlertas(registro.avaliacao_geral)
  if (!alertas.length) return '<td>—</td>'
  const html = alertas
    .map((a) => {
      const obs = a.observacao ? `<span class="past-alerta-obs">${escapeHtml(a.observacao)}</span>` : ''
      const label = escapeHtml(a.label).replace(/\//g, '/<wbr>')
      return `<span class="past-alerta">${label}</span>${obs}`
    })
    .join('')
  return `<td>${html}</td>`
}

// Composição em uma linha: só categorias com animais ("Bez 30 · Boi 12").
function composicaoHtml(r) {
  const partes = CATEGORIAS.map((c) => {
    const v = Number(r[c.key]) || 0
    return v > 0 ? `${c.short} ${v}` : null
  }).filter(Boolean)
  return partes.length ? partes.join(' · ') : '—'
}

// total_animais com o mesmo fallback da agregação: quando o campo é
// null/0, soma as categorias (evita "0" tendo composição preenchida).
function totalAnimais(r) {
  if (r.total_animais != null && Number(r.total_animais) > 0) return Number(r.total_animais)
  const soma = CATEGORIAS.reduce((s, c) => s + (Number(r[c.key]) || 0), 0)
  return soma > 0 ? soma : null
}

function equipeHtml(r) {
  if (Array.isArray(r.equipe_nomes) && r.equipe_nomes.length) {
    const abreviados = r.equipe_nomes.map(abreviarNome).filter(Boolean)
    return escapeHtml(abreviados.join(', ') || '—')
  }
  return r.numero_pessoas_manejo != null ? `${intFmt(r.numero_pessoas_manejo)} ${pl(r.numero_pessoas_manejo, 'pessoa', 'pessoas')}` : '—'
}

function detailTableHtml(registros, total, temTempos) {
  const cols = [
    ['Data', '8%'],
    ['Manejador', '11%'],
    ['Lote', '12%'],
    ['Trajeto', temTempos ? '16%' : '20%'],
    ['Aval. saída / entrada', '7%'],
    ...(temTempos ? [['Ocup./Vedação', '10%']] : []),
    ['Composição', '12%'],
    ['Animais', '6%'],
    ['Equipe', '9%'],
    ['Alertas', temTempos ? '9%' : '13%'],
  ]
  const rows = registros
    .map((r) => {
      const trajeto = `${r.pasto_saida || '—'} → ${r.pasto_entrada || '—'}`
      const aval = `${r.avaliacao_saida ?? '—'} / ${r.avaliacao_entrada ?? '—'}`
      const temposTd = temTempos
        ? `<td><span class="past-composicao">${escapeHtml([r.tempo_ocupacao ? `Ocup: ${r.tempo_ocupacao}` : null, r.tempo_vedacao ? `Ved: ${r.tempo_vedacao}` : null].filter(Boolean).join(' · ') || '—')}</span></td>`
        : ''
      const animais = totalAnimais(r)
      return `<tr><td>${dateFmt(r.data)}${r.horario_manejo ? `<span class="past-equipe"><br>${escapeHtml(r.horario_manejo)}</span>` : ''}</td><td>${escapeHtml(r.responsavel || '—')}</td><td>${escapeHtml(r.lote || '—')}</td><td>${escapeHtml(trajeto)}</td><td class="numeric">${escapeHtml(aval)}</td>${temposTd}<td><span class="past-composicao">${escapeHtml(composicaoHtml(r))}</span></td><td class="numeric"><strong>${animais != null ? intFmt(animais) : '—'}</strong></td><td><span class="past-equipe">${equipeHtml(r)}</span></td>${alertasCellHtml(r)}</tr>`
    })
    .join('')
  return `<div class="table-block"><h3 class="table-title">Movimentações detalhadas<span>${total} ${pl(total, 'registro', 'registros')}</span></h3><table class="past-detail-table">${tableHeadHtml(cols)}<tbody>${rows}</tbody></table></div>`
}

function chunkArray(arr, size) {
  if (arr.length <= size) return [arr]
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

export async function renderPastagensHtml(input) {
  const { dataInicio, dataFim, fazendaNome, logoGestao, logoFazenda, resumo, registros, ocupacoes } = input
  const brand = { logoGestao, logoFazenda, fazendaNome }
  const period = { dataInicio, dataFim }

  const porPasto = resumo.por_pasto ?? []
  const alertas = listaAlertas(registros)
  const totalUa = porPasto.filter((p) => p.ua_ha_media != null && p.ua_ha_media > 0).length
  const totalCondicao = (resumo.degradacao ?? []).filter((d) => d.avaliacao_saida_media != null || d.avaliacao_entrada_media != null).length
  const totalDescanso = (resumo.descanso ?? []).length
  // Os cards da página de análise ocupam metade da página cada (~60mm);
  // cabem ~10-12 barras com rótulos legíveis, o resto é omitido.
  const itensUa = porPasto
    .filter((p) => p.ua_ha_media != null && p.ua_ha_media > 0)
    .sort((a, b) => b.ua_ha_media - a.ua_ha_media)
    .slice(0, 12)
  const mapa = mapaOcupacao(ocupacoes, dataFim)
  const itensCondicao = (resumo.degradacao ?? []).filter((d) => d.avaliacao_saida_media != null || d.avaliacao_entrada_media != null)
  const itensDescanso = (resumo.descanso ?? []).slice(0, 12)
  const top = (n, total) => (total > n ? ` · top ${n} de ${total}` : '')
  const temTempos = registros.some((r) => r.tempo_ocupacao || r.tempo_vedacao)
  const pastosSemMov = porPasto.filter((p) => !p.entradas && !p.saidas).length

  const pastoChunks = porPasto.length ? chunkArray(porPasto, PASTO_ROWS_PER_PAGE) : []
  const ocupacaoChunks = ocupacoes.length ? chunkArray(ocupacoes, OCUPACAO_ROWS_PER_PAGE) : []
  const detailChunks = registros.length ? chunkArray(registros, DETAIL_ROWS_PER_PAGE) : []
  // Alertas ganharam página(s) próprias depois que a página 2 virou
  // exclusiva dos gráficos de análise.
  const alertasChunks = alertas.length ? chunkArray(alertas, ALERTAS_ROWS_PAGE) : []
  // Condição virou tabela na coluna esquerda da página 2; o excedente
  // do primeiro chunk pagina em páginas próprias.
  const condicaoExtraChunks = itensCondicao.length > CONDICAO_ROWS_P2 ? chunkArray(itensCondicao.slice(CONDICAO_ROWS_P2), CONDICAO_ROWS_PAGE) : []
  const totalPages = 2 + alertasChunks.length + condicaoExtraChunks.length + pastoChunks.length + ocupacaoChunks.length + detailChunks.length

  const chartsData = []
  const pagesHtml = []
  let pageIndex = 0

  // Página 1: resumo executivo (KPIs + insights + faixa de alertas + Gantt)
  pageIndex += 1
  const canvasGantt = 'chart-past-gantt'
  const canvasDescanso = 'chart-past-descanso'
  const canvasUa = 'chart-past-ua'
  if (mapa.pts.length) chartsData.push({ canvasId: canvasGantt, kind: 'gantt', mapa })
  if (itensDescanso.length) chartsData.push({ canvasId: canvasDescanso, kind: 'descanso', itens: itensDescanso })
  if (itensUa.length) chartsData.push({ canvasId: canvasUa, kind: 'uaPasto', itens: itensUa, media: resumo.taxa_lotacao_media_ua_ha })

  const totalAlertas = (resumo.alertas_sanitarios || 0) + (resumo.pendencias_infra || 0)
  pagesHtml.push(
    pageSection(`
      ${renderHeader({ ...brand, reportTitle: 'Relatório de Manejo de Pastagens', section: 'Resumo executivo', sectionLabel: 'Visão geral' })}
      <p class="section-kicker">Resumo do período</p>
      <div class="period-badge">${dateFmt(dataInicio)} <span style="padding:0 7px;color:#9bb1a4">até</span> ${dateFmt(dataFim)}</div>
      ${resumo.insights ? `<div class="insight-box"><span class="insight-label">Resumo</span>${escapeHtml(resumo.insights)}</div>` : ''}
      <div class="kpi-grid">
        ${kpi(intFmt(resumo.total_movimentacoes), 'Movimentações de pasto', `${intFmt(resumo.lotes_movimentados)} ${pl(resumo.lotes_movimentados, 'lote', 'lotes')} · ${intFmt(resumo.pastos_utilizados)} ${pl(resumo.pastos_utilizados, 'pasto', 'pastos')}`)}
        ${kpi(intFmt(resumo.animais_manejados), 'Animais manejados', `Escore gado: ${resumo.escore_gado_medio != null ? numFmt(resumo.escore_gado_medio, 1) : '—'}`)}
        ${kpi(resumo.ocupacao_media_dias != null ? numFmt(resumo.ocupacao_media_dias, 1) : '—', 'Ocupação média (dias)', `UA/ha: ${resumo.taxa_lotacao_media_ua_ha != null ? numFmt(resumo.taxa_lotacao_media_ua_ha, 2) : '—'} · ${intFmt(resumo.ocupacoes_em_andamento)} ${pl(resumo.ocupacoes_em_andamento, 'aberta', 'abertas')}`)}
        ${kpi(intFmt(totalAlertas), 'Alertas de diagnóstico', `${intFmt(resumo.alertas_sanitarios)} sanitários · ${intFmt(resumo.pendencias_infra)} infra · ${intFmt(resumo.ocupacoes_acima_meta)} ocup. acima da meta`, totalAlertas + (resumo.ocupacoes_acima_meta || 0) > 0 ? 'red' : 'green')}
      </div>
      ${alertasMiniHtml(alertas)}
      <div class="past-gantt-wrap">
        ${chartCard({ canvasId: canvasGantt, title: 'Mapa de ocupação', subtitle: `Períodos com gado em cada pasto; os vazios são o descanso${mapa.omitidos > 0 ? ` · +${mapa.omitidos} ${pl(mapa.omitidos, 'pasto não exibido', 'pastos não exibidos')}` : ''}`, hasData: mapa.pts.length > 0 })}
        <div class="gantt-legend">
          <span><span class="gantt-dot gantt-hatch"></span>Encerrada</span>
          <span><span class="gantt-dot" style="background:#1E3A5F"></span>Em andamento</span>
          ${(resumo.pastos_sem_uso || 0) > 0 ? `<span style="margin-left:auto">${resumo.pastos_sem_uso} ${pl(resumo.pastos_sem_uso, 'pasto', 'pastos')} sem ocupação no período${resumo.area_utilizada_pct != null ? ` · ${numFmt(resumo.area_utilizada_pct, 0)}% da área utilizada` : ''}</span>` : ''}
        </div>
      </div>
      ${renderFooter({ ...period, page: pageIndex, totalPages })}
    `),
  )

  // Página 2: análise visual dos pastos. Condição ocupa a coluna
  // esquerda inteira (card mais denso); à direita, lotação em cima e
  // descanso embaixo, dividindo a altura.
  pageIndex += 1
  pagesHtml.push(
    pageSection(`
      ${renderHeader({ ...brand, reportTitle: 'Relatório de Manejo de Pastagens', section: 'Uso dos pastos', sectionLabel: 'Análise' })}
      <p class="section-kicker">Condição, lotação e descanso dos pastos</p>
      <div class="past-quad">
        <div class="past-tall">
          <div class="past-condicao">${condicaoTableHtml(itensCondicao.slice(0, CONDICAO_ROWS_P2), itensCondicao.length)}</div>
        </div>
        ${/* Sem dados de descanso o card colapsa e a lotação ocupa a coluna inteira. */''}
        <div class="${itensDescanso.length ? '' : 'past-tall'}">${chartCard({ canvasId: canvasUa, title: 'Taxa de lotação', subtitle: `UA/ha média das ocupações${top(itensUa.length, totalUa)}`, hasData: itensUa.length > 0 })}</div>
        ${itensDescanso.length ? chartCard({ canvasId: canvasDescanso, title: 'Descanso entre ocupações', subtitle: `Dias médios sem gado no pasto${top(itensDescanso.length, totalDescanso)}`, hasData: true }) : ''}
      </div>
      ${renderFooter({ ...period, page: pageIndex, totalPages })}
    `),
  )

  // Continuação da tabela de condição quando há mais pastos do que
  // cabem na coluna da página 2.
  condicaoExtraChunks.forEach((chunk, i) => {
    pageIndex += 1
    pagesHtml.push(
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: 'Relatório de Manejo de Pastagens', section: `Condição na entrada e na saída${condicaoExtraChunks.length > 1 ? ` (${i + 1}/${condicaoExtraChunks.length})` : ''}`, sectionLabel: 'Análise' })}
        <p class="section-kicker">Condição dos pastos (continuação)</p>
        <div class="past-content">${condicaoTableHtml(chunk, itensCondicao.length)}</div>
        ${renderFooter({ ...period, page: pageIndex, totalPages })}
      `),
    )
  })

  // Páginas de alertas do período.
  alertasChunks.forEach((chunk, i) => {
    pageIndex += 1
    pagesHtml.push(
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: 'Relatório de Manejo de Pastagens', section: `Alertas do período${alertasChunks.length > 1 ? ` (${i + 1}/${alertasChunks.length})` : ''}`, sectionLabel: 'Diagnósticos' })}
        <p class="section-kicker">Alertas do período${alertasChunks.length > 1 ? ' (continuação)' : ''}</p>
        ${alertasTableHtml(chunk, alertas.length)}
        ${renderFooter({ ...period, page: pageIndex, totalPages })}
      `),
    )
  })

  // Páginas de resumo por pasto
  pastoChunks.forEach((chunk, i) => {
    pageIndex += 1
    pagesHtml.push(
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: 'Relatório de Manejo de Pastagens', section: `Resumo por pasto${pastoChunks.length > 1 ? ` (${i + 1}/${pastoChunks.length})` : ''}`, sectionLabel: 'Análise' })}
        <p class="section-kicker">Distribuição por pasto</p>
        <div class="past-content">${resumoPastoTableHtml(chunk, porPasto.length, i === 0 ? pastosSemMov : 0)}</div>
        ${renderFooter({ ...period, page: pageIndex, totalPages })}
      `),
    )
  })

  // Páginas de histórico de ocupação
  ocupacaoChunks.forEach((chunk, i) => {
    pageIndex += 1
    pagesHtml.push(
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: 'Relatório de Manejo de Pastagens', section: `Histórico de ocupação${ocupacaoChunks.length > 1 ? ` (${i + 1}/${ocupacaoChunks.length})` : ''}`, sectionLabel: 'Ocupação' })}
        <p class="section-kicker">Períodos de ocupação no intervalo (inclui ocupações abertas)</p>
        <div class="past-content">${ocupacaoTableHtml(chunk, ocupacoes.length)}</div>
        ${renderFooter({ ...period, page: pageIndex, totalPages })}
      `),
    )
  })

  // Páginas de detalhamento das movimentações
  detailChunks.forEach((chunk, i) => {
    pageIndex += 1
    pagesHtml.push(
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: 'Relatório de Manejo de Pastagens', section: `Detalhamento${detailChunks.length > 1 ? ` (${i + 1}/${detailChunks.length})` : ''}`, sectionLabel: 'Registros' })}
        <p class="section-kicker">Movimentações de pasto</p>
        <div class="past-content">${detailTableHtml(chunk, registros.length, temTempos)}</div>
        ${renderFooter({ ...period, page: pageIndex, totalPages })}
      `),
    )
  })

  const chartJsScript = await getChartJsScript()
  return htmlDocument({
    title: 'Relatório de Manejo de Pastagens',
    extraCss: PASTAGENS_CSS,
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
  if (
    !isPDFData(body) ||
    (body.registros?.length ?? 0) > MAX_REGISTROS ||
    (body.ocupacoes?.length ?? 0) > MAX_OCUPACOES
  ) {
    return res.status(400).json({ error: 'Payload de relatório inválido ou grande demais' })
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Payload do relatório excede o limite permitido' })
  }

  try {
    console.log('[PDF Pastagens] Iniciando renderização. Movimentações:', body.registros.length, 'Ocupações:', body.ocupacoes.length)
    const html = await renderPastagensHtml(body)
    console.log('[PDF Pastagens] HTML montado. Bytes:', Buffer.byteLength(html, 'utf8'))
    const pdf = await generatePdf({
      html,
      format: 'A4',
      landscape: true,
      beforePdf: async (page) => {
        await page.waitForFunction('window.__chartsReady === true', { timeout: 15000 }).catch(() => {})
      },
    })
    console.log('[PDF Pastagens] PDF gerado. Bytes:', pdf.length)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-pastagens.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PDF-Renderer', 'puppeteer')
    return res.status(200).send(pdf)
  } catch (error) {
    console.error('[PDF Pastagens] Erro ao gerar relatório:', error)
    console.error('[PDF Pastagens] Stack:', error?.stack || 'sem stack')
    return res.status(500).json({ error: 'Não foi possível gerar o PDF', detail: String(error) })
  }
}
