import { escapeHtml, dateFmt } from './formatters.js'
import { REPORT_REGISTRY } from './reportRegistry.js'
import { BASE_CSS } from './template.js'

const COVER_CSS = `
.cover-page{padding:0;overflow:hidden;color:#fff;background:linear-gradient(135deg,#083f2a 0%,#0b6a42 45%,#153b59 100%)}
.cover-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cover-overlay{position:absolute;inset:0;background:linear-gradient(100deg,rgba(5,42,28,.95) 0%,rgba(11,106,66,.79) 48%,rgba(21,59,89,.58) 100%)}
.cover-shape{position:absolute;width:145mm;height:145mm;border:1px solid rgba(255,255,255,.13);border-radius:50%;right:-48mm;top:-52mm}
.cover-shape.second{width:90mm;height:90mm;right:17mm;top:128mm}
.cover-content{position:relative;height:100%;padding:18mm 20mm 13mm;display:flex;flex-direction:column;z-index:1}
.cover-brand{display:flex;align-items:center;gap:12px}
.cover-brand img{width:64px;height:64px;object-fit:contain;background:rgba(255,255,255,.96);border-radius:12px;padding:5px}
.cover-brand-name{font-size:22px;font-weight:700;letter-spacing:.2px}.cover-brand-name b{color:#e2aa3d}
.cover-main{flex:1;display:flex;flex-direction:column;justify-content:center;max-width:185mm}
.cover-kicker{font-size:12px;letter-spacing:2.5px;text-transform:uppercase;color:#cce4d6;font-weight:700;margin-bottom:5mm}
.cover-title{font-size:44px;line-height:1.05;font-weight:700;margin:0 0 4mm}
.cover-subtitle{font-size:23px;color:#d8e9df;margin-bottom:10mm}
.cover-period{display:inline-flex;align-self:flex-start;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);border-radius:7px;padding:9px 14px;font-size:17px;font-weight:700}
.cover-footer{display:flex;align-items:flex-end;justify-content:space-between;border-top:1px solid rgba(255,255,255,.28);padding-top:5mm}
.cover-organizations{display:flex;align-items:center;gap:14px}.cover-logo-box{height:20mm;min-width:30mm;max-width:50mm;background:rgba(255,255,255,.94);border-radius:7px;padding:5px;display:flex;align-items:center;justify-content:center}.cover-logo-box img{max-width:100%;max-height:100%;object-fit:contain}
.cover-farm{font-size:15px;font-weight:700}.cover-farm span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#cce4d6;margin-bottom:3px}
.cover-page-number{font-size:10px;color:#d5e4dc;align-self:flex-end}
.empty-report-content{height:120mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:#f7faf8;border:1px solid #dce5df;border-radius:8px}.empty-report-content strong{font-size:24px;color:#0b6a42;margin-bottom:8px}.empty-report-content span{font-size:14px;color:#718078}
`

function extractDocument(html) {
  const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''
  const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? ''
  return { style, body }
}

function countPages(body) {
  return (body.match(/<section class="page(?:\s[^"]*)?">/g) ?? []).length
}

function renumberPages(body, offset, totalPages) {
  let page = offset
  return body.replace(/Página \d+ de \d+/g, () => `Página ${++page} de ${totalPages}`)
}

function image(src, alt, className = '') {
  return src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" class="${className}">` : ''
}

function renderCover({ fazendaNome, logoGestao, logoFazenda, logoEmpresa, imagemCapa, periodoLabel, totalPages }) {
  return `<section class="page cover-page">
    ${image(imagemCapa, 'Imagem de capa', 'cover-bg')}
    <div class="cover-overlay"></div><div class="cover-shape"></div><div class="cover-shape second"></div>
    <div class="cover-content">
      <div class="cover-brand">${image(logoGestao, 'ManejUs 360')}<div class="cover-brand-name">Manej'Us <b>360</b></div></div>
      <div class="cover-main"><div class="cover-kicker">Gestão integrada da fazenda</div><h1 class="cover-title">Relatórios Mensais</h1><div class="cover-subtitle">Registros Operacionais</div><div class="cover-period">${escapeHtml(periodoLabel)}</div></div>
      <div class="cover-footer"><div class="cover-organizations"><div class="cover-logo-box">${image(logoEmpresa, 'GestaUp Company')}</div>${logoFazenda ? `<div class="cover-logo-box">${image(logoFazenda, 'Logo da fazenda')}</div>` : ''}<div class="cover-farm"><span>Fazenda</span>${escapeHtml(fazendaNome)}</div></div><div class="cover-page-number">Página 1 de ${totalPages}</div></div>
    </div>
  </section>`
}

function renderEmpty({ title, dados, page, totalPages }) {
  const inicio = dados.dataInicio ?? dados.filtros?.dataInicio ?? ''
  const fim = dados.dataFim ?? dados.filtros?.dataFim ?? ''
  return `<section class="page"><header class="report-header"><div class="brand-block">${image(dados.logoGestao, 'ManejUs 360', 'brand-logo')}<div><div class="brand-name">Manej'Us <b>360</b></div><div class="report-title">${escapeHtml(title)}</div><div class="farm-name">${escapeHtml(dados.fazendaNome ?? '')}</div></div></div><div class="header-right">${image(dados.logoFazenda, 'Logo da fazenda', 'farm-logo')}</div></header><p class="section-kicker">Resumo do período</p><div class="period-badge">${dateFmt(inicio)} <span style="padding:0 7px;color:#9bb1a4">até</span> ${dateFmt(fim)}</div><div class="empty-report-content"><strong>Sem registros no período</strong><span>Não foram encontrados dados para esta seção nas datas selecionadas.</span></div><footer class="report-footer"><span>Gesta'Up · ${dateFmt(inicio)} a ${dateFmt(fim)}</span><span>Página ${page} de ${totalPages}</span></footer></section>`
}

export async function composeReports({ reports, cover }) {
  const rendered = []
  for (const report of reports) {
    const adapter = REPORT_REGISTRY[report.tipo]
    if (!adapter.hasData(report.dados)) {
      rendered.push({ adapter, dados: report.dados, empty: true, pages: 1, style: '', body: '' })
      continue
    }
    const document = extractDocument(await adapter.render(report.dados))
    rendered.push({ adapter, dados: report.dados, empty: false, pages: countPages(document.body), ...document })
  }

  const totalPages = 1 + rendered.reduce((sum, report) => sum + report.pages, 0)
  let offset = 1
  const bodies = []
  for (const report of rendered) {
    if (report.empty) {
      bodies.push(renderEmpty({ title: report.adapter.title, dados: report.dados, page: offset + 1, totalPages }))
    } else {
      bodies.push(renumberPages(report.body, offset, totalPages))
    }
    offset += report.pages
  }

  const styles = rendered.map((report) => report.style).filter(Boolean).join('\n')
  const coverHtml = renderCover({ ...cover, totalPages })
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatórios Mensais</title><style>${BASE_CSS}${styles}${COVER_CSS}</style></head><body>${coverHtml}${bodies.join('')}<script>window.__chartsReady=true</script></body></html>`
}
