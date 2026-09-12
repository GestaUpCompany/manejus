// Endpoint fino do relatório de Mortalidade. Toda a infraestrutura (Chrome,
// Chart.js, template HTML base, formatadores, labels de diagnóstico) mora em
// api/pdf/_shared/ para poder ser reaproveitada por outros relatórios
// Puppeteer (consumo, atividades, etc.). Aqui só existe o que é específico do
// relatório de morte: composição das páginas, gráficos usados e paginação da
// tabela de detalhamento.

import { escapeHtml, dateFmt, numFmt, intFmt, moneyFmt, titleCase } from './_shared/formatters.js'
import { diagLabel } from './_shared/labels.js'
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

// Limites do body do endpoint. Sem imagens de gráfico embutidas (agora
// renderizadas no servidor), o payload são só JSONs de linhas + resumo + logos.
// Cada linha de morte tem ~250 bytes em JSON; 20 mil linhas cabem folgadamente
// em 8MB e ainda sobra espaço pros logos base64.
const MAX_LINES = 20000
const MAX_BODY_BYTES = 8_000_000

// Quantas linhas do detalhamento cabem em uma página A4 landscape com o header
// e o footer padrão. Testado com 13px de fonte e ~30px por linha.
const DETAIL_ROWS_PER_PAGE = 20

function isPDFData(value) {
  if (!value || typeof value !== 'object') return false
  return (
    typeof value.dataInicio === 'string' &&
    typeof value.dataFim === 'string' &&
    typeof value.fazendaNome === 'string' &&
    Array.isArray(value.linhas) &&
    !!value.resumo &&
    typeof value.resumo === 'object'
  )
}

const compactDiagnostics = (items) => {
  if (!items) return '—'
  const labels = Object.entries(items)
    .filter(([, item]) => item && item.valor === 'S')
    .map(([chave]) => diagLabel(chave))
  return labels.length ? labels.join(', ') : '—'
}

function heatmapHtml(matriz) {
  if (!matriz || !matriz.causas.length || !matriz.categorias.length) return ''
  const maxVal = Math.max(
    1,
    ...matriz.causas.flatMap((c) => matriz.categorias.map((cat) => matriz.matriz[c]?.[cat] || 0)),
  )
  const ths = matriz.categorias
    .map(
      (cat) =>
        `<th style="text-align:center;padding:5px 8px;font-size:13px;color:#52635a;border-bottom:1px solid #d8e0db;font-weight:600;background:#fff;white-space:nowrap">${escapeHtml(titleCase(cat))}</th>`,
    )
    .join('')
  const trs = matriz.causas
    .map((causa) => {
      const cells = matriz.categorias
        .map((cat) => {
          const val = matriz.matriz[causa]?.[cat] || 0
          const intensity = val / maxVal
          const bg = val === 0 ? 'transparent' : `rgba(11,106,66,${0.12 + intensity * 0.68})`
          const color = intensity > 0.5 ? '#fff' : '#26352e'
          return `<td style="text-align:center;padding:5px 8px;font-size:13px;font-weight:${val > 0 ? 700 : 400};background:${bg};color:${color};border-bottom:1px solid #f0f4f2;min-width:28px">${val}</td>`
        })
        .join('')
      return `<tr><td style="text-align:left;padding:5px 8px;font-size:13px;font-weight:600;color:#26352e;border-bottom:1px solid #f0f4f2;white-space:nowrap;background:#fff">${escapeHtml(diagLabel(causa))}</td>${cells}</tr>`
    })
    .join('')
  return `<div class="heatmap-block"><h2 class="table-title">Causa × Categoria <span>Intensidade por cruzamento</span></h2><table class="heatmap-table" style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:5px 8px;font-size:13px;color:#52635a;border-bottom:1px solid #d8e0db;font-weight:600;background:#fff;white-space:nowrap">Causa \\ Categoria</th>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`
}

// CSS específico do relatório de morte (larguras das colunas do detalhamento,
// grids de página com layout duplo, tabelas auxiliares).
const MORTE_CSS = `
.page2-charts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:6mm}
.page2-charts .chart-card{height:92mm}
.page4-grid{display:grid;grid-template-columns:1fr 1fr;gap:7mm;align-items:start;height:80mm}
.distribution-insight{border-left:3px solid #c28a27;background:#fffaf0;border-radius:0 5px 5px 0;padding:6px 10px;margin:0 0 3mm;color:#52635a;font-size:14px;line-height:1.35}
.distribution-insight strong{color:#805d12}
.diag-freq{width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid #dce5df;border-radius:6px;overflow:hidden}
.diag-freq th{background:#0b6a42;color:#fff;font-size:12px;font-weight:700;text-align:left;padding:7px 10px;letter-spacing:.15px}
.diag-freq td{color:#4f5f56;font-size:13px;padding:7px 10px;border-bottom:1px solid #e5ebe7;vertical-align:middle}
.diag-freq tr.striped{background:#f7faf8}
.diag-freq th:nth-child(1){width:40%}
.diag-freq th:nth-child(2){width:12%}
.diag-freq th:nth-child(3){width:13%}
.diag-freq th:nth-child(4){width:35%}
.diag-bar{height:8px;background:#edf2ee;border-radius:4px;overflow:hidden}
.diag-bar i{display:block;height:100%;background:linear-gradient(90deg,#0b6a42,#1a8a5a);border-radius:4px}
.detail-table th:nth-child(1){width:8%}
.detail-table th:nth-child(2){width:11%}
.detail-table th:nth-child(3){width:8%}
.detail-table th:nth-child(4){width:7%}
.detail-table th:nth-child(5){width:9%}
.detail-table th:nth-child(6){width:8%}
.detail-table th:nth-child(7){width:10%}
.detail-table th:nth-child(8){width:11%}
.detail-table th:nth-child(9){width:28%}
.detail-table td{font-size:13px;padding:8px 6px;line-height:1.25}
.detail-table th{font-size:13px;padding:9px 6px}
`

// Script rodado dentro do browser headless para desenhar os 5 gráficos da
// mortalidade. Recebe os dados via window.__reportData. Chart.js é injetado
// como UMD antes desse script (ver htmlDocument em template.js), então
// `window.Chart` está disponível. Sinalizamos conclusão com
// window.__chartsReady = true para o Puppeteer aguardar antes de imprimir.
const CHARTS_INIT_JS = `
(function(){
  var GREEN_DARK = '#0b6a42'
  var LIGHT_GREEN = '#A8CDB8'
  var DARK_TEXT = '#26352e'
  var Chart = window.Chart
  if (!Chart) { window.__chartsReady = true; return }
  Chart.defaults.animation = false
  Chart.defaults.font.family = 'Arial, Helvetica, sans-serif'

  var data = window.__reportData || {}

  function titleCase(s){ return s ? String(s).trim().split(/\\s+/).map(function(w){return w.charAt(0).toUpperCase()+w.slice(1)}).join(' ') : s }

  function drawLote(){
    var el = document.getElementById('chart-lote'); if (!el) return
    var linhas = data.linhas || []
    if (!linhas.length) return
    var map = new Map()
    linhas.forEach(function(l){
      var nome = l.lote_nome || 'Sem lote'
      var ex = map.get(nome)
      if (ex) ex.count += 1; else map.set(nome, { label: nome, count: 1 })
    })
    var dados = Array.from(map.values()).sort(function(a,b){return b.count - a.count}).slice(0, 12)
    var total = dados.reduce(function(s,d){return s + d.count}, 0)
    new Chart(el, {
      type: 'bar',
      data: { labels: dados.map(function(d){return d.label}), datasets: [{ label:'Mortes', data: dados.map(function(d){return d.count}), backgroundColor: dados.map(function(_,i){return i === 0 ? GREEN_DARK : LIGHT_GREEN}), borderRadius: 3, borderSkipped: false, barPercentage: 0.55, categoryPercentage: 0.7, maxBarThickness: 40 }]},
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: false,
        layout: { padding: { top: 6, right: 60, bottom: 4, left: 4 } },
        plugins: { legend: { display:false }, title:{display:false}, tooltip:{enabled:false} },
        scales: {
          x: { beginAtZero:true, suggestedMax: Math.max.apply(null, dados.map(function(d){return d.count}).concat([1])) + 1, ticks:{ color: DARK_TEXT, font:{size:10, weight:'bold'}, precision:0 }, grid:{ color:'#E5E7EB' } },
          y: { grid:{display:false}, ticks:{ color: DARK_TEXT, font:{size:11, weight:'bold'} } },
        },
      },
      plugins: [{
        id: 'dataLabels',
        afterDatasetsDraw: function(chart){
          var ctx = chart.ctx; var area = chart.chartArea
          chart.data.datasets[0].data.forEach(function(value, i){
            var bar = chart.getDatasetMeta(0).data[i]; if (!bar) return
            var pct = total > 0 ? ((Number(value)/total)*100).toFixed(1).replace('.', ',') : '0,0'
            var label = value + ' · ' + pct + '%'
            var x = Math.min(bar.x + 6, area.right + 55)
            ctx.save(); ctx.fillStyle = DARK_TEXT; ctx.font = 'bold 11px sans-serif'; ctx.textAlign='left'
            ctx.fillText(label, x, bar.y + 3); ctx.restore()
          })
        }
      }]
    })
  }

  function drawBarrasHorizontais(canvasId, itens, ordenar){
    var el = document.getElementById(canvasId); if (!el) return
    if (!itens || !itens.length) return
    var top = (ordenar !== false ? itens.slice().sort(function(a,b){return b.valor - a.valor}) : itens.slice()).slice(0, 12)
    var total = top.reduce(function(sum,it){return sum + it.valor}, 0)
    new Chart(el, {
      type: 'bar',
      data: { labels: top.map(function(d){return titleCase(d.label)}), datasets: [{ data: top.map(function(d){return d.valor}), backgroundColor: top.map(function(_,i){return i === 0 ? GREEN_DARK : LIGHT_GREEN}), borderRadius: 3, borderSkipped: false, barPercentage: 0.55, categoryPercentage: 0.7, maxBarThickness: 40 }]},
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: false,
        layout: { padding: { top: 6, right: 60, bottom: 4, left: 4 } },
        plugins: { legend:{display:false}, title:{display:false}, tooltip:{enabled:false} },
        scales: {
          x: { beginAtZero:true, suggestedMax: Math.max.apply(null, top.map(function(d){return d.valor}).concat([1])) + 1, ticks:{ color: DARK_TEXT, font:{size:10, weight:'bold'}, precision:0 }, grid:{ color:'#E5E7EB' } },
          y: { grid:{display:false}, ticks:{ color: DARK_TEXT, font:{size:11, weight:'bold'} } },
        },
      },
      plugins: [{
        id: 'dataLabels',
        afterDatasetsDraw: function(chart){
          var ctx = chart.ctx; var area = chart.chartArea
          chart.data.datasets[0].data.forEach(function(value, i){
            var bar = chart.getDatasetMeta(0).data[i]; if (!bar) return
            var pct = total > 0 ? ((Number(value)/total)*100).toFixed(1).replace('.', ',') : '0,0'
            var label = value + ' · ' + pct + '%'
            var x = Math.min(bar.x + 6, area.right + 55)
            ctx.save(); ctx.fillStyle = DARK_TEXT; ctx.font = 'bold 11px sans-serif'; ctx.textAlign='left'
            ctx.fillText(label, x, bar.y + 3); ctx.restore()
          })
        }
      }]
    })
  }

  drawLote()
  drawBarrasHorizontais('chart-causa', (data.resumo && data.resumo.por_causa) || [])
  drawBarrasHorizontais('chart-categoria', (data.resumo && data.resumo.por_categoria) || [])
  drawBarrasHorizontais('chart-sexo', (data.resumo && data.resumo.por_sexo) || [])
  drawBarrasHorizontais('chart-pasto', (data.resumo && data.resumo.por_pasto) || [])

  window.__chartsReady = true
})();
`

async function renderMorteHtml(input) {
  const resumo = input.resumo
  const rows = [...input.linhas].sort((a, b) =>
    a.data !== b.data ? b.data.localeCompare(a.data) : (a.lote_nome ?? '').localeCompare(b.lote_nome ?? ''),
  )
  const causa = resumo.causa_mais_frequente ? `${resumo.causa_mais_frequente} (${resumo.causa_mais_frequente_count ?? 0})` : '—'
  const diagnosticos = resumo.frequencia_diagnosticos ?? []
  const diagnosticoTotal = diagnosticos.reduce((sum, item) => sum + item.valor, 0)
  const diagnosticosVisiveis = [...diagnosticos].sort((a, b) => b.valor - a.valor).slice(0, 6)
  const diagnosticoRows = diagnosticosVisiveis
    .map((item, index) => {
      const pct = diagnosticoTotal ? (item.valor / diagnosticoTotal) * 100 : 0
      return `<tr class="${index % 2 ? '' : 'striped'}"><td>${escapeHtml(diagLabel(item.label))}</td><td class="numeric">${item.valor}</td><td class="numeric">${pct.toFixed(1).replace('.', ',')}%</td><td><div class="diag-bar"><i style="width:${Math.max(2, pct)}%"></i></div></td></tr>`
    })
    .join('')

  const previous = resumo.periodo_anterior ? `${intFmt(resumo.periodo_anterior.total_mortes)} mortes` : '—'
  const previousSub = resumo.periodo_anterior
    ? `${dateFmt(resumo.periodo_anterior.data_inicio)} a ${dateFmt(resumo.periodo_anterior.data_fim)}`
    : 'Sem comparação disponível'
  const insights =
    resumo.insights ||
    `Foram registradas ${intFmt(resumo.total_mortes)} mortes no período, com taxa de mortalidade de ${resumo.taxa_mortalidade != null ? `${numFmt(resumo.taxa_mortalidade)}%` : '—'}.`
  const totalCategorias = (resumo.por_categoria ?? []).reduce((sum, item) => sum + item.valor, 0)
  const categoriaPrincipal = [...(resumo.por_categoria ?? [])].sort((a, b) => b.valor - a.valor)[0]
  const sexoPrincipal = [...(resumo.por_sexo ?? [])].sort((a, b) => b.valor - a.valor)[0]
  const distribuicaoInsight =
    categoriaPrincipal && sexoPrincipal
      ? `${titleCase(categoriaPrincipal.label)} concentra ${totalCategorias ? ((categoriaPrincipal.valor / totalCategorias) * 100).toFixed(1).replace('.', ',') : '0,0'}% das mortes; ${sexoPrincipal.label.toLowerCase()} representa ${resumo.total_mortes ? ((sexoPrincipal.valor / resumo.total_mortes) * 100).toFixed(1).replace('.', ',') : '0,0'}% dos registros.`
      : ''

  // Paginação da tabela de detalhamento: chunks de DETAIL_ROWS_PER_PAGE
  const detailChunks = rows.length === 0 ? [[]] : []
  for (let i = 0; i < rows.length; i += DETAIL_ROWS_PER_PAGE) {
    detailChunks.push(rows.slice(i, i + DETAIL_ROWS_PER_PAGE))
  }
  const totalPages = 4 + detailChunks.length

  const brand = { logoGestao: input.logoGestao, logoFazenda: input.logoFazenda, fazendaNome: input.fazendaNome }
  const period = { dataInicio: input.dataInicio, dataFim: input.dataFim }

  const hasPor = (arr) => Array.isArray(arr) && arr.length > 0

  const page1 = pageSection(`
    ${renderHeader({ ...brand, reportTitle: 'Relatório de Mortalidade', section: 'Resumo executivo', sectionLabel: 'Visão geral' })}
    <p class="section-kicker">Resumo do período</p>
    <div class="period-badge">${dateFmt(input.dataInicio)} <span style="padding:0 7px;color:#9bb1a4">até</span> ${dateFmt(input.dataFim)}</div>
    <div class="insight-box"><span class="insight-label">Análise do período</span>${escapeHtml(insights)}</div>
    <div class="kpi-grid">
      ${kpi(intFmt(resumo.total_mortes), 'Total de mortes')}
      ${kpi(resumo.taxa_mortalidade != null ? `${numFmt(resumo.taxa_mortalidade)}%` : '—', 'Taxa de mortalidade', resumo.rebanho_total ? `Rebanho: ${intFmt(resumo.rebanho_total)} cabeças` : '', 'gold')}
      ${kpi(numFmt(resumo.media_por_dia, 2), 'Mortes por dia', 'Média do período')}
      ${kpi(numFmt(resumo.peso_medio, 1), 'Peso médio', 'kg por animal')}
    </div>
    <div class="kpi-grid secondary">
      ${kpi(causa, 'Causa mais frequente')}
      ${kpi(resumo.perda_estimada != null ? `R$ ${moneyFmt(resumo.perda_estimada)}` : '—', 'Perda estimada', resumo.peso_total_perdido != null ? `${numFmt(resumo.peso_total_perdido, 0)} kg perdidos` : '', 'red')}
      ${kpi(previous, 'Período anterior', previousSub, 'gold')}
    </div>
    ${renderFooter({ ...period, page: 1, totalPages })}
  `)

  const page2 = pageSection(`
    ${renderHeader({ ...brand, reportTitle: 'Relatório de Mortalidade', section: 'Distribuição temporal', sectionLabel: 'Análise' })}
    <p class="section-kicker">Evolução e causas</p>
    <div class="page2-charts">
      ${chartCard({ canvasId: 'chart-lote', title: 'Mortes por lote', subtitle: 'Concentração por lote no período', hasData: input.linhas.length > 0 })}
      ${chartCard({ canvasId: 'chart-causa', title: 'Mortes por causa', subtitle: 'Distribuição das causas registradas', hasData: hasPor(resumo.por_causa) })}
    </div>
    ${renderFooter({ ...period, page: 2, totalPages })}
  `)

  const page3 = pageSection(`
    ${renderHeader({ ...brand, reportTitle: 'Relatório de Mortalidade', section: 'Distribuição demográfica', sectionLabel: 'Análise' })}
    <p class="section-kicker">Categoria e sexo</p>
    <div class="page2-charts">
      ${chartCard({ canvasId: 'chart-categoria', title: 'Mortes por categoria', subtitle: 'Quantidade e participação por categoria', hasData: hasPor(resumo.por_categoria) })}
      ${chartCard({ canvasId: 'chart-sexo', title: 'Mortes por sexo', subtitle: 'Quantidade e participação por sexo', hasData: hasPor(resumo.por_sexo) })}
    </div>
    ${distribuicaoInsight ? `<div class="distribution-insight"><strong>Leitura executiva:</strong> ${escapeHtml(distribuicaoInsight)}</div>` : ''}
    ${renderFooter({ ...period, page: 3, totalPages })}
  `)

  const page4 = pageSection(`
    ${renderHeader({ ...brand, reportTitle: 'Relatório de Mortalidade', section: 'Pastos e cruzamentos', sectionLabel: 'Análise cruzada' })}
    <p class="section-kicker">Concentração geográfica e causa-categoria</p>
    <div class="page4-grid">
      <div>${chartCard({ canvasId: 'chart-pasto', title: 'Mortes por pasto', subtitle: 'Distribuição por pasto', hasData: hasPor(resumo.por_pasto), height: '100%' })}</div>
      <div>${heatmapHtml(resumo.matriz_causa_categoria)}</div>
    </div>
    ${diagnosticoRows ? `<div class="table-block" style="margin-top:10mm"><h2 class="table-title">Diagnósticos mais frequentes <span>${diagnosticosVisiveis.length} de ${diagnosticos.length} categorias</span></h2><table class="diag-freq"><thead><tr><th>Diagnóstico</th><th>Mortes</th><th>% do total</th><th>Distribuição</th></tr></thead><tbody>${diagnosticoRows}</tbody></table></div>` : ''}
    ${renderFooter({ ...period, page: 4, totalPages })}
  `)

  const detailHeader = `<thead><tr><th>Data</th><th>Lote</th><th>Pasto</th><th>Sexo</th><th>Idade</th><th>Peso</th><th>Categoria</th><th>Causa</th><th>Diagnósticos</th></tr></thead>`
  const renderDetailRow = (line, index) =>
    `<tr class="${index % 2 ? '' : 'striped'}"><td>${dateFmt(line.data)}</td><td>${escapeHtml(line.lote_nome)}</td><td>${escapeHtml(line.pasto)}</td><td>${escapeHtml(line.sexo)}</td><td>${escapeHtml(line.idade)}</td><td class="numeric">${numFmt(line.peso_vivo, 0)}</td><td>${escapeHtml(titleCase(line.categoria))}</td><td>${escapeHtml(line.causa_morte)}</td><td>${escapeHtml(compactDiagnostics(line.diagnosticos))}</td></tr>`

  const detailPages = detailChunks
    .map((chunk, chunkIndex) => {
      const startRow = chunkIndex * DETAIL_ROWS_PER_PAGE
      const bodyRows = chunk.map((line, i) => renderDetailRow(line, startRow + i)).join('')
      const isFirstChunk = chunkIndex === 0
      const isLastChunk = chunkIndex === detailChunks.length - 1
      const suffix = detailChunks.length > 1 ? ` (${chunkIndex + 1}/${detailChunks.length})` : ''
      const sectionName = `Detalhamento${suffix}`
      const content = bodyRows
        ? `<div class="table-block"><h2 class="table-title">Registros detalhados <span>${rows.length} registro(s)${isFirstChunk && !isLastChunk ? ` · exibindo ${startRow + 1}–${startRow + chunk.length}` : detailChunks.length > 1 ? ` · exibindo ${startRow + 1}–${startRow + chunk.length}` : ''}</span></h2><table class="detail-table">${detailHeader}<tbody>${bodyRows}</tbody></table></div>`
        : '<div class="empty-chart" style="height:40mm">Nenhum registro detalhado no período</div>'
      return pageSection(`
        ${renderHeader({ ...brand, reportTitle: 'Relatório de Mortalidade', section: sectionName, sectionLabel: 'Registros' })}
        <p class="section-kicker">Rastreabilidade dos registros</p>
        ${content}
        ${renderFooter({ ...period, page: 4 + chunkIndex + 1, totalPages })}
      `)
    })
    .join('')

  const chartJsScript = await getChartJsScript()
  return htmlDocument({
    title: 'Relatório de Mortalidade',
    extraCss: MORTE_CSS,
    body: `${page1}${page2}${page3}${page4}${detailPages}`,
    chartJsScript,
    chartsInit: CHARTS_INIT_JS,
    dataJson: {
      dataInicio: input.dataInicio,
      dataFim: input.dataFim,
      linhas: input.linhas.map((l) => ({ data: l.data, lote_nome: l.lote_nome })),
      resumo: {
        por_causa: resumo.por_causa ?? [],
        por_categoria: resumo.por_categoria ?? [],
        por_sexo: resumo.por_sexo ?? [],
        por_pasto: resumo.por_pasto ?? [],
      },
    },
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método não permitido' })
  }
  const body = req.body
  if (!isPDFData(body) || body.linhas.length > MAX_LINES) {
    return res.status(400).json({ error: 'Payload de relatório inválido ou grande demais' })
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Payload do relatório excede o limite permitido' })
  }

  try {
    console.log('[PDF Morte] Iniciando renderização. Linhas:', body.linhas.length)
    const html = await renderMorteHtml(body)
    console.log('[PDF Morte] HTML montado. Bytes:', Buffer.byteLength(html, 'utf8'))
    const pdf = await generatePdf({
      html,
      format: 'A4',
      landscape: true,
      beforePdf: async (page) => {
        await page.waitForFunction('window.__chartsReady === true', { timeout: 15000 }).catch(() => {})
      },
    })
    console.log('[PDF Morte] PDF gerado. Bytes:', pdf.length)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-mortalidade.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PDF-Renderer', 'puppeteer')
    return res.status(200).send(pdf)
  } catch (error) {
    console.error('[PDF Morte] Erro ao gerar relatório:', error)
    console.error('[PDF Morte] Stack:', error?.stack || 'sem stack')
    return res.status(500).json({ error: 'Não foi possível gerar o PDF', detail: String(error) })
  }
}
