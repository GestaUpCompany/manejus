const MAX_LINES = 10000
const MAX_BODY_BYTES = 4000000

function isPDFData(value) {
  if (!value || typeof value !== 'object') return false
  return typeof value.dataInicio === 'string' && typeof value.dataFim === 'string' && typeof value.fazendaNome === 'string' && Array.isArray(value.linhas) && !!value.resumo && typeof value.resumo === 'object'
}

const escapeHtml = (value) => String(value ?? '—')
  .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
  .replace(/"/g, '"').replace(/'/g, '&#039;')
const dateFmt = (value) => {
  if (!value) return '—'
  const parts = value.split('-')
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value
}
const numFmt = (value, digits = 2) => value == null || Number.isNaN(value) ? '—' : value.toFixed(digits).replace('.', ',')
const intFmt = (value) => value == null || Number.isNaN(value) ? '—' : String(Math.round(value))
const moneyFmt = (value) => value == null || Number.isNaN(value) ? '—' : value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const diagLabel = (value) => ({ inchaco: 'Inchaço', fraturas: 'Fraturas', infeccao: 'Infecção', parasitismo: 'Parasitismo', respiratorio: 'Respiratório', digestivo: 'Digestivo', acidente: 'Acidente', desconhecido: 'Desconhecido' }[value] ?? value)
const compactDiagnostics = (items) => {
  if (!items) return '—'
  const labels = Object.values(items).filter(item => item.valor === 'S').map(item => diagLabel(item.chave))
  return labels.length ? labels.join(', ') : '—'
}
const image = (src, alt) => src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">` : ''
function header(data) {
  return `<header class="header"><div class="header-left">${image(data.logoGestao, 'Logo ManejUs 360')}<div><strong class="system">Manej'Us <b>360</b></strong><strong class="title">Relatório de mortalidade</strong>${data.fazendaNome ? `<span class="muted">${escapeHtml(data.fazendaNome)}</span>` : ''}</div></div>${data.logoFazenda ? `<div class="farm-logo">${image(data.logoFazenda, 'Logo da fazenda')}</div>` : ''}</header>`
}
function footer(data) {
  return `<footer><span>Gesta'Up • Relatório de mortalidade • ${dateFmt(data.dataInicio)} a ${dateFmt(data.dataFim)}</span><span class="page-number"></span></footer>`
}
function chart(src) {
  return `<div class="chart-card">${src ? image(src, 'Gráfico do relatório') : '<span class="empty">Sem dados no período</span>'}</div>`
}
function kpi(value, label, sub, red) {
  return `<div class="kpi ${red ? 'red' : ''}"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span>${sub ? `<small>${escapeHtml(sub)}</small>` : ''}</div>`
}

function renderMorteHtml(data) {
  const resumo = data.resumo
  const causa = resumo.causa_mais_frequente ? `${resumo.causa_mais_frequente} (${resumo.causa_mais_frequente_count ?? 0})` : '—'
  const rows = [...data.linhas].sort((a, b) => a.data !== b.data ? b.data.localeCompare(a.data) : (a.lote_nome ?? '').localeCompare(b.lote_nome ?? ''))
  const diagTotal = resumo.frequencia_diagnosticos.reduce((sum, item) => sum + item.valor, 0)
  const diagRows = resumo.frequencia_diagnosticos.map((item, index) => `<tr class="${index % 2 ? '' : 'alt'}"><td>${escapeHtml(diagLabel(item.label))}</td><td>${item.valor}</td><td>${diagTotal ? ((item.valor / diagTotal) * 100).toFixed(1).replace('.', ',') : '0,0'}%</td></tr>`).join('')
  const detailRows = rows.map((line, index) => `<tr class="${index % 2 ? '' : 'alt'}"><td>${dateFmt(line.data)}</td><td>${escapeHtml(line.lote_nome)}</td><td>${escapeHtml(line.pasto)}</td><td>${escapeHtml(line.sexo)}</td><td>${escapeHtml(line.idade)}</td><td>${numFmt(line.peso_vivo, 0)}</td><td>${escapeHtml(line.categoria)}</td><td>${escapeHtml(line.causa_morte)}</td><td>${escapeHtml(compactDiagnostics(line.diagnosticos))}</td></tr>`).join('')
  const previous = resumo.periodo_anterior ? `${intFmt(resumo.periodo_anterior.total_mortes)} mortes` : ''
  const previousSub = resumo.periodo_anterior ? `${dateFmt(resumo.periodo_anterior.data_inicio)} a ${dateFmt(resumo.periodo_anterior.data_fim)}${resumo.periodo_anterior.taxa_mortalidade != null ? ` · Taxa: ${numFmt(resumo.periodo_anterior.taxa_mortalidade)}%` : ''}` : ''
  const secondKpis = resumo.taxa_mortalidade != null || (resumo.perda_estimada != null && resumo.perda_estimada > 0) || resumo.periodo_anterior

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
@page{size:A4 landscape;margin:0}*{box-sizing:border-box}body{margin:0;background:#f5f5f5;color:#1f2937;font-family:Arial,Helvetica,sans-serif;font-size:10px}.page{width:297mm;min-height:210mm;padding:9mm 11mm 16mm;position:relative;page-break-after:always}.page:last-child{page-break-after:auto}.header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0f6437;padding-bottom:4mm;margin-bottom:4mm}.header-left{display:flex;align-items:center;gap:8px}.header-left img{width:40px;height:40px;object-fit:contain}.system{display:block;font-size:12px}.system b{color:#b7791f}.title{display:block;color:#0f6437;font-size:16px;margin-top:2px}.muted,footer{color:#6b7280;font-size:9px}.farm-logo img{width:80px;height:45px;object-fit:contain}.eyebrow{font-size:8px;letter-spacing:1px;text-transform:uppercase;font-weight:bold;color:#0f6437;margin:0 0 2mm}.period{display:inline-block;background:white;border:1px solid #e5e7eb;border-radius:6px;padding:4px 10px;font-weight:bold;margin-bottom:3mm}.insight{background:#fff;border:1px solid #e5e7eb;border-left:3px solid #0f6437;border-radius:4px;padding:8px;margin-bottom:3mm;line-height:1.45}.insight label{display:block;color:#0f6437;font-weight:bold;font-size:7px;letter-spacing:.6px;text-transform:uppercase;margin-bottom:3px}.kpis{display:flex;gap:6px;margin-bottom:6px}.kpi{flex:1;background:#fff;border:1px solid #d1d5db;border-top:3px solid #0f6437;border-radius:5px;padding:7px;text-align:center;min-height:46px}.kpi.red{border-top-color:#ef4444}.kpi strong,.kpi span,.kpi small{display:block}.kpi strong{font-size:16px;color:#0f6437}.kpi.red strong{color:#ef4444}.kpi span{font-size:8px;color:#6b7280;margin-top:2px}.kpi small{font-size:7px;color:#6b7280;margin-top:1px}.charts{display:flex;gap:8px;height:78mm}.chart-card{flex:1;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:5px;display:flex;align-items:center;justify-content:center}.chart-card img{width:100%;height:100%;object-fit:contain}.empty{color:#6b7280;font-size:9px}.charts-title{font-size:14px;margin:0 0 3mm}.table-title{font-size:12px;margin:0 0 2mm}.table-wrap{margin-top:5mm}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#0f6437;color:#fff;font-size:8px;padding:5px 2px}td{font-size:7px;padding:4px 2px;text-align:center;border-bottom:1px solid #e5e7eb;overflow-wrap:anywhere}td:first-child{text-align:left;padding-left:4px}.alt{background:#f9fafb}th:nth-child(1),td:nth-child(1){width:8%}th:nth-child(2),td:nth-child(2){width:10%}th:nth-child(3),td:nth-child(3){width:8%}th:nth-child(4),td:nth-child(4){width:7%}th:nth-child(5),td:nth-child(5){width:7%}th:nth-child(6),td:nth-child(6){width:8%}th:nth-child(7),td:nth-child(7){width:10%}th:nth-child(8),td:nth-child(8){width:10%}th:nth-child(9),td:nth-child(9){width:32%}footer{position:absolute;bottom:6mm;left:11mm;right:11mm;border-top:1px solid #d1d5db;padding-top:2mm;display:flex;justify-content:space-between}footer .page-number:after{content:'Página ' counter(page) ' de ' counter(pages)}
</style></head><body>
<section class="page">${header(data)}<p class="eyebrow">Resumo executivo</p><div class="period">${dateFmt(data.dataInicio)} &nbsp; a &nbsp; ${dateFmt(data.dataFim)}</div>${resumo.insights ? `<div class="insight"><label>Análise do período</label>${escapeHtml(resumo.insights)}</div>` : ''}<div class="kpis">${kpi(intFmt(resumo.total_mortes), 'Total de mortes')}${kpi(numFmt(resumo.media_por_dia), 'Mortes/dia (média)')}${kpi(numFmt(resumo.peso_medio, 1), 'Peso médio (kg)')}${kpi(causa, 'Causa mais frequente')}</div>${secondKpis ? `<div class="kpis">${kpi(resumo.taxa_mortalidade != null ? `${numFmt(resumo.taxa_mortalidade)}%` : '—', 'Taxa de mortalidade', resumo.rebanho_total ? `Rebanho: ${intFmt(resumo.rebanho_total)} cab.` : '')}${kpi(resumo.perda_estimada != null && resumo.perda_estimada > 0 ? `R$ ${moneyFmt(resumo.perda_estimada)}` : '—', 'Perda estimada', resumo.peso_total_perdido ? `${numFmt(resumo.peso_total_perdido, 0)} kg perdidos` : '', true)}${kpi(previous, 'Período anterior', previousSub)}</div>` : ''}<div class="charts">${chart(data.chartTempo)}${chart(data.chartCausa)}</div>${footer(data)}</section>
<section class="page">${header(data)}<p class="eyebrow">Análise de distribuição</p><h2 class="charts-title">Distribuição das mortes</h2><div class="charts">${chart(data.chartCategoria)}${chart(data.chartSexo)}</div>${footer(data)}</section>
${diagRows || detailRows ? `<section class="page">${header(data)}<p class="eyebrow">Detalhamento</p>${diagRows ? `<h2 class="table-title">Frequência de diagnósticos</h2><table><thead><tr><th style="width:60%;text-align:left;padding-left:4px">Diagnóstico</th><th style="width:25%">Mortes</th><th style="width:15%">%</th></tr></thead><tbody>${diagRows}</tbody></table>` : ''}${detailRows ? `<div class="table-wrap"><h2 class="table-title">Registros detalhados</h2><table><thead><tr><th>Data</th><th>Lote</th><th>Pasto</th><th>Sexo</th><th>Idade</th><th>Peso (kg)</th><th>Categoria</th><th>Causa</th><th>Diagnósticos</th></tr></thead><tbody>${detailRows}</tbody></table></div>` : ''}${footer(data)}</section>` : ''}</body></html>`
}

module.exports = async function handler(req, res) {
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

  let browser
  try {
    const chromium = require('@sparticuz/chromium')
    const puppeteer = require('puppeteer-core')

    const isVercel = Boolean(process.env.VERCEL)
    const executablePath = isVercel ? await chromium.executablePath() : process.env.PUPPETEER_EXECUTABLE_PATH
    if (!executablePath) {
      throw new Error('PUPPETEER_EXECUTABLE_PATH não está configurado para execução local')
    }
    browser = await puppeteer.launch({
      args: isVercel ? chromium.args : [],
      defaultViewport: { width: 1280, height: 900 },
      executablePath,
      headless: true,
    })
    const page = await browser.newPage()
    await page.setContent(renderMorteHtml(body), { waitUntil: 'load' })
    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-mortalidade.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).send(Buffer.from(pdf))
  } catch (error) {
    console.error('Erro ao gerar relatório de mortalidade com Puppeteer:', error)
    return res.status(500).json({ error: 'Não foi possível gerar o PDF', detail: String(error) })
  } finally {
    if (browser) await browser.close()
  }
}
