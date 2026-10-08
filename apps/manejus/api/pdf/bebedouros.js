// Endpoint fino do relatório de Bebedouros. Mesmo padrão do morte.js,
// consumo.js e abastecimento.js: só existe aqui o que é específico deste
// relatório. Toda a infraestrutura (Chrome, Chart.js, template base,
// formatadores) vem do _shared/.
//
// Estrutura (A4 paisagem):
//  Seção 1 — Cronograma de limpeza
//    modo período:   KPIs + alertas + TABELA (última / próxima limpeza por
//                    bebedouro, paginada) + gráfico de apoio (dias desde a
//                    última limpeza).
//    modo dia único: KPIs + TABELA (anterior / do dia / próxima prevista) +
//                    gráfico de intervalo.
//  Seção 2 — Pontos de atenção: KPIs de checklist + gráfico de problemas +
//    ocorrências por bebedouro + tabela de ocorrências (item e observação
//    pareados, sem truncar por clamp).
//
// Layout e paleta seguem o padrão dos demais relatórios (clima, morte, consumo):
// kpi() do template, insight-box, cabeçalhos de tabela verdes, linhas
// zebradas. O PDF é colorido, mas montado para continuar interpretável se
// impresso em preto e branco: o status nunca depende só da cor (sempre texto +
// símbolo ● ▲ ■ ○ –, e o atraso crítico ganha negrito e peso de borda).
// Não há gráfico de "dias desde a última limpeza": a tabela de cronograma
// (última / próxima limpeza) cobre essa leitura.

import { escapeHtml, dateFmt } from './_shared/formatters.js'
import { getChartJsScript } from './_shared/chartjs.js'
import { generatePdf } from './_shared/puppeteer.js'
import {
  renderHeader,
  kpi,
  page as pageSection,
  htmlDocument,
} from './_shared/template.js'

// === Limites do body ===
const MAX_BEBEDOUROS = 2000
const MAX_OCORRENCIAS = 5000
const MAX_BODY_BYTES = 8_000_000

// Limite de caracteres por campo de texto livre na tabela de ocorrências.
// Não há clamp de linhas: o texto aparece inteiro até este limite.
const MAX_TEXTO_OCORRENCIA = 500

// === Dimensões para paginação (mm) ===
// A4 landscape = 297x210mm. Área útil de conteúdo ≈ 155mm.
const TOTAL_CONTENT_H = 155
const KICKER_H = 6
const BADGE_H = 10
const TITLE_H = 6
const KPI_PERIOD_H = 27
const ALERT_H = 11
const LEGEND_H = 8
const TABLE_HEAD_H = 8
const ROW_H = 7 // altura fixa de linha das tabelas de cronograma
const SAFETY = 3
// Folga extra da 1ª página (selo de período, caixa de insight e margens dos KPIs
// ocupam mais que as constantes nominais).
const FIRST_PAGE_EXTRA = 9

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

// === Status: texto + símbolo + tipo (padrão visual em P&B) ===
const STATUS = {
  'Em dia': { sim: '●', kind: 'ok' },
  'Dentro da meta': { sim: '●', kind: 'ok' },
  Atrasado: { sim: '▲', kind: 'warn' },
  'Acima da meta': { sim: '▲', kind: 'warn' },
  'Atraso crítico': { sim: '■', kind: 'crit' },
  'Muito acima da meta': { sim: '■', kind: 'crit' },
  'Sem registro': { sim: '○', kind: 'none' },
  'Primeira limpeza': { sim: '○', kind: 'none' },
  'Sem meta': { sim: '–', kind: 'nometa' },
}

function statusInfo(label) {
  return STATUS[label] || { sim: '–', kind: 'nometa' }
}

function statusBadge(label) {
  const s = statusInfo(label)
  return `<span class="st st-${s.kind}"><span class="st-sim">${s.sim}</span> ${escapeHtml(label)}</span>`
}

// === Datas (date-only, UTC para evitar deriva de fuso) ===
function ymd(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function utcDay(s) {
  const [y, m, d] = s.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function addDays(s, n) {
  return new Date(utcDay(s) + n * 86_400_000).toISOString().slice(0, 10)
}

function diffDays(a, b) {
  return Math.round((utcDay(b) - utcDay(a)) / 86_400_000)
}

function prazoTexto(d) {
  if (d === null || d === undefined) return '—'
  if (d === 0) return 'hoje'
  if (d > 0) return `em ${d} ${d === 1 ? 'dia' : 'dias'}`
  const a = Math.abs(d)
  return `vencida há ${a} ${a === 1 ? 'dia' : 'dias'}`
}

// Normaliza o cronograma: aceita payload novo (proximaLimpeza/diasParaProxima)
// e calcula no servidor quando o cliente é antigo. Ordena: vencidas (mais
// atrasada primeiro) → próximas por data → sem meta → sem registro.
function normalizarCronograma(lista, dataFim) {
  const ref = ymd(dataFim)
  const itens = lista.map((s) => {
    const ultima = ymd(s.ultimaLimpeza)
    const meta = s.meta > 0 ? s.meta : null
    const proxima = s.proximaLimpeza !== undefined
      ? ymd(s.proximaLimpeza)
      : (ultima && meta ? addDays(ultima, meta) : null)
    const dias = s.diasParaProxima !== undefined
      ? s.diasParaProxima
      : (proxima && ref ? diffDays(ref, proxima) : null)
    return { ...s, ultima, meta, proxima, diasParaProxima: dias }
  })
  const grupo = (i) => {
    if (i.diasParaProxima !== null && i.diasParaProxima < 0) return 0
    if (i.diasParaProxima !== null) return 1
    if (i.ultima) return 2
    return 3
  }
  return itens.sort((a, b) => {
    const ga = grupo(a)
    const gb = grupo(b)
    if (ga !== gb) return ga - gb
    if (a.diasParaProxima !== null && b.diasParaProxima !== null && a.diasParaProxima !== b.diasParaProxima) {
      return a.diasParaProxima - b.diasParaProxima
    }
    return String(a.nome).localeCompare(String(b.nome))
  })
}

// === CSS específico ===
// Só o que o template base não cobre: tom neutro de KPI, selos de status
// (cor + símbolo + texto), tabelas de cronograma/dia, ocorrências e alertas.
const BEBEDOUROS_CSS = `
.page{display:flex;flex-direction:column}
.kpi-grid.cols-3{grid-template-columns:repeat(3,1fr)}
.kpi-grid.cols-4{grid-template-columns:repeat(4,1fr)}
.kpi-grid.cols-5{grid-template-columns:repeat(5,1fr)}
.kpi-grid.cols-6{grid-template-columns:repeat(6,1fr)}
.kpi-card.tone-gray{border-top-color:#9aa5a0}
.tone-gray .kpi-value{color:#4f5f56}
.kpi-card.tone-red{border-top-width:5px}
.alert-line{border-left:3px solid #c28a27;background:#fffaf0;border-radius:0 5px 5px 0;padding:6px 10px;margin:0 0 3mm;color:#52635a;font-size:13px;line-height:1.35}
.alert-line strong{color:#805d12}
.alert-line.tone-crit{border-left:5px solid #c94d46;background:#fef2f2}
.alert-line.tone-crit strong{color:#991b1b}
.info-pill{display:inline-block;border:1px solid #d3e4d9;background:#f0f6f2;border-radius:10px;padding:3px 10px;font-size:12px;color:#0b6a42;font-weight:700;margin-bottom:3mm}
.st{display:inline-block;padding:1px 7px;border:1px solid #9aa5a0;border-radius:9px;font-size:10.5px;font-weight:700;white-space:nowrap;line-height:1.3;color:#4f5f56;background:#fff}
.st-ok{border-color:#9ccfb2;background:#e9f5ee;color:#0b6a42}
.st-warn{border-color:#e3c27a;background:#fffaf0;color:#805d12}
.st-crit{border:1.5px solid #991b1b;background:#fef2f2;color:#991b1b}
.st-none{border-style:dashed;color:#4f5f56}
.st-nometa{border-color:transparent;background:transparent;color:#4f5f56}
.table-legend{font-size:11px;color:#63736a;margin-top:-3mm}
.cron-table td,.dia-table td{height:${ROW_H}mm;line-height:${ROW_H}mm;padding-top:0;padding-bottom:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:middle}
.cron-table tbody tr:nth-child(even) td,.dia-table tbody tr:nth-child(even) td,.ocorr-table tbody tr:nth-child(even) td{background:#f7faf8}
.cron-table td.strong,.dia-table td.strong{font-weight:700;color:#26352e}
.cron-table td.num{text-align:right}
.cron-table tr.row-venc td{font-weight:700;color:#991b1b}
.cron-table tr.row-venc td:first-child{border-left:4px solid #c94d46}
.cron-table th:nth-child(1){width:19%}
.cron-table th:nth-child(2){width:11%}
.cron-table th:nth-child(3){width:11%}
.cron-table th:nth-child(4){width:15%}
.cron-table th:nth-child(5){width:16%}
.cron-table th:nth-child(6){width:6%;text-align:right}
.cron-table th:nth-child(7){width:15%}
.cron-table th:nth-child(8){width:7%;text-align:right}
.dia-table th:nth-child(1){width:20%}
.dia-table th:nth-child(2){width:12%}
.dia-table th:nth-child(3){width:12%}
.dia-table th:nth-child(4){width:13%}
.dia-table th:nth-child(5){width:19%}
.dia-table th:nth-child(6){width:10%}
.dia-table th:nth-child(7){width:14%}
.ocorr-table th:nth-child(1){width:9%}
.ocorr-table th:nth-child(2){width:14%}
.ocorr-table th:nth-child(3){width:41%}
.ocorr-table th:nth-child(4){width:24%}
.ocorr-table th:nth-child(5){width:12%}
.ocorr-table th{border-right:1px solid #d8e0db}
.ocorr-table th:last-child,.ocorr-table td:last-child{border-right:none}
.ocorr-table td{line-height:1.3;border-right:1px solid #e5ebe7}
.ocorr-item{margin:0 0 2px}
.ocorr-item b{font-weight:700;color:#26352e}
.no-ocorr-box{background:#F0FDF4;border:1px solid #BBF7D0;border-radius:5px;padding:10px;text-align:center;color:#15803d;font-size:13px;margin-top:4mm}
.ocorr-resumo{font-size:12px;color:#4f5f56;margin-top:3mm;line-height:1.5}
`

// === Chart init JS (roda dentro do Chromium headless) ===
// Único gráfico do relatório: % de respostas negativas por item do checklist,
// com valor escrito ao lado de cada barra (legível também em P&B).
const CHARTS_INIT_JS = `
(function(){
  var Chart = window.Chart
  if (!Chart) { window.__chartsReady = true; return }
  Chart.defaults.animation = false
  Chart.defaults.devicePixelRatio = 3
  Chart.defaults.font.family = 'Arial, Helvetica, sans-serif'

  var charts = (window.__reportData && window.__reportData.charts) || []
  if (charts.length === 0) { window.__chartsReady = true; return }
  var remaining = charts.length
  function maybeDone() { remaining--; if (remaining <= 0) window.__chartsReady = true }

  function drawProblemas(entry) {
    var el = document.getElementById(entry.canvasId)
    var items = entry.items
    if (!el || !items || !items.length) { maybeDone(); return }
    var labels = items.map(function(d) { return d.label })
    var valores = items.map(function(d) { return d.valor })
    var textos = items.map(function(d) { return d.valor + '% (' + d.negativos + '/' + d.total + ')' })
    new Chart(el, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '% negativo',
          data: valores,
          backgroundColor: '#c94d46',
          borderRadius: 4,
          borderSkipped: false,
          minBarLength: 3,
          barPercentage: 0.7,
          categoryPercentage: 0.8,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false, animation: false,
        layout: { padding: { right: 80 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            beginAtZero: true,
            max: 100,
            grid: { color: '#E5E7EB' },
            ticks: { color: '#6B7280', font: { size: 10 }, callback: function(v) { return v + '%' } },
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
          ctx.fillStyle = '#374151'
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          meta.data.forEach(function(bar, i) { ctx.fillText(textos[i], bar.x + 5, bar.y) })
          ctx.restore()
        },
      }],
    })
    maybeDone()
  }

  charts.forEach(function(entry) {
    if (entry.kind === 'problemas') drawProblemas(entry)
    else maybeDone()
  })
})();
`

// === Helpers HTML ===

// Cartões de KPI usam kpi() do template. `sim` é o símbolo textual que
// acompanha a cor (leitura em P&B).
function kpiCard(value, label, tone, sim = '', sub = '') {
  const prefix = sim ? `${sim} ` : ''
  return kpi(value, prefix + label, sub, tone)
}

function kpiGrid(cards, cols) {
  return `<div class="kpi-grid cols-${cols}">${cards.join('')}</div>`
}

// tone: 'crit' (vermelho, borda grossa) | 'warn' (dourado); prefixo em texto
function alertBox(text, tone, prefix) {
  return `<div class="alert-line tone-${tone}"><strong>${escapeHtml(prefix)}</strong> ${escapeHtml(text)}</div>`
}

function legendaStatusHtml(modo) {
  const itens = modo === 'dia'
    ? ['● Dentro da meta', '▲ Acima da meta', '■ Muito acima da meta', '○ Primeira limpeza']
    : ['● Em dia', '▲ Atrasado', '■ Atraso crítico', '○ Sem registro', '– Sem meta']
  return `<div class="table-legend">Legenda: ${itens.join(' · ')} · ! prazo vencido</div>`
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

function cap(texto, max = MAX_TEXTO_OCORRENCIA) {
  const s = String(texto ?? '')
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

// === Tabelas ===

function cronogramaTableHtml(chunk) {
  const header = '<thead><tr><th>Bebedouro</th><th>Última limpeza</th><th>Próxima limpeza</th><th>Prazo</th><th>Status</th><th>Meta</th><th>Responsável (última)</th><th>No período</th></tr></thead>'
  const rows = chunk
    .map((i) => {
      const venc = i.diasParaProxima !== null && i.diasParaProxima < 0
      const proximaTxt = i.proxima ? dateFmt(i.proxima) : (i.ultima ? 'Sem meta' : 'Pendente')
      const prazo = `${venc ? '! ' : ''}${prazoTexto(i.diasParaProxima)}`
      return `<tr class="${venc ? 'row-venc' : ''}"><td>${escapeHtml(i.nome)}</td><td>${i.ultima ? dateFmt(i.ultima) : '—'}</td><td class="strong">${escapeHtml(proximaTxt)}</td><td>${escapeHtml(prazo)}</td><td>${statusBadge(i.statusLabel)}</td><td class="num">${i.meta ? `${i.meta}d` : '—'}</td><td>${escapeHtml(i.responsavelUltima || '—')}</td><td class="num">${i.limpezasNoPeriodo ?? 0}</td></tr>`
    })
    .join('')
  return `<table class="cron-table">${header}<tbody>${rows}</tbody></table>`
}

function diaTableHtml(chunk) {
  const header = '<thead><tr><th>Bebedouro</th><th>Limpeza anterior</th><th>Limpeza do dia</th><th>Próxima prevista</th><th>Status</th><th>Intervalo / meta</th><th>Responsável</th></tr></thead>'
  const rows = chunk
    .map((l) => {
      const meta = l.meta > 0 ? l.meta : null
      const proxima = l.proximaPrevista !== undefined
        ? ymd(l.proximaPrevista)
        : (meta && ymd(l.dataLimpeza) ? addDays(ymd(l.dataLimpeza), meta) : null)
      const interv = l.intervalo === null || l.intervalo === undefined ? '—' : `${l.intervalo}d`
      return `<tr><td>${escapeHtml(l.nome)}</td><td>${l.dataLimpezaAnterior ? dateFmt(l.dataLimpezaAnterior) : '—'}</td><td>${dateFmt(l.dataLimpeza)}</td><td class="strong">${proxima ? dateFmt(proxima) : 'Sem meta'}</td><td>${statusBadge(l.statusLabel)}</td><td>${interv} / ${meta ? `${meta}d` : '—'}</td><td>${escapeHtml(l.responsavel || '—')}</td></tr>`
    })
    .join('')
  return `<table class="dia-table">${header}<tbody>${rows}</tbody></table>`
}

// Itens negativos com observação pareada. Aceita payload antigo (strings).
function itensOcorrencia(o) {
  if (Array.isArray(o.itens) && o.itens.length > 0) {
    return o.itens.map((i) => ({ label: String(i.label ?? ''), obs: String(i.obs ?? '') }))
  }
  const labels = String(o.itensNegativos || '').split(',').map((s) => s.trim()).filter(Boolean)
  const obs = String(o.obsItens || '')
  return labels.map((label, idx) => ({ label, obs: idx === 0 ? obs : '' }))
}

function ocorrenciasTableHtml(chunk) {
  const header = '<thead><tr><th>Data</th><th>Bebedouro</th><th>Itens negativos e observação de cada item</th><th>Observação geral</th><th>Responsável</th></tr></thead>'
  const rows = chunk
    .map((o) => {
      const itens = itensOcorrencia(o)
        .map((i) => `<div class="ocorr-item"><b>✕ ${escapeHtml(i.label)}</b>${i.obs ? ` — ${escapeHtml(cap(i.obs))}` : ''}</div>`)
        .join('')
      return `<tr><td>${dateFmt(o.data)}</td><td>${escapeHtml(o.bebedouro)}</td><td>${itens}</td><td>${escapeHtml(cap(o.obsGeral) || '—')}</td><td>${escapeHtml(o.responsavel || '—')}</td></tr>`
    })
    .join('')
  return `<table class="ocorr-table">${header}<tbody>${rows}</tbody></table>`
}

// Altura estimada (mm) de uma linha de ocorrência, para paginar por espaço.
function alturaOcorrenciaMm(o) {
  const itens = itensOcorrencia(o)
  const linhasItens = itens.reduce(
    (soma, i) => soma + Math.max(1, Math.ceil((i.label.length + 4 + Math.min(i.obs.length, MAX_TEXTO_OCORRENCIA)) / 88)),
    0,
  )
  const linhasGeral = Math.max(1, Math.ceil(Math.min(String(o.obsGeral || '').length, MAX_TEXTO_OCORRENCIA) / 44))
  const linhas = Math.max(linhasItens, linhasGeral)
  return linhas * 4.1 + 3.5
}

function paginarOcorrencias(lista) {
  const orcamento = TOTAL_CONTENT_H - KICKER_H - TITLE_H - TABLE_HEAD_H - SAFETY - 4
  const paginas = []
  let atual = []
  let usado = 0
  for (const o of lista) {
    const h = Math.min(alturaOcorrenciaMm(o), orcamento)
    if (atual.length > 0 && usado + h > orcamento) {
      paginas.push(atual)
      atual = []
      usado = 0
    }
    atual.push(o)
    usado += h
  }
  if (atual.length > 0) paginas.push(atual)
  return paginas
}

// === KPIs ===

function kpisPeriodoHtml(kpis) {
  const cards = [
    kpiCard(String(kpis.total), 'Cadastrados', 'green'),
    kpiCard(`${kpis.emDia}`, 'Dentro da meta', 'green', '●', `${kpis.pctEmDia}% dos bebedouros`),
    kpiCard(String(kpis.atrasado), 'Atrasados', 'gold', '▲'),
    kpiCard(String(kpis.critico), 'Atraso crítico', 'red', '■'),
    kpiCard(String(kpis.semRegistro), 'Sem registro', 'gray', '○'),
  ]
  if (kpis.semMeta > 0) cards.push(kpiCard(String(kpis.semMeta), 'Sem meta', 'gray', '–'))
  return kpiGrid(cards, cards.length)
}

function kpisDiaHtml(kpis) {
  const cards = [
    kpiCard(String(kpis.limposNoDia), 'Limpos no dia', 'green'),
    kpiCard(String(kpis.dentroMeta), 'Dentro da meta', 'green', '●'),
    kpiCard(String(kpis.acimaMeta), 'Acima da meta', 'gold', '▲'),
    kpiCard(String(kpis.muitoAcima), 'Muito acima da meta', 'red', '■'),
  ]
  let html = kpiGrid(cards, 4)
  if (kpis.intervaloMedio !== null && kpis.intervaloMedio !== undefined) {
    html += `<div class="info-pill">Intervalo médio: ${kpis.intervaloMedio}d</div>`
  }
  return html
}

function kpisChecklistHtml(kpis) {
  const cards = [
    kpiCard(String(kpis.totalRegistros), 'Registros no período', 'green'),
    kpiCard(String(kpis.comChecklist), 'Registros com checklist', 'green'),
    kpiCard(`${kpis.negativos} (${kpis.pctNegativos}%)`, 'Registros com ponto de atenção', 'red', '!'),
  ]
  let html = kpiGrid(cards, 3)
  if (kpis.itemMaisProblematico) {
    const ipm = kpis.itemMaisProblematico
    const txt = `${ipm.label} com ${ipm.pctNegativo}% de respostas negativas (${ipm.negativos}/${ipm.total}).`
    html += alertBox(txt, 'warn', 'ATENÇÃO — item mais problemático:')
  }
  return html
}

function proximasSemanaTexto(proximas) {
  const nomes = proximas
    .slice(0, 8)
    .map((p) => `${p.nome} (${dateFmt(p.proximaLimpeza)})`)
    .join(', ')
  const extra = proximas.length > 8 ? ` e mais ${proximas.length - 8}` : ''
  return `${proximas.length} bebedouro(s): ${nomes}${extra}.`
}

// === Paginação genérica ===

function chunkPorTamanhos(items, primeiro, demais) {
  if (items.length === 0) return []
  const chunks = []
  let i = 0
  let isFirst = true
  while (i < items.length) {
    const max = Math.max(1, isFirst ? primeiro : demais)
    chunks.push(items.slice(i, i + max))
    i += max
    isFirst = false
  }
  return chunks
}

// === Montagem das páginas ===

export async function renderBebedourosHtml(input) {
  const { titulo, fazendaNome, logoGestao, logoFazenda } = input
  const brand = { logoGestao, logoFazenda, fazendaNome }
  const ehDiaUnico = input.ehDiaUnico
  const diaUnico = input.diaUnico
  const dados = { ...input, ehDiaUnico, diaUnico }

  const cronograma = normalizarCronograma(input.statusPorBebedouro || [], input.dataFim)
  const limpezasDoDia = input.limpezasDoDia || []
  const proximas = input.proximasSemana || []
  const ocorrencias = input.ocorrencias || []

  const temAlertaAtraso = !ehDiaUnico && !!input.maisAtrasado
  const temAlertaProximas = !ehDiaUnico && proximas.length > 0

  // Capacidade (linhas) das páginas de tabela do cronograma
  const topoPeriodo = KICKER_H + BADGE_H + TITLE_H + KPI_PERIOD_H
    + (temAlertaAtraso ? ALERT_H : 0) + (temAlertaProximas ? ALERT_H : 0) + TABLE_HEAD_H + SAFETY + FIRST_PAGE_EXTRA + LEGEND_H
  const rowsFirst = Math.floor((TOTAL_CONTENT_H - topoPeriodo) / ROW_H)
  const rowsCont = Math.floor((TOTAL_CONTENT_H - KICKER_H - TABLE_HEAD_H - SAFETY - LEGEND_H) / ROW_H)
  const topoDia = KICKER_H + BADGE_H + TITLE_H + KPI_PERIOD_H + 9 + TABLE_HEAD_H + SAFETY + FIRST_PAGE_EXTRA + LEGEND_H
  const diaRowsFirst = Math.floor((TOTAL_CONTENT_H - topoDia) / ROW_H)

  const pageDescriptors = []

  if (ehDiaUnico) {
    const tabela = chunkPorTamanhos(limpezasDoDia, diaRowsFirst, rowsCont)
    if (tabela.length === 0) pageDescriptors.push({ type: 'dia-tabela', chunk: [], isFirst: true })
    tabela.forEach((chunk, i) => pageDescriptors.push({ type: 'dia-tabela', chunk, isFirst: i === 0 }))
  } else {
    const tabela = chunkPorTamanhos(cronograma, rowsFirst, rowsCont)
    if (tabela.length === 0) pageDescriptors.push({ type: 'cron-tabela', chunk: [], isFirst: true, total: 0, startRow: 0 })
    let linha = 0
    tabela.forEach((chunk, i) => {
      pageDescriptors.push({ type: 'cron-tabela', chunk, isFirst: i === 0, total: cronograma.length, startRow: linha })
      linha += chunk.length
    })
  }

  // Seção 2: KPIs + gráfico de problemas, depois tabela de ocorrências
  pageDescriptors.push({ type: 'secao2-kpis' })
  const occPages = ocorrencias.length > 0 ? paginarOcorrencias(ocorrencias) : []
  let ocorrenciasMostradas = 0
  occPages.forEach((chunk, i) => {
    pageDescriptors.push({
      type: 'secao2-ocorrencias',
      chunk,
      total: ocorrencias.length,
      startRow: ocorrenciasMostradas,
      multi: occPages.length > 1,
      isFirst: i === 0,
    })
    ocorrenciasMostradas += chunk.length
  })

  const totalPages = pageDescriptors.length

  // === Monta HTML de cada página ===
  const chartsData = []
  const pagesHtml = []
  let pageNumber = 0

  for (const desc of pageDescriptors) {
    pageNumber++
    let html = ''

    if (desc.type === 'cron-tabela') {
      let content = `
        ${renderHeader({ ...brand, reportTitle: titulo, section: desc.isFirst ? 'Cronograma de limpeza' : 'Continuação', sectionLabel: 'Seção 1' })}
        <p class="section-kicker">${desc.isFirst ? 'Resumo do período' : 'Cronograma de limpeza (continuação)'}</p>
      `
      if (desc.isFirst) {
        content += `
          ${periodBadgeHtml(dados)}
          <div class="insight-box"><span class="insight-label">1. Cronograma de limpeza dos bebedouros</span>Última e próxima limpeza de cada bebedouro (próxima = última + meta), com prazo em relação a ${escapeHtml(dateFmt(input.dataFim))}.</div>
          ${input.limpezaKPIs ? kpisPeriodoHtml(input.limpezaKPIs) : ''}
          ${temAlertaAtraso ? alertBox(`${input.maisAtrasado.nome} com ${input.maisAtrasado.dias} dias desde a última limpeza. Meta: ${input.maisAtrasado.meta} dias.`, 'crit', 'CRÍTICO — maior atraso:') : ''}
          ${temAlertaProximas ? alertBox(proximasSemanaTexto(proximas), 'warn', 'PRÓXIMOS 7 DIAS — limpezas previstas:') : ''}
        `
      }
      content += desc.chunk.length > 0
        ? `<div class="table-block">${cronogramaTableHtml(desc.chunk)}</div>${legendaStatusHtml('periodo')}`
        : '<div class="empty-chart" style="height:40mm">Nenhum bebedouro cadastrado</div>'
      content += footerHtml(dados, pageNumber, totalPages)
      html = pageSection(content)
    } else if (desc.type === 'dia-tabela') {
      let content = `
        ${renderHeader({ ...brand, reportTitle: titulo, section: desc.isFirst ? 'Limpeza do dia' : 'Continuação', sectionLabel: 'Seção 1' })}
        <p class="section-kicker">${desc.isFirst ? 'Resumo do período' : 'Limpeza do dia (continuação)'}</p>
      `
      if (desc.isFirst) {
        content += `
          ${periodBadgeHtml(dados)}
          <div class="insight-box"><span class="insight-label">1. Bebedouros limpos em ${escapeHtml(dateFmt(diaUnico))}</span>Limpeza anterior, limpeza do dia e próxima limpeza prevista (limpeza do dia + meta).</div>
          ${input.limpezaDiaKPIs ? kpisDiaHtml(input.limpezaDiaKPIs) : ''}
        `
      }
      content += desc.chunk.length > 0
        ? `<div class="table-block">${diaTableHtml(desc.chunk)}</div>${legendaStatusHtml('dia')}`
        : '<div class="empty-chart" style="height:40mm">Nenhum bebedouro foi limpo neste dia</div>'
      content += footerHtml(dados, pageNumber, totalPages)
      html = pageSection(content)
    } else if (desc.type === 'secao2-kpis') {
      const hasData = input.itensRanking.length > 0 && input.itensRanking.some((r) => r.total > 0)
      const cardH = hasData
        ? Math.max(50, Math.min(input.itensRanking.length * 10 + 14, 70))
        : 40
      if (hasData) {
        chartsData.push({
          canvasId: 'chart-problemas',
          kind: 'problemas',
          items: input.itensRanking.map((r) => ({
            label: r.label,
            valor: r.pctNegativo,
            negativos: r.negativos,
            total: r.total,
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
      const porBeb = input.ocorrenciasPorBebedouro || []
      if (porBeb.length > 0) {
        const lista = porBeb.slice(0, 12).map((p) => `${escapeHtml(p.bebedouro)}: ${p.quantidade}`).join(' · ')
        const extra = porBeb.length > 12 ? ` · e mais ${porBeb.length - 12}` : ''
        content += `<div class="ocorr-resumo"><b>Ocorrências por bebedouro:</b> ${lista}${extra}</div>`
      }
      if (ocorrencias.length === 0) {
        content += '<div class="no-ocorr-box">Nenhuma ocorrência negativa nos checklists do período.</div>'
      }
      content += footerHtml(dados, pageNumber, totalPages)
      html = pageSection(content)
    } else if (desc.type === 'secao2-ocorrencias') {
      const { chunk, total, startRow, multi } = desc
      const suffix = multi
        ? ` <span>· exibindo ${startRow + 1}–${startRow + chunk.length} de ${total}</span>`
        : ` <span>${total} ocorrência(s)</span>`
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
