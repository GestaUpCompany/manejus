// Template HTML base para relatórios Puppeteer.
//
// A ideia é que cada relatório monte seu HTML combinando:
//   - BASE_CSS: reset, tipografia, .page, header/footer, kpi-card, chart-card,
//     tabela genérica, section-kicker, period-badge, insight-box.
//   - Componentes reutilizáveis: renderHeader, renderFooter, kpi(), page().
//   - CSS extra específico do relatório (heatmap, tabelas com larguras próprias,
//     grids de página customizados) passado em `extraCss` para htmlDocument().
//
// A paleta segue o visual atual do relatório de morte, que já converge com o
// verde-escuro (#0b6a42) usado nos relatórios jsPDF pelo relatorioHeaderPDF.ts.
// Novos relatórios ganham consistência de graça e podem ser migrados para
// Puppeteer sem redesenhar CSS.

import { escapeHtml, dateFmt } from './formatters.js'

export const BASE_CSS = `
@page{size:A4 landscape;margin:0}
*{box-sizing:border-box}
body{margin:0;background:#e9eeeb;color:#26352e;font-family:Arial,Helvetica,sans-serif;font-size:14px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:297mm;height:210mm;background:#fff;padding:12mm 14mm 16mm;position:relative;page-break-after:always;overflow:hidden}
.page:last-child{page-break-after:auto}
.report-header{height:22mm;display:flex;align-items:center;justify-content:space-between;border-bottom:1.5px solid #cfdad3;margin-bottom:5mm;padding-bottom:4mm}
.brand-block{display:flex;align-items:center;gap:10px}
.brand-logo{width:60px;height:60px;object-fit:contain}
.brand-name{color:#26352e;font-size:16px;font-weight:700;line-height:1.1}
.brand-name b{color:#c28a27}
.report-title{color:#0b6a42;font-size:26px;font-weight:700;line-height:1.2;margin-top:2px}
.farm-name{color:#718078;font-size:13px;margin-top:3px}
.header-right{display:flex;align-items:center;gap:12px}
.farm-logo{width:60px;height:60px;object-fit:contain}
.header-section{text-align:right;border-left:1px solid #d8e0db;padding-left:12px;color:#7a8981;font-size:11px;text-transform:uppercase;letter-spacing:1px}
.header-section strong{display:block;color:#0b6a42;font-size:13px;margin-top:4px;letter-spacing:.2px}
.section-kicker{color:#0b6a42;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 2mm}
.period-badge{display:inline-flex;align-items:center;background:#f0f6f2;border:1px solid #d3e4d9;border-radius:5px;color:#0b6a42;font-size:14px;font-weight:700;padding:6px 11px;margin-bottom:4mm}
.insight-box{border-left:3px solid #0b6a42;background:#f6f9f7;border-radius:0 5px 5px 0;padding:7px 10px;margin-bottom:3mm;line-height:1.4;color:#52635a}
.insight-label{display:block;color:#0b6a42;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:3px}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:7px}
.kpi-grid.secondary{grid-template-columns:repeat(3,1fr)}
.kpi-card{min-height:23mm;border:1px solid #dce5df;border-top:3px solid #0b6a42;border-radius:5px;padding:7px 9px;background:#fff}
.kpi-card.tone-red{border-top-color:#c94d46}
.kpi-card.tone-gold{border-top-color:#c28a27}
.kpi-value{color:#0b6a42;font-size:18px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tone-red .kpi-value{color:#c94d46}
.tone-gold .kpi-value{color:#9a6b17}
.kpi-label{color:#63736a;font-size:12px;margin-top:5px}
.kpi-sub{color:#8a9890;font-size:11px;margin-top:2px}
.chart-card{height:75mm;border:1px solid #dce5df;border-radius:6px;padding:8px;background:#fff;overflow:hidden;display:flex;flex-direction:column}
.chart-heading{height:8mm;display:flex;flex-direction:column;gap:2px}
.chart-heading strong{font-size:16px;color:#30463a}
.chart-heading span{font-size:13px;color:#63736a}
.chart-body{flex:1;min-height:0;position:relative}
.chart-body canvas{width:100%!important;height:100%!important;display:block}
.empty-chart{flex:1;display:flex;align-items:center;justify-content:center;color:#93a099;font-size:13px;background:#fafcfb;border-radius:4px}
.table-title{display:flex;align-items:center;justify-content:space-between;color:#30463a;font-size:14px;margin:0 0 3mm}
.table-title span{font-size:12px;color:#8a9890;font-weight:400}
.table-block{margin-bottom:6mm}
table{width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid #dce5df;border-radius:5px;overflow:hidden}
th{background:#0b6a42;color:#fff;font-size:11px;font-weight:700;text-align:left;padding:6px 5px;letter-spacing:.15px}
td{color:#4f5f56;font-size:11px;padding:5px;border-bottom:1px solid #e5ebe7;vertical-align:top;overflow-wrap:anywhere}
td.numeric{text-align:right;font-variant-numeric:tabular-nums}
.striped{background:#f7faf8}
.report-footer{position:absolute;bottom:7mm;left:14mm;right:14mm;border-top:1px solid #dce5df;padding-top:3mm;color:#84938a;font-size:11px;display:flex;justify-content:space-between}
`

const imageTag = (src, alt, className = '') =>
  src ? `<img class="${className}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">` : ''

/**
 * Renderiza o cabeçalho padrão: logo do Manejus, logo da fazenda, título do
 * relatório à esquerda e "seção" atual à direita (ex: "Resumo executivo").
 */
export function renderHeader({ logoGestao, logoFazenda, fazendaNome, reportTitle, section, sectionLabel }) {
  const right = `<div class="header-right">${logoFazenda ? imageTag(logoFazenda, 'Logo da fazenda', 'farm-logo') : ''}${
    section
      ? `<div class="header-section"><span>${escapeHtml(sectionLabel ?? '')}</span><strong>${escapeHtml(section)}</strong></div>`
      : ''
  }</div>`
  return `<header class="report-header"><div class="brand-block">${imageTag(logoGestao, 'Logo ManejUs 360', 'brand-logo')}<div><div class="brand-name">Manej'Us <b>360</b></div><div class="report-title">${escapeHtml(reportTitle)}</div><div class="farm-name">${escapeHtml(fazendaNome)}</div></div></div>${right}</header>`
}

/**
 * Rodapé padrão com período e paginação "Página X de Y".
 */
export function renderFooter({ dataInicio, dataFim, page, totalPages }) {
  return `<footer class="report-footer"><span>Gesta'Up · ${dateFmt(dataInicio)} a ${dateFmt(dataFim)}</span><span>Página ${page} de ${totalPages}</span></footer>`
}

/**
 * Cartão de KPI. tone ∈ {'green'|'red'|'gold'}. `sub` opcional.
 */
export function kpi(value, label, sub = '', tone = 'green') {
  return `<div class="kpi-card tone-${tone}"><div class="kpi-value">${escapeHtml(value)}</div><div class="kpi-label">${escapeHtml(label)}</div>${sub ? `<div class="kpi-sub">${escapeHtml(sub)}</div>` : ''}</div>`
}

/**
 * Envolve conteúdo em uma <section class="page"> pronta para o page-break do CSS.
 */
export function page(content) {
  return `<section class="page">${content}</section>`
}

/**
 * Cartão de gráfico com título/subtítulo e um <canvas> nomeado. Se `hasData`
 * for false, renderiza um placeholder "Sem dados no período".
 */
export function chartCard({ canvasId, title, subtitle = '', hasData = true, height }) {
  const style = height ? ` style="height:${height}"` : ''
  const body = hasData
    ? `<div class="chart-body"><canvas id="${escapeHtml(canvasId)}"></canvas></div>`
    : '<div class="empty-chart">Sem dados no período</div>'
  return `<div class="chart-card"${style}><div class="chart-heading"><strong>${escapeHtml(title)}</strong>${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ''}</div>${body}</div>`
}

/**
 * Monta o documento HTML completo. `chartJsScript` é o conteúdo do UMD do
 * Chart.js (via getChartJsScript()); `chartsInit` é o JS que roda no browser
 * headless para desenhar os gráficos usando `dataJson` como fonte de dados.
 */
export function htmlDocument({ title, extraCss = '', body, chartJsScript = '', chartsInit = '', dataJson = null }) {
  const dataScript = dataJson
    ? `<script>window.__reportData=${JSON.stringify(dataJson).replace(/</g, '\\u003c')};</script>`
    : ''
  const chartsScript = chartJsScript
    ? `<script>${chartJsScript}</script>${chartsInit ? `<script>${chartsInit}</script>` : ''}`
    : ''
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${BASE_CSS}${extraCss}</style></head><body>${body}${dataScript}${chartsScript}</body></html>`
}
