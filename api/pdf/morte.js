// Endpoint fino do relatório de Mortalidade. Toda a infraestrutura (Chrome,
// Chart.js, template HTML base, formatadores, labels de diagnóstico) mora em
// api/pdf/_shared/ para poder ser reaproveitada por outros relatórios
// Puppeteer (consumo, atividades, etc.). Aqui só existe o que é específico do
// relatório de morte: composição das páginas, gráficos usados e paginação da
// tabela de detalhamento.

import { escapeHtml, dateFmt, numFmt, intFmt, moneyFmt, titleCase } from './_shared/formatters.js'
import { diagLabel } from './_shared/labels.js'
import { getChartJsScript } from './_shared/chartjs.js'
import { getMaplibreAssets } from './_shared/maplibre.js'
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
// e o footer padrão. Com padding/fonte reduzidos e diagnósticos em clamp de 2
// linhas, 12 linhas por página sem risco de clipping.
const DETAIL_ROWS_PER_PAGE = 12

// Paginação da tabela de diagnósticos: página dedicada (o conteúdo antigo da
// página de pastos foi absorvido pela grade 2x2 da página 2). Cada página
// comporta ~12 linhas; o relatório exibe no máximo as 24 categorias top.
const DIAG_MAX_ROWS = 24
const DIAG_ROWS_PER_PAGE = 12

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
  return `<div class="heatmap-block"><h2 class="table-title">Causa × Categoria <span>Intensidade por cruzamento</span></h2><table class="heatmap-table" style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:5px 8px;font-size:13px;color:#52635a;border-bottom:1px solid #d8e0db;font-weight:600;background:#fff;white-space:nowrap">Causa</th>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`
}

// CSS específico do relatório de morte (larguras das colunas do detalhamento,
// grids de página com layout duplo, tabelas auxiliares).
const MORTE_CSS = `
.kpi-card{min-height:20mm}
.insight-box{max-height:34mm;overflow:hidden}
.page1-charts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4mm}
.page1-charts .chart-card{height:50mm}
.page1-charts .chart-heading strong{font-size:14px}
.page1-charts .chart-heading span{font-size:11px}
.page2-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.page2-grid .chart-card{height:58mm}
.page2-grid .chart-heading strong{font-size:14px}
.page2-grid .chart-heading span{font-size:11px}
.page2-grid .heatmap-block{height:58mm;overflow:hidden;border:1px solid #dce5df;border-radius:6px;padding:8px;background:#fff}
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
.morte-detail-table th:nth-child(1){width:11%}
.morte-detail-table th:nth-child(2){width:11%}
.morte-detail-table th:nth-child(3){width:8%}
.morte-detail-table th:nth-child(4){width:7%}
.morte-detail-table th:nth-child(5){width:9%}
.morte-detail-table th:nth-child(6){width:8%}
.morte-detail-table th:nth-child(7){width:10%}
.morte-detail-table th:nth-child(8){width:11%}
.morte-detail-table th:nth-child(9){width:25%}
.morte-detail-table td{font-size:12px;padding:5px 5px;line-height:1.2}
.morte-clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.morte-detail-table th{font-size:12px;padding:7px 5px}
.morte-detail-table th, .morte-detail-table td{border-right:1px solid #d8e0db}
.morte-detail-table th:last-child, .morte-detail-table td:last-child{border-right:none}
.morte-detail-table tbody tr:nth-child(even){background:#f7faf8}
.map-row{display:grid;grid-template-columns:1fr;gap:6px;margin-bottom:4mm}
.map-card{height:118mm;border:1px solid #dce5df;border-radius:6px;padding:8px;background:#fff;overflow:hidden;display:flex;flex-direction:column}
.map-card .chart-heading{height:auto;min-height:8mm;padding-bottom:2.5mm}
.map-body{flex:1;min-height:0;position:relative;border-radius:4px;overflow:hidden;background:#3a4a3a}
#mapa-morte{position:absolute;inset:0}
.map-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#93a099;font-size:13px;background:#fafcfb}
.map-ranking{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.map-ranking .rank-label{font-size:12px;color:#8a9890;margin-right:4px}
.map-ranking .rank-pill{border:1px solid #dce5df;border-radius:999px;padding:3px 10px;font-size:12px;color:#30463a;background:#f6f9f7}
.map-ranking .rank-pill b{color:#991b1b}
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

// Script do mapa de mortalidade: instancia MapLibre (UMD injetado antes deste
// bloco) com os mesmos tiles ESRI World Imagery e o mesmo estilo de camadas do
// MapaFazenda.tsx (pastos verdes translúcidos com contorno e label, mortes como
// círculos vermelhos). Enquadra todos os pontos e sinaliza window.__mapReady
// para o Puppeteer imprimir. Se WebGL não estiver disponível no Chromium
// headless, cai num SVG equiretangular com polígonos + círculos.
const MAP_INIT_JS = `
(function(){
  var done = false
  function finish(){ if (!done) { done = true; window.__mapReady = true } }
  // Trava de segurança: o PDF nunca fica refém de tiles ou do mapa.
  setTimeout(finish, 20000)

  var data = window.__reportData || {}
  var mapa = data.mapa || {}
  var pontos = mapa.pontos || []
  var pastosFC = mapa.pastos || { type: 'FeatureCollection', features: [] }

  var elGeral = document.getElementById('mapa-morte')
  if (!elGeral) { finish(); return }

  function toFC(pts){
    return { type: 'FeatureCollection', features: pts.map(function(p){ return { type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: {} } }) }
  }

  // maplibre-gl v5 removeu supported() da API pública; o construtor do Map
  // lança exceção quando WebGL não está disponível, o que o catch cobre.
  if (!pontos.length || !window.maplibregl) {
    renderFallback(elGeral, pontos)
    finish()
    return
  }

  var style = {
    version: 8,
    sources: {
      esri: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 },
      esriLabels: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 }
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#3a4a3a' } },
      { id: 'esri', type: 'raster', source: 'esri' },
      { id: 'esri-labels', type: 'raster', source: 'esriLabels' }
    ]
  }

  function fitTo(map, pts){
    if (pts.length === 1) { map.jumpTo({ center: pts[0], zoom: 14 }); return }
    var b = new maplibregl.LngLatBounds(pts[0], pts[0])
    pts.forEach(function(p){ b.extend(p) })
    map.fitBounds(b, { padding: 60, maxZoom: 15, duration: 0 })
  }

  function buildMap(el, fitPts){
    var map = new maplibregl.Map({
      container: el, style: style, center: [-55, -13], zoom: 4,
      attributionControl: false, interactive: false, fadeDuration: 0
    })
    function mapDone(){ if (!signaled) { signaled = true; finish() } }
    map.on('load', function(){
      if (pastosFC.features.length) {
        map.addSource('pastos', { type: 'geojson', data: pastosFC })
        map.addLayer({ id: 'pastos-fill', type: 'fill', source: 'pastos', paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.25 } })
        map.addLayer({ id: 'pastos-line', type: 'line', source: 'pastos', paint: { 'line-color': '#16a34a', 'line-width': 2 } })
        map.addLayer({ id: 'pastos-label', type: 'symbol', source: 'pastos', layout: { 'text-field': ['get', 'nome'], 'text-size': 11, 'text-allow-overlap': true }, paint: { 'text-color': '#15803d', 'text-halo-color': '#ffffff', 'text-halo-width': 2 } })
      }
      map.addSource('mortes', { type: 'geojson', data: toFC(fitPts) })
      map.addLayer({
        id: 'mortes-pontos', type: 'circle', source: 'mortes',
        paint: { 'circle-radius': 7, 'circle-color': '#991b1b', 'circle-opacity': 0.9, 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' }
      })
      fitTo(map, fitPts)
      // Primeiro idle após o fit: tiles da viewport final já terminaram.
      map.once('idle', mapDone)
      setTimeout(mapDone, 12000)
    })
    map.on('error', function(){ /* falhas de tile não bloqueiam; idle/timeout resolvem */ })
    return map
  }

  try {
    buildMap(elGeral, pontos)
  } catch (e) {
    renderFallback(elGeral, pontos)
    finish()
  }

  function renderFallback(el, pts){
    if (!pts.length) {
      el.innerHTML = '<div class="map-empty">Nenhuma morte com geolocalização no período</div>'
      return
    }
    // Coleta vértices dos pastos junto com os pontos para o enquadramento.
    var all = pts.slice()
    pastosFC.features.forEach(function(f){
      var rings = f.geometry && f.geometry.type === 'MultiPolygon'
        ? f.geometry.coordinates.map(function(poly){ return poly[0] })
        : f.geometry && f.geometry.coordinates ? [f.geometry.coordinates[0]] : []
      rings.forEach(function(ring){ ring.forEach(function(c){ all.push(c) }) })
    })
    var lats = all.map(function(p){ return p[1] })
    var lngs = all.map(function(p){ return p[0] })
    var minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats)
    var minLng = Math.min.apply(null, lngs), maxLng = Math.max.apply(null, lngs)
    var W = 1000, H = 560, pad = 50
    var scale = Math.min((W - 2 * pad) / Math.max(maxLng - minLng, 0.0001), (H - 2 * pad) / Math.max(maxLat - minLat, 0.0001))
    var cx = (minLng + maxLng) / 2, cy = (minLat + maxLat) / 2
    function xy(p){ return [W / 2 + (p[0] - cx) * scale, H / 2 - (p[1] - cy) * scale] }
    var polys = pastosFC.features.map(function(f){
      var rings = f.geometry && f.geometry.type === 'MultiPolygon'
        ? f.geometry.coordinates.map(function(poly){ return poly[0] })
        : f.geometry && f.geometry.coordinates ? [f.geometry.coordinates[0]] : []
      return rings.map(function(ring){
        var d = ring.map(function(c, i){ var q = xy(c); return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1) }).join('') + 'Z'
        return '<path d="' + d + '" fill="#22c55e" fill-opacity="0.25" stroke="#16a34a" stroke-width="2"/>'
      }).join('')
    }).join('')
    var labels = pastosFC.features.map(function(f){
      var ring = f.geometry && f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates[0][0] : (f.geometry && f.geometry.coordinates ? f.geometry.coordinates[0] : null)
      if (!ring || !ring.length || !f.properties || !f.properties.nome) return ''
      var sx = 0, sy = 0
      ring.forEach(function(c){ var q = xy(c); sx += q[0]; sy += q[1] })
      return '<text x="' + (sx / ring.length).toFixed(1) + '" y="' + (sy / ring.length).toFixed(1) + '" text-anchor="middle" font-size="14" font-weight="700" fill="#15803d" stroke="#ffffff" stroke-width="0.6" paint-order="stroke">' + String(f.properties.nome).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</text>'
    }).join('')
    var circles = pts.map(function(p){
      var q = xy(p)
      return '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="7" fill="#991b1b" fill-opacity="0.9" stroke="#ffffff" stroke-width="2"/>'
    }).join('')
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:100%;background:#eef3ee">' + polys + labels + circles + '</svg>'
  }
})();
`

// `incluirMapa` liga a página de mapa apenas quando há mortes
// georreferenciadas: sem coordenadas, nenhuma seção de mapa é renderizada.
export async function renderMorteHtml(input, { incluirMapa = false } = {}) {
  const resumo = input.resumo
  const rows = [...input.linhas].sort((a, b) =>
    a.data !== b.data ? b.data.localeCompare(a.data) : (a.lote_nome ?? '').localeCompare(b.lote_nome ?? ''),
  )
  const causa = resumo.causa_mais_frequente ? `${resumo.causa_mais_frequente} (${resumo.causa_mais_frequente_count ?? 0})` : '—'
  const diagnosticos = resumo.frequencia_diagnosticos ?? []
  const diagnosticoTotal = diagnosticos.reduce((sum, item) => sum + item.valor, 0)
  const diagnosticosVisiveis = [...diagnosticos].sort((a, b) => b.valor - a.valor).slice(0, DIAG_MAX_ROWS)
  const diagnosticoLinhas = diagnosticosVisiveis
    .map((item, index) => {
      const pct = diagnosticoTotal ? (item.valor / diagnosticoTotal) * 100 : 0
      return `<tr class="${index % 2 ? '' : 'striped'}"><td>${escapeHtml(diagLabel(item.label))}</td><td class="numeric">${item.valor}</td><td class="numeric">${pct.toFixed(1).replace('.', ',')}%</td><td><div class="diag-bar"><i style="width:${Math.max(2, pct)}%"></i></div></td></tr>`
    })
  const diagChunks = []
  for (let i = 0; i < diagnosticoLinhas.length; i += DIAG_ROWS_PER_PAGE) {
    diagChunks.push(diagnosticoLinhas.slice(i, i + DIAG_ROWS_PER_PAGE))
  }
  const diagPageCount = diagChunks.length
  const diagHead = `<thead><tr><th>Diagnóstico</th><th>Mortes</th><th>% do total</th><th>Distribuição</th></tr></thead>`
  const diagTitulo = `Diagnósticos mais frequentes <span>${diagnosticosVisiveis.length} de ${diagnosticos.length} categorias</span>`

  const insights =
    resumo.insights ||
    `Foram registradas ${intFmt(resumo.total_mortes)} mortes no período, com taxa de mortalidade de ${resumo.taxa_mortalidade != null ? `${numFmt(resumo.taxa_mortalidade)}%` : '—'}.`
  const totalCategorias = (resumo.por_categoria ?? []).reduce((sum, item) => sum + item.valor, 0)
  const categoriaPrincipal = [...(resumo.por_categoria ?? [])].sort((a, b) => b.valor - a.valor)[0]
  const sexoPrincipal = [...(resumo.por_sexo ?? [])].sort((a, b) => b.valor - a.valor)[0]
  // Lote com mais mortes no recorte: agrega as linhas por lote_nome (o resumo
  // não traz por_lote; as linhas já vêm filtradas pelo período do relatório).
  const loteCount = new Map()
  for (const l of input.linhas) {
    const nome = l.lote_nome || 'Sem lote'
    loteCount.set(nome, (loteCount.get(nome) || 0) + 1)
  }
  const lotePrincipal = [...loteCount.entries()].sort((a, b) => b[1] - a[1])[0]
  const loteSub = lotePrincipal
    ? `${intFmt(lotePrincipal[1])} ${lotePrincipal[1] === 1 ? 'morte' : 'mortes'} (${resumo.total_mortes ? Math.round((lotePrincipal[1] / resumo.total_mortes) * 100) : 0}%)`
    : ''
  const categoriaSub = categoriaPrincipal
    ? `${intFmt(categoriaPrincipal.valor)} ${categoriaPrincipal.valor === 1 ? 'morte' : 'mortes'} (${resumo.total_mortes ? Math.round((categoriaPrincipal.valor / resumo.total_mortes) * 100) : 0}% do total)`
    : ''
  const distribuicaoInsight =
    categoriaPrincipal && sexoPrincipal
      ? `${titleCase(categoriaPrincipal.label)} concentra ${totalCategorias ? ((categoriaPrincipal.valor / totalCategorias) * 100).toFixed(1).replace('.', ',') : '0,0'}% das mortes; ${sexoPrincipal.label.toLowerCase()} representa ${resumo.total_mortes ? ((sexoPrincipal.valor / resumo.total_mortes) * 100).toFixed(1).replace('.', ',') : '0,0'}% dos registros.`
      : ''

  // Coordenadas válidas para o mapa (vêm das linhas da RPC desde que a
  // migration 20260916120000 passou a expor latitude/longitude).
  const linhasGeo = input.linhas.filter((l) => Number.isFinite(l?.latitude) && Number.isFinite(l?.longitude))
  const pontos = linhasGeo.map((l) => [l.longitude, l.latitude])
  const temPaginaMapa = incluirMapa && pontos.length > 0

  // Geometrias dos pastos (vêm do payload via RPC pastos_geo). Montadas como
  // FeatureCollection para o MapLibre e para o fallback SVG.
  const pastosFC = {
    type: 'FeatureCollection',
    features: (Array.isArray(input.pastosGeo) ? input.pastosGeo : [])
      .filter((p) => p && p.geometry && p.geometry.coordinates)
      .map((p) => ({ type: 'Feature', properties: { nome: p.nome || '' }, geometry: p.geometry })),
  }

  // Ranking de pastos entre as mortes georreferenciadas (campo textual já
  // preenchido no registro).
  const pastoCount = new Map()
  for (const l of linhasGeo) {
    if (l.pasto) pastoCount.set(l.pasto, (pastoCount.get(l.pasto) || 0) + 1)
  }
  const rankingPastos = [...pastoCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)

  // Paginação da tabela de detalhamento: chunks de DETAIL_ROWS_PER_PAGE
  const detailChunks = rows.length === 0 ? [[]] : []
  for (let i = 0; i < rows.length; i += DETAIL_ROWS_PER_PAGE) {
    detailChunks.push(rows.slice(i, i + DETAIL_ROWS_PER_PAGE))
  }
  const totalPages = 2 + diagPageCount + (temPaginaMapa ? 1 : 0) + detailChunks.length

  const brand = { logoGestao: input.logoGestao, logoFazenda: input.logoFazenda, fazendaNome: input.fazendaNome }
  const period = { dataInicio: input.dataInicio, dataFim: input.dataFim }

  const hasPor = (arr) => Array.isArray(arr) && arr.length > 0

  const page1 = pageSection(`
    ${renderHeader({ ...brand, reportTitle: 'Relatório de Mortalidade', section: 'Resumo executivo', sectionLabel: 'Visão geral' })}
    <p class="section-kicker">Resumo do período</p>
    <div class="insight-box"><span class="insight-label">Análise do período</span>${escapeHtml(insights)}</div>
    <div class="kpi-grid">
      ${kpi(intFmt(resumo.total_mortes), 'Total de mortes', 'No período selecionado')}
      ${kpi(resumo.taxa_mortalidade != null ? `${numFmt(resumo.taxa_mortalidade)}%` : '—', 'Taxa de mortalidade', resumo.rebanho_total ? `Acumulada · rebanho: ${intFmt(resumo.rebanho_total)} cabeças` : 'Acumulada', 'gold')}
      ${kpi(lotePrincipal ? lotePrincipal[0] : '—', 'Lote mais afetado', loteSub)}
      ${kpi(numFmt(resumo.peso_medio, 1), 'Peso médio', 'kg por animal')}
    </div>
    <div class="kpi-grid secondary">
      ${kpi(causa, 'Causa mais frequente')}
      ${kpi(resumo.perda_estimada != null ? `R$ ${moneyFmt(resumo.perda_estimada)}` : '—', 'Perda estimada', resumo.peso_total_perdido != null ? `${numFmt(resumo.peso_total_perdido, 0)} kg perdidos` : '', 'red')}
      ${kpi(categoriaPrincipal ? titleCase(categoriaPrincipal.label) : '—', 'Categoria mais afetada', categoriaSub)}
    </div>
    <div class="page1-charts">
      ${chartCard({ canvasId: 'chart-lote', title: 'Mortes por lote', subtitle: 'Concentração por lote no período', hasData: input.linhas.length > 0 })}
      ${chartCard({ canvasId: 'chart-causa', title: 'Mortes por causa', subtitle: 'Distribuição das causas registradas', hasData: hasPor(resumo.por_causa) })}
    </div>
    ${renderFooter({ ...period, page: 1, totalPages })}
  `)

  const page2 = pageSection(`
    ${renderHeader({ ...brand, reportTitle: 'Relatório de Mortalidade', section: 'Distribuições', sectionLabel: 'Análise' })}
    <p class="section-kicker">Categoria, sexo e pasto</p>
    <div class="page2-grid">
      ${chartCard({ canvasId: 'chart-categoria', title: 'Mortes por categoria', subtitle: 'Quantidade e participação por categoria', hasData: hasPor(resumo.por_categoria) })}
      ${chartCard({ canvasId: 'chart-sexo', title: 'Mortes por sexo', subtitle: 'Quantidade e participação por sexo', hasData: hasPor(resumo.por_sexo) })}
      ${chartCard({ canvasId: 'chart-pasto', title: 'Mortes por pasto', subtitle: 'Distribuição por pasto', hasData: hasPor(resumo.por_pasto) })}
      ${heatmapHtml(resumo.matriz_causa_categoria) || '<div class="chart-card"><div class="empty-chart">Sem dados de cruzamento causa × categoria</div></div>'}
    </div>
    ${distribuicaoInsight ? `<div class="distribution-insight"><strong>Leitura executiva:</strong> ${escapeHtml(distribuicaoInsight)}</div>` : ''}
    ${renderFooter({ ...period, page: 2, totalPages })}
  `)

  const diagPages = diagChunks
    .map((chunk, i) => pageSection(`
      ${renderHeader({ ...brand, reportTitle: 'Relatório de Mortalidade', section: `Diagnósticos${diagPageCount > 1 ? ` (${i + 1}/${diagPageCount})` : ''}`, sectionLabel: 'Análise cruzada' })}
      <p class="section-kicker">Diagnósticos mais frequentes</p>
      <div class="table-block"><h2 class="table-title">${diagTitulo}</h2><table class="diag-freq">${diagHead}<tbody>${chunk.join('')}</tbody></table></div>
      ${renderFooter({ ...period, page: 3 + i, totalPages })}
    `))
    .join('')

  const rankingHtml = rankingPastos.length
    ? `<div class="map-ranking"><span class="rank-label">Concentração por pasto (mortes georreferenciadas):</span>${rankingPastos
        .map(([nome, n]) => `<span class="rank-pill"><b>${escapeHtml(nome)}</b> · ${n} ${n === 1 ? 'morte' : 'mortes'} (${pontos.length ? Math.round((n / pontos.length) * 100) : 0}%)</span>`)
        .join('')}</div>`
    : ''

  const mapaPage = temPaginaMapa
    ? pageSection(`
    ${renderHeader({ ...brand, reportTitle: 'Relatório de Mortalidade', section: 'Distribuição geográfica', sectionLabel: 'Mapa' })}
    <p class="section-kicker">Localização das ocorrências</p>
    <div class="map-row">
      <div class="map-card">
        <div class="chart-heading"><strong>Mapa de mortalidade</strong><span>Cada círculo vermelho representa um registro de morte</span></div>
        <div class="map-body"><div id="mapa-morte"></div></div>
      </div>
    </div>
    ${rankingHtml}
    ${renderFooter({ ...period, page: 3 + diagPageCount, totalPages })}
  `)
    : ''
  const detailPageOffset = 2 + diagPageCount + (temPaginaMapa ? 1 : 0)

  const detailHeader = `<thead><tr><th>Data</th><th>Lote</th><th>Pasto</th><th>Sexo</th><th>Idade</th><th>Peso</th><th>Categoria</th><th>Causa</th><th>Diagnósticos</th></tr></thead>`
  const renderDetailRow = (line, index) =>
    `<tr class="${index % 2 ? '' : 'striped'}"><td>${dateFmt(line.data)}</td><td>${escapeHtml(line.lote_nome)}</td><td>${escapeHtml(line.pasto)}</td><td>${escapeHtml(line.sexo)}</td><td>${escapeHtml(line.idade)}</td><td class="numeric">${numFmt(line.peso_vivo, 0)}</td><td>${escapeHtml(titleCase(line.categoria))}</td><td>${escapeHtml(line.causa_morte)}</td><td><div class="morte-clamp">${escapeHtml(compactDiagnostics(line.diagnosticos))}</div></td></tr>`

  const detailPages = detailChunks
    .map((chunk, chunkIndex) => {
      const startRow = chunkIndex * DETAIL_ROWS_PER_PAGE
      const bodyRows = chunk.map((line, i) => renderDetailRow(line, startRow + i)).join('')
      const isFirstChunk = chunkIndex === 0
      const isLastChunk = chunkIndex === detailChunks.length - 1
      const suffix = detailChunks.length > 1 ? ` (${chunkIndex + 1}/${detailChunks.length})` : ''
      const sectionName = `Detalhamento${suffix}`
      const content = bodyRows
        ? `<div class="table-block"><h2 class="table-title">Registros detalhados <span>${rows.length} registro(s)${isFirstChunk && !isLastChunk ? ` · exibindo ${startRow + 1}–${startRow + chunk.length}` : detailChunks.length > 1 ? ` · exibindo ${startRow + 1}–${startRow + chunk.length}` : ''}</span></h2><table class="morte-detail-table">${detailHeader}<tbody>${bodyRows}</tbody></table></div>`
        : '<div class="empty-chart" style="height:40mm">Nenhum registro detalhado no período</div>'
      return pageSection(`
        ${renderHeader({ ...brand, reportTitle: 'Relatório de Mortalidade', section: sectionName, sectionLabel: 'Registros' })}
        <p class="section-kicker">Rastreabilidade dos registros</p>
        ${content}
        ${renderFooter({ ...period, page: detailPageOffset + chunkIndex + 1, totalPages })}
      `)
    })
    .join('')

  // MapLibre é opcional: se o dist não estiver acessível (nem local nem CDN),
  // o relatório segue sem o script e o init cai no fallback SVG/mensagem.
  let maplibre = { script: '', css: '' }
  if (temPaginaMapa && pontos.length) {
    try {
      maplibre = await getMaplibreAssets()
    } catch {}
  }
  const chartJsScript = await getChartJsScript()
  return htmlDocument({
    title: 'Relatório de Mortalidade',
    extraCss: MORTE_CSS + maplibre.css,
    extraScripts: maplibre.script ? [maplibre.script] : [],
    body: `${page1}${page2}${diagPages}${mapaPage}${detailPages}`,
    chartJsScript,
    chartsInit: CHARTS_INIT_JS + MAP_INIT_JS,
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
      mapa: { pontos, pastos: pastosFC },
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
    const html = await renderMorteHtml(body, { incluirMapa: true })
    console.log('[PDF Morte] HTML montado. Bytes:', Buffer.byteLength(html, 'utf8'))
    const temMapa = body.linhas.some((l) => Number.isFinite(l?.latitude) && Number.isFinite(l?.longitude))
    const pdf = await generatePdf({
      html,
      format: 'A4',
      landscape: true,
      // Flags para WebGL por software no headless; sem elas o MapLibre pode
      // falhar em ambientes sem GPU e cair no fallback SVG.
      launchArgs: temMapa ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [],
      beforePdf: async (page) => {
        await page.waitForFunction('window.__chartsReady === true', { timeout: 15000 }).catch(() => {})
        if (temMapa) {
          await page.waitForFunction('window.__mapReady === true', { timeout: 20000 }).catch(() => {})
        }
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
