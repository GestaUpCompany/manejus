import { escapeHtml } from './_shared/formatters.js'
import { htmlDocument, page as pageSection, renderHeader } from './_shared/template.js'

const BOLETIM_CSS = `
.boletim-table{margin-top:3mm;border-radius:6px;overflow:hidden}
.boletim-table th,.boletim-table td{text-align:right;white-space:nowrap;padding:4px 4px;font-size:10px}
.boletim-table th:first-child,.boletim-table td:first-child{text-align:left;width:13%}
.boletim-table th{font-size:9px;line-height:1.15;vertical-align:middle}
.boletim-table td{font-size:10px}
.boletim-table tbody tr:nth-child(even){background:#f7faf8}
.boletim-table tbody tr:last-child{background:#eef5f0;font-weight:700}
.boletim-table tbody tr:last-child td{color:#0b6a42;border-top:1.5px solid #bcd3c4}
.boletim-note{margin-top:2mm;color:#718078;font-size:9px}
.boletim-intro{margin:0 0 3mm;color:#52635a;font-size:11px}
.saldo-final-resumo{margin-top:2.5mm}
.saldo-local-card{border:1px solid #dce5df;border-radius:6px;padding:3mm 5mm;background:#fff}
.saldo-local-header{display:flex;align-items:center;justify-content:space-between;gap:6mm;margin-bottom:2mm}
.saldo-local-title{font-size:13px;font-weight:700;color:#30463a}
.saldo-final-kpi{display:flex;align-items:center;gap:2mm;border-radius:4px;background:#eef5f0;border:1px solid #bcd3c4;padding:1.5mm 4mm;white-space:nowrap}
.saldo-final-kpi .saldo-valor{font-size:17px;font-weight:700;color:#0b6a42;line-height:1;font-variant-numeric:tabular-nums}
.saldo-final-kpi .saldo-label{font-size:11px;color:#52635a}
.saldo-local-row{display:grid;grid-template-columns:28mm 1fr 20mm;align-items:center;gap:3mm;height:6mm}
.saldo-local-label{font-size:10px;color:#52635a;font-weight:700}.saldo-local-track{height:70%;min-height:2.4mm;background:#eef3f0;border-radius:1mm;overflow:hidden}.saldo-local-bar{height:100%;background:#2f8f68;border-radius:1mm}.saldo-local-value{font-size:10px;color:#0b6a42;text-align:right;font-variant-numeric:tabular-nums}
.saldo-local-card--denso .saldo-local-label,.saldo-local-card--denso .saldo-local-value{font-size:9px}
`

const COLUMNS = [
  ['inic', 'Saldo inicial'],
  ['com', 'Compras'],
  ['vend', 'Vendas'],
  ['mort', 'Mortes'],
  ['cons', 'Consumo'],
  ['nasc', 'Nascimentos'],
  ['ent', 'Transf. entrada'],
  ['sai', 'Transf. saída'],
  ['evolMais', 'Evol. entrada'],
  ['evolMenos', 'Evol. saída'],
  ['final', 'Saldo final'],
]

function formatValue(value) {
  return value == null || Number.isNaN(Number(value)) ? '-' : Math.round(Number(value)).toLocaleString('pt-BR')
}

function totalizar(registros) {
  return Object.fromEntries(COLUMNS.map(([campo]) => {
    const valores = registros.map((registro) => registro[campo]).filter((value) => value != null && Number.isFinite(Number(value)))
    return [campo, valores.length ? valores.reduce((sum, value) => sum + Number(value), 0) : null]
  }))
}

const LOCAL_LABELS = {
  'Confinamento': 'CONF',
  'Fazenda SEDE': 'SEDE',
  'Arrendamento Califórnia': 'CALIF',
  'Fazenda Serra': 'SERRA',
  'Retiro Nova': 'NOVA',
  'Arrendamento São João': 'SJOÃO',
  'Retiro do Meio': 'MEIO',
}

function saldoFinalLocal(local) {
  return totalizar(local.registros).final
}

function renderSaldoFinalResumo(dados) {
  const saldoGeral = totalizar(dados.geral).final
  const locais = (dados.locaisGeral ?? [])
    .map((local) => ({ ...local, saldoFinal: saldoFinalLocal(local) }))
    .filter((local) => local.saldoFinal != null)
    .sort((a, b) => Number(b.saldoFinal) - Number(a.saldoFinal))
  const maiorSaldo = Math.max(Number(saldoGeral ?? 0), ...locais.map((local) => Number(local.saldoFinal ?? 0)), 1)
  const alturaLinha = Math.min(6, Math.max(3.2, 36 / Math.max(locais.length, 1)))
  const classeDensidade = alturaLinha < 4.8 ? ' saldo-local-card--denso' : ''
  const barras = locais.map((local) => {
    const largura = Math.max((Number(local.saldoFinal) / maiorSaldo) * 100, 0)
    const label = LOCAL_LABELS[local.fazenda] ?? local.fazenda
    return `<div class="saldo-local-row" style="height:${alturaLinha.toFixed(1)}mm"><span class="saldo-local-label">${escapeHtml(label)}</span><div class="saldo-local-track"><div class="saldo-local-bar" style="width:${largura.toFixed(2)}%"></div></div><span class="saldo-local-value">${formatValue(local.saldoFinal)}</span></div>`
  }).join('')
  return `<div class="saldo-final-resumo"><div class="saldo-local-card${classeDensidade}"><div class="saldo-local-header"><span class="saldo-local-title">Saldo final por local</span><span class="saldo-final-kpi"><span class="saldo-label">Saldo final geral</span><span class="saldo-valor">${formatValue(saldoGeral)}</span></span></div>${barras}</div></div>`
}

function renderTable(registros) {
  const total = totalizar(registros)
  const rows = registros.map((registro, index) => `<tr class="${index % 2 ? 'striped' : ''}"><td>${escapeHtml(registro.descricao)}</td>${COLUMNS.map(([campo]) => `<td class="numeric">${formatValue(registro[campo])}</td>`).join('')}</tr>`).join('')
  const totalRow = `<tr><td>Total do rebanho</td>${COLUMNS.map(([campo]) => `<td class="numeric">${formatValue(total[campo])}</td>`).join('')}</tr>`
  return `<table class="boletim-table"><thead><tr><th>Categoria</th>${COLUMNS.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${rows}${totalRow}</tbody></table>`
}

function renderFooter({ mes, ano }) {
  return `<footer class="report-footer"><span>Gesta'Up · Boletim de Rebanho · ${escapeHtml(mes)} de ${ano}</span><span>Página 1 de 1</span></footer>`
}

function renderPage({ dados, registros, section, sectionLabel }) {
  const resumoSaldo = section === 'Resumo geral' ? renderSaldoFinalResumo(dados) : ''
  const content = `${renderHeader({ logoGestao: dados.logoGestao, logoFazenda: dados.logoFazenda, fazendaNome: dados.fazendaNome, reportTitle: 'Boletim de Rebanho', section, sectionLabel })}<p class="section-kicker">Composição do rebanho</p><p class="period-badge">${escapeHtml(section === 'Resumo geral' ? `Consolidado anual · ${dados.ano}` : `${dados.mesReferencia} de ${dados.ano}`)}</p><p class="boletim-intro">Quantidade de animais por categoria e movimentação registrada na fonte do boletim.</p>${renderTable(registros)}${resumoSaldo}<p class="boletim-note">Células sem registro na planilha são exibidas como -.</p>${renderFooter({ mes: section === 'Resumo geral' ? `Consolidado anual` : dados.mesReferencia, ano: dados.ano })}`
  return pageSection(content)
}

export function renderBoletimRebanhoHtml(dados) {
  const paginas = [renderPage({ dados, registros: dados.geral, section: 'Resumo geral', sectionLabel: 'Aba GERAL' })]
  for (const local of dados.locais) {
    paginas.push(renderPage({ dados, registros: local.registros, section: local.fazenda, sectionLabel: `Mês de referência: ${dados.mesReferencia}` }))
  }
  return htmlDocument({ title: 'Boletim de Rebanho', extraCss: BOLETIM_CSS, body: paginas.join('') })
}
