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
  htmlDocument,
} from './_shared/template.js'
import { flowBlock, flowIntro, flowSection, flowTable } from './_shared/flowEngine.js'

// === Limites do body ===
const MAX_BEBEDOUROS = 2000
const MAX_OCORRENCIAS = 5000
const MAX_BODY_BYTES = 8_000_000

// Limite de caracteres por campo de texto livre na tabela de ocorrências.
// Não há clamp de linhas: o texto aparece inteiro até este limite.
const MAX_TEXTO_OCORRENCIA = 500

// Altura fixa das linhas das tabelas de cronograma (uma linha, sem quebra).
const ROW_H = 7

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
.legend-head th,.cron-table .legend-head th,.dia-table .legend-head th{background:#fff!important;color:#63736a;font-size:10px;font-weight:400;padding:0 0 4px;text-align:left;letter-spacing:0}
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
.ocorr-resumo{font-size:12px;color:#4f5f56;line-height:1.5}
.beb-nota{font-size:12px;color:#4f5f56;margin:0;padding:8px 10px;border:1px solid #d8e0db;border-radius:5px;background:#f7faf8}
.beb-chart{height:52mm}
.beb-chart .chart-card{height:100%}
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
  return `Legenda: ${itens.join(' · ')}${modo === 'dia' ? '' : ' · ! prazo vencido'}`
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
  const header = `<thead><tr class="legend-head"><th colspan="8">${legendaStatusHtml('periodo')}</th></tr><tr><th>Bebedouro</th><th>Última limpeza</th><th>Próxima limpeza</th><th>Prazo</th><th>Status</th><th>Meta</th><th>Responsável (última)</th><th>No período</th></tr></thead>`
  const rows = chunk
    .map((i) => {
      const venc = i.diasParaProxima !== null && i.diasParaProxima < 0
      const proximaTxt = i.proxima ? dateFmt(i.proxima) : (i.ultima ? 'Sem meta' : 'Pendente')
      const prazo = `${venc ? '! ' : ''}${prazoTexto(i.diasParaProxima)}`
      return `<tr class="${venc ? 'row-venc' : ''}"><td>${escapeHtml(i.nome)}</td><td>${i.ultima ? dateFmt(i.ultima) : '—'}</td><td class="strong">${escapeHtml(proximaTxt)}</td><td>${escapeHtml(prazo)}</td><td>${statusBadge(i.statusLabel)}</td><td class="num">${i.meta ? `${i.meta}d` : '—'}</td><td>${escapeHtml(i.responsavelUltima || '—')}</td><td class="num">${i.limpezasNoPeriodo ?? 0}</td></tr>`
    })
    .join('')
  return `<div class="table-block"><h3 class="table-title">Última e próxima limpeza por bebedouro<span>${chunk.length} ${chunk.length === 1 ? 'bebedouro' : 'bebedouros'}</span></h3><table class="cron-table">${header}<tbody>${rows}</tbody></table></div>`
}

function diaTableHtml(chunk) {
  const header = `<thead><tr class="legend-head"><th colspan="7">${legendaStatusHtml('dia')}</th></tr><tr><th>Bebedouro</th><th>Limpeza anterior</th><th>Limpeza do dia</th><th>Próxima prevista</th><th>Status</th><th>Intervalo / meta</th><th>Responsável</th></tr></thead>`
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
  return `<div class="table-block"><h3 class="table-title">Bebedouros limpos no dia<span>${chunk.length} ${chunk.length === 1 ? 'bebedouro' : 'bebedouros'}</span></h3><table class="dia-table">${header}<tbody>${rows}</tbody></table></div>`
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
  return `<div class="table-block"><h3 class="table-title">Ocorrências negativas<span>${chunk.length} ocorrência(s)</span></h3><table class="ocorr-table">${header}<tbody>${rows}</tbody></table></div>`
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

// === Montagem em fluxo ===
// Cada relatório declara blocos; o motor (flowEngine) mede o conteúdo real no
// navegador e distribui em quantas páginas forem necessárias.

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
  const ranking = input.itensRanking || []
  const kpisChk = input.checklistKPIs

  const sec1 = { sec: 'Cronograma de limpeza', lbl: 'Seção 1' }
  const sec2 = { sec: 'Pontos de atenção', lbl: 'Seção 2' }
  const secOcorr = { sec: 'Ocorrências', lbl: 'Seção 2' }

  const chartsData = []
  const blocks = []

  // --- Seção 1 ---
  blocks.push(flowBlock(flowIntro('Resumo do período', periodBadgeHtml(dados)), { ...sec1, keepNext: true }))
  if (ehDiaUnico) {
    blocks.push(flowBlock(`<div class="insight-box"><span class="insight-label">1. Bebedouros limpos em ${escapeHtml(dateFmt(diaUnico))}</span>Limpeza anterior, limpeza do dia e próxima limpeza prevista (limpeza do dia + meta).</div>`, sec1))
    if (input.limpezaDiaKPIs) blocks.push(flowBlock(kpisDiaHtml(input.limpezaDiaKPIs), sec1))
    if (limpezasDoDia.length > 0) {
      blocks.push(flowTable(diaTableHtml(limpezasDoDia), sec1))
    } else {
      blocks.push(flowBlock('<p class="beb-nota">Nenhum bebedouro foi limpo neste dia.</p>', sec1))
    }
  } else {
    blocks.push(flowBlock(`<div class="insight-box"><span class="insight-label">1. Cronograma de limpeza dos bebedouros</span>Última e próxima limpeza de cada bebedouro (próxima = última + meta), com prazo em relação a ${escapeHtml(dateFmt(input.dataFim))}.</div>`, sec1))
    if (input.limpezaKPIs) blocks.push(flowBlock(kpisPeriodoHtml(input.limpezaKPIs), sec1))
    if (input.maisAtrasado) {
      blocks.push(flowBlock(alertBox(`${input.maisAtrasado.nome} com ${input.maisAtrasado.dias} dias desde a última limpeza. Meta: ${input.maisAtrasado.meta} dias.`, 'crit', 'CRÍTICO — maior atraso:'), sec1))
    }
    if (proximas.length > 0) {
      blocks.push(flowBlock(alertBox(proximasSemanaTexto(proximas), 'warn', 'PRÓXIMOS 7 DIAS — limpezas previstas:'), sec1))
    }
    if (cronograma.length > 0) {
      blocks.push(flowTable(cronogramaTableHtml(cronograma), sec1))
    } else {
      blocks.push(flowBlock('<p class="beb-nota">Nenhum bebedouro cadastrado.</p>', sec1))
    }
  }

  // --- Seção 2 ---
  blocks.push(flowBlock(flowIntro('2. Pontos de atenção nos checklists dos bebedouros', ''), { ...sec2, keepNext: true }))
  blocks.push(flowBlock(kpisChecklistHtml(kpisChk), sec2))

  // Gráfico de problemas só quando há algum problema a mostrar; senão, uma
  // nota curta (barras todas em 0% não informam nada além do texto).
  const algumNegativo = ranking.some((r) => r.negativos > 0)
  if (algumNegativo) {
    chartsData.push({
      canvasId: 'chart-problemas',
      kind: 'problemas',
      items: ranking.map((r) => ({ label: r.label, valor: r.pctNegativo, negativos: r.negativos, total: r.total })),
    })
    blocks.push(flowBlock(`<div class="beb-chart">${chartCardLocal({ canvasId: 'chart-problemas', title: 'Problemas mais frequentes nos checklists', hasData: true })}</div>`, sec2))
  } else if (kpisChk.comChecklist > 0) {
    blocks.push(flowBlock(`<p class="beb-nota">Nenhuma resposta negativa nos ${kpisChk.comChecklist} checklist(s) do período (0% em todos os itens avaliados).</p>`, sec2))
  } else {
    blocks.push(flowBlock('<p class="beb-nota">Nenhum checklist respondido no período.</p>', sec2))
  }

  const porBeb = input.ocorrenciasPorBebedouro || []
  if (porBeb.length > 0) {
    const lista = porBeb.slice(0, 12).map((p) => `${escapeHtml(p.bebedouro)}: ${p.quantidade}`).join(' · ')
    const extra = porBeb.length > 12 ? ` · e mais ${porBeb.length - 12}` : ''
    blocks.push(flowBlock(`<div class="ocorr-resumo"><b>Ocorrências por bebedouro:</b> ${lista}${extra}</div>`, sec2))
  }
  if (ocorrencias.length > 0) {
    blocks.push(flowTable(ocorrenciasTableHtml(ocorrencias), secOcorr))
  } else if (algumNegativo || kpisChk.comChecklist > 0) {
    blocks.push(flowBlock('<div class="no-ocorr-box">Nenhuma ocorrência negativa nos checklists do período.</div>', sec2))
  }

  const body = flowSection({
    headerHtml: renderHeader({ ...brand, reportTitle: titulo, section: '__SEC__', sectionLabel: '__LBL__' }),
    footerHtml: footerHtml(dados, 0, 0),
    blocks,
  })

  const chartJsScript = await getChartJsScript()
  return htmlDocument({
    title: titulo,
    extraCss: BEBEDOUROS_CSS,
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
